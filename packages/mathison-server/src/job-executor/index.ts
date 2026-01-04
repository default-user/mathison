/**
 * P3-C: Minimal job executor using ActionGate
 * All side effects go through ActionGate (structurally enforced)
 */

import { ActionGate } from '../action-gate';
import { JobCheckpoint } from 'mathison-storage';
import { randomUUID } from 'crypto';

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
}

export class JobExecutor {
  private actionGate: ActionGate;
  private jobTimeout: number; // milliseconds
  private maxConcurrentJobs: number;

  constructor(actionGate: ActionGate, options?: { jobTimeout?: number; maxConcurrentJobs?: number }) {
    this.actionGate = actionGate;
    this.jobTimeout = options?.jobTimeout ?? 30000; // 30s default
    this.maxConcurrentJobs = options?.maxConcurrentJobs ?? 100;
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
   */
  async runJob(actor: string, request: JobRequest, genomeId?: string, genomeVersion?: string): Promise<JobResult> {
    const jobId = request.jobId ?? `job-${randomUUID()}`;

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
      return this.resumeJob(actor, jobId, genomeId, genomeVersion);
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
   */
  async resumeJob(actor: string, jobId: string, genomeId?: string, genomeVersion?: string): Promise<JobResult> {
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
