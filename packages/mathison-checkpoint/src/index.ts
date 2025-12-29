/**
 * Checkpoint and Resume Engine
 * Fail-closed: if uncertain about state, mark as RESUMABLE_FAILURE
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export enum JobStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RESUMABLE_FAILURE = 'RESUMABLE_FAILURE'
}

export interface JobCheckpoint {
  job_id: string;
  job_type: string;
  status: JobStatus;
  current_stage: string;
  completed_stages: string[];
  inputs: Record<string, unknown>;
  stage_outputs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  error?: string;
}

export class CheckpointEngine {
  private checkpointDir: string;

  constructor(checkpointDir: string = '.mathison/checkpoints') {
    this.checkpointDir = checkpointDir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.checkpointDir, { recursive: true });
  }

  /**
   * Create a new checkpoint for a job
   */
  async createCheckpoint(jobId: string, jobType: string, inputs: Record<string, unknown>): Promise<JobCheckpoint> {
    const checkpoint: JobCheckpoint = {
      job_id: jobId,
      job_type: jobType,
      status: JobStatus.PENDING,
      current_stage: 'INIT',
      completed_stages: [],
      inputs,
      stage_outputs: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  /**
   * Load checkpoint for a job
   */
  async loadCheckpoint(jobId: string): Promise<JobCheckpoint | null> {
    const checkpointPath = path.join(this.checkpointDir, `${jobId}.json`);

    try {
      const data = await fs.readFile(checkpointPath, 'utf-8');
      return JSON.parse(data) as JobCheckpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update checkpoint with stage completion
   */
  async updateStage(
    jobId: string,
    stage: string,
    outputs: Record<string, unknown>,
    completed: boolean = true
  ): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job: ${jobId}`);
    }

    checkpoint.current_stage = stage;
    checkpoint.stage_outputs[stage] = outputs;

    if (completed && !checkpoint.completed_stages.includes(stage)) {
      checkpoint.completed_stages.push(stage);
    }

    checkpoint.status = JobStatus.IN_PROGRESS;
    checkpoint.updated_at = new Date().toISOString();

    await this.saveCheckpoint(checkpoint);
  }

  /**
   * Mark job as completed
   */
  async markCompleted(jobId: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job: ${jobId}`);
    }

    checkpoint.status = JobStatus.COMPLETED;
    checkpoint.updated_at = new Date().toISOString();

    await this.saveCheckpoint(checkpoint);
  }

  /**
   * Mark job as failed (non-resumable)
   */
  async markFailed(jobId: string, error: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job: ${jobId}`);
    }

    checkpoint.status = JobStatus.FAILED;
    checkpoint.error = error;
    checkpoint.updated_at = new Date().toISOString();

    await this.saveCheckpoint(checkpoint);
  }

  /**
   * Mark job as resumable failure (can be resumed)
   */
  async markResumableFailure(jobId: string, error: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job: ${jobId}`);
    }

    checkpoint.status = JobStatus.RESUMABLE_FAILURE;
    checkpoint.error = error;
    checkpoint.updated_at = new Date().toISOString();

    await this.saveCheckpoint(checkpoint);
  }

  /**
   * List all checkpoints
   */
  async listCheckpoints(): Promise<JobCheckpoint[]> {
    const files = await fs.readdir(this.checkpointDir);
    const checkpoints: JobCheckpoint[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const jobId = file.replace('.json', '');
        const checkpoint = await this.loadCheckpoint(jobId);
        if (checkpoint) {
          checkpoints.push(checkpoint);
        }
      }
    }

    return checkpoints.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  /**
   * Check if a file's content matches expected hash (for idempotency)
   */
  async checkFileHash(filePath: string, expectedHash: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const hash = this.hashContent(content);
      return hash === expectedHash;
    } catch (error) {
      return false;
    }
  }

  /**
   * Hash content for verification
   */
  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Save checkpoint to disk
   */
  private async saveCheckpoint(checkpoint: JobCheckpoint): Promise<void> {
    const checkpointPath = path.join(this.checkpointDir, `${checkpoint.job_id}.json`);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  }
}

export default CheckpointEngine;
