/**
 * P3-C: Minimal job executor using ActionGate
 * All side effects go through ActionGate (structurally enforced)
 *
 * P0.4: Enforces maxConcurrentJobs limit for DoS resistance
 */

import { ActionGate } from '../action-gate';
import { JobCheckpoint } from 'mathison-storage';
import { randomUUID } from 'crypto';
import { GovernanceReasonCode } from '../action-gate/reason-codes';

export interface JobRequest {
  jobType: string;
  inputs?: unknown;
  policyId?: string;
  jobId?: string;
}

export interface JobResult {
  job_id: string;
  status: string;
  resumable: boolean;
  outputs?: unknown;
  decision?: string;
  error?: string;
  genome_id?: string;
  genome_version?: string;
  reason_code?: string;  // P0.4: Reason code for denials
}

/**
 * P0.4: Simple semaphore for concurrency control
 * Provides deterministic denial when limit is reached (fail-closed)
 */
class ConcurrencySemaphore {
  private currentCount: number = 0;
  private maxCount: number;
  private perActorCounts: Map<string, number> = new Map();
  private maxPerActor: number;

  constructor(maxCount: number, maxPerActor?: number) {
    this.maxCount = maxCount;
    this.maxPerActor = maxPerActor ?? Math.ceil(maxCount / 4); // Default: 25% of total limit per actor
  }

  /**
   * Try to acquire a slot for the given actor
   * Returns true if acquired, false if limit reached
   */
  tryAcquire(actor: string): { acquired: boolean; reason?: string } {
    // Check global limit
    if (this.currentCount >= this.maxCount) {
      return {
        acquired: false,
        reason: `Global concurrency limit reached (${this.currentCount}/${this.maxCount})`
      };
    }

    // Check per-actor limit
    const actorCount = this.perActorCounts.get(actor) ?? 0;
    if (actorCount >= this.maxPerActor) {
      return {
        acquired: false,
        reason: `Per-actor concurrency limit reached (${actorCount}/${this.maxPerActor})`
      };
    }

    // Acquire slot
    this.currentCount++;
    this.perActorCounts.set(actor, actorCount + 1);
    return { acquired: true };
  }

  /**
   * Release a slot for the given actor
   */
  release(actor: string): void {
    if (this.currentCount > 0) {
      this.currentCount--;
    }

    const actorCount = this.perActorCounts.get(actor) ?? 0;
    if (actorCount > 0) {
      this.perActorCounts.set(actor, actorCount - 1);
    }
  }

  /**
   * Get current status
   */
  getStatus(): { current: number; max: number; perActor: Record<string, number> } {
    return {
      current: this.currentCount,
      max: this.maxCount,
      perActor: Object.fromEntries(this.perActorCounts)
    };
  }
}

export class JobExecutor {
  private actionGate: ActionGate;
  private jobTimeout: number; // milliseconds
  private maxConcurrentJobs: number;
  private concurrencySemaphore: ConcurrencySemaphore;

  constructor(actionGate: ActionGate, options?: {
    jobTimeout?: number;
    maxConcurrentJobs?: number;
    maxPerActorJobs?: number;
  }) {
    this.actionGate = actionGate;
    this.jobTimeout = options?.jobTimeout ?? 30000; // 30s default
    this.maxConcurrentJobs = options?.maxConcurrentJobs ?? 100;

    // P0.4: Initialize concurrency semaphore
    this.concurrencySemaphore = new ConcurrencySemaphore(
      this.maxConcurrentJobs,
      options?.maxPerActorJobs
    );

    console.log(`📊 JobExecutor: maxConcurrentJobs=${this.maxConcurrentJobs}, timeout=${this.jobTimeout}ms`);
  }

  /**
   * Get concurrency status (for monitoring)
   */
  getConcurrencyStatus(): { current: number; max: number; perActor: Record<string, number> } {
    return this.concurrencySemaphore.getStatus();
  }

  /**
   * Execute with timeout protection
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Job execution timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Run a new job (or resume existing if jobId provided)
   * P0.4: Enforces concurrency limit (fail-closed denial when limit reached)
   */
  async runJob(actor: string, request: JobRequest, genomeId?: string, genomeVersion?: string): Promise<JobResult> {
    const jobId = request.jobId ?? `job-${randomUUID()}`;

    // P0.4: Concurrency enforcement (fail-closed)
    const acquireResult = this.concurrencySemaphore.tryAcquire(actor);
    if (!acquireResult.acquired) {
      return {
        job_id: jobId,
        status: 'error',
        resumable: true,  // Client can retry later
        error: acquireResult.reason,
        reason_code: 'JOB_CONCURRENCY_LIMIT',
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }

    // Ensure we release the slot when done (even on error)
    try {
      return await this.runJobInternal(actor, request, jobId, genomeId, genomeVersion);
    } finally {
      this.concurrencySemaphore.release(actor);
    }
  }

  /**
   * Internal job execution (after concurrency slot acquired)
   */
  private async runJobInternal(
    actor: string,
    request: JobRequest,
    jobId: string,
    genomeId?: string,
    genomeVersion?: string
  ): Promise<JobResult> {
    // Check if job already exists
    const existing = await this.actionGate.loadCheckpoint(jobId);
    if (existing && !request.jobId) {
      // New run request but job exists → deny (idempotency violation)
      return {
        job_id: jobId,
        status: 'error',
        resumable: false,
        error: 'Job ID collision - use explicit jobId to resume'
      };
    }

    if (existing) {
      // Resume existing job
      return this.resumeJobInternal(actor, jobId, genomeId, genomeVersion);
    }

    // Create new job checkpoint via ActionGate
    const checkpoint: JobCheckpoint = {
      job_id: jobId,
      job_type: request.jobType,
      status: 'running',
      current_stage: 'init',
      completed_stages: [],
      inputs: request.inputs,
      timestamps: {
        created: new Date().toISOString(),
        started: new Date().toISOString()
      }
    };

    const createResult = await this.actionGate.createCheckpoint(actor, checkpoint, genomeId, genomeVersion);

    if (!createResult.success) {
      return {
        job_id: jobId,
        status: 'error',
        resumable: false,
        error: createResult.governance.message,
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }

    // Execute job stages (minimal implementation) with timeout protection
    try {
      await this.withTimeout((async () => {
        // Stage 1: Process inputs
        checkpoint.current_stage = 'process';
        checkpoint.completed_stages = ['init'];
        await this.actionGate.saveCheckpoint(actor, checkpoint, genomeId, genomeVersion);

        // Simulate processing
        const outputs = {
          processed: true,
          input_count: request.inputs ? Object.keys(request.inputs as object).length : 0,
          timestamp: new Date().toISOString()
        };

        // Stage 2: Complete
        checkpoint.current_stage = null;
        checkpoint.status = 'completed';
        checkpoint.completed_stages = ['init', 'process'];
        checkpoint.stage_outputs = { final: outputs };
        checkpoint.timestamps!.completed = new Date().toISOString();

        await this.actionGate.saveCheckpoint(actor, checkpoint, genomeId, genomeVersion);
      })(), this.jobTimeout);

      return {
        job_id: jobId,
        status: 'completed',
        resumable: false,
        outputs: checkpoint.stage_outputs?.final,
        decision: 'ALLOW',
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    } catch (error) {
      // Mark as failed but resumable
      checkpoint.status = 'failed';
      checkpoint.error = {
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof Error && error.message === 'Job execution timeout' ? 'TIMEOUT' : 'EXECUTION_ERROR'
      };
      checkpoint.timestamps!.failed = new Date().toISOString();

      await this.actionGate.saveCheckpoint(actor, checkpoint, genomeId, genomeVersion);

      return {
        job_id: jobId,
        status: 'failed',
        resumable: true,
        error: checkpoint.error.message,
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }
  }

  /**
   * Resume an existing job from checkpoint
   * P0.4: Enforces concurrency limit (fail-closed denial when limit reached)
   */
  async resumeJob(actor: string, jobId: string, genomeId?: string, genomeVersion?: string): Promise<JobResult> {
    // P0.4: Concurrency enforcement (fail-closed)
    const acquireResult = this.concurrencySemaphore.tryAcquire(actor);
    if (!acquireResult.acquired) {
      return {
        job_id: jobId,
        status: 'error',
        resumable: true,  // Client can retry later
        error: acquireResult.reason,
        reason_code: 'JOB_CONCURRENCY_LIMIT',
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }

    // Ensure we release the slot when done (even on error)
    try {
      return await this.resumeJobInternal(actor, jobId, genomeId, genomeVersion);
    } finally {
      this.concurrencySemaphore.release(actor);
    }
  }

  /**
   * Internal resume job execution (after concurrency slot acquired)
   */
  private async resumeJobInternal(actor: string, jobId: string, genomeId?: string, genomeVersion?: string): Promise<JobResult> {
    const checkpoint = await this.actionGate.loadCheckpoint(jobId);

    if (!checkpoint) {
      return {
        job_id: jobId,
        status: 'error',
        resumable: false,
        error: 'Job not found',
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }

    if (checkpoint.status === 'completed') {
      // Already complete - idempotent resume
      return {
        job_id: jobId,
        status: 'completed',
        resumable: false,
        outputs: checkpoint.stage_outputs?.final,
        decision: 'ALLOW',
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }

    if (checkpoint.status !== 'failed' && checkpoint.status !== 'running') {
      return {
        job_id: jobId,
        status: checkpoint.status,
        resumable: false,
        error: `Cannot resume job in status: ${checkpoint.status}`,
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }

    // Resume from current stage with timeout protection
    try {
      await this.withTimeout((async () => {
        const stage = checkpoint.current_stage ?? 'init';

        // Re-run remaining stages
        if (stage === 'init' || !checkpoint.completed_stages.includes('process')) {
          checkpoint.current_stage = 'process';
          checkpoint.status = 'running';
          if (!checkpoint.completed_stages.includes('init')) {
            checkpoint.completed_stages.push('init');
          }
          await this.actionGate.saveCheckpoint(actor, checkpoint, genomeId, genomeVersion);

          // Process
          const outputs = {
            processed: true,
            resumed: true,
            input_count: checkpoint.inputs ? Object.keys(checkpoint.inputs as object).length : 0,
            timestamp: new Date().toISOString()
          };

          checkpoint.current_stage = null;
          checkpoint.status = 'completed';
          checkpoint.completed_stages = ['init', 'process'];
          checkpoint.stage_outputs = { final: outputs };
          checkpoint.timestamps!.completed = new Date().toISOString();
          checkpoint.error = null;

          await this.actionGate.saveCheckpoint(actor, checkpoint, genomeId, genomeVersion);
        } else {
          // Already past all stages - just complete
          checkpoint.status = 'completed';
          checkpoint.current_stage = null;
          checkpoint.timestamps!.completed = new Date().toISOString();
          await this.actionGate.saveCheckpoint(actor, checkpoint, genomeId, genomeVersion);
        }
      })(), this.jobTimeout);

      return {
        job_id: jobId,
        status: 'completed',
        resumable: false,
        outputs: checkpoint.stage_outputs?.final,
        decision: 'ALLOW',
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    } catch (error) {
      checkpoint.status = 'failed';
      checkpoint.error = {
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof Error && error.message === 'Job execution timeout' ? 'TIMEOUT' : 'RESUME_ERROR'
      };

      await this.actionGate.saveCheckpoint(actor, checkpoint, genomeId, genomeVersion);

      return {
        job_id: jobId,
        status: 'failed',
        resumable: true,
        error: checkpoint.error.message,
        genome_id: genomeId,
        genome_version: genomeVersion
      };
    }
  }

  /**
   * Get job status from checkpoint
   */
  async getStatus(jobId: string, genomeId?: string, genomeVersion?: string): Promise<JobResult | null> {
    const checkpoint = await this.actionGate.loadCheckpoint(jobId);

    if (!checkpoint) {
      return null;
    }

    return {
      job_id: checkpoint.job_id,
      status: checkpoint.status,
      resumable: checkpoint.status === 'failed' || checkpoint.status === 'running',
      outputs: checkpoint.stage_outputs?.final,
      error: checkpoint.error?.message,
      genome_id: genomeId,
      genome_version: genomeVersion
    };
  }

  /**
   * List all jobs (with optional limit for bounded resource usage)
   */
  async listJobs(limit?: number): Promise<JobResult[]> {
    const maxLimit = Math.min(limit ?? this.maxConcurrentJobs, this.maxConcurrentJobs);
    const checkpoints = await this.actionGate.stores.checkpointStore.list({ limit: maxLimit });

    return checkpoints.map(checkpoint => ({
      job_id: checkpoint.job_id,
      status: checkpoint.status,
      resumable: checkpoint.status === 'failed' || checkpoint.status === 'running',
      outputs: checkpoint.stage_outputs?.final,
      error: checkpoint.error?.message
    }));
  }
}
