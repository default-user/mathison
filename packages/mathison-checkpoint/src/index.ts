/**
 * Checkpoint and Resume Engine
 * Fail-closed: if uncertain about state, mark as RESUMABLE_FAILURE
 * P2-B.3: Uses CheckpointStore interface (no direct filesystem access)
 */

import { CheckpointStore, JobCheckpoint as StorageCheckpoint } from 'mathison-storage';

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
  private store: CheckpointStore;

  constructor(store: CheckpointStore) {
    this.store = store;
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  /**
   * Map storage status to local JobStatus enum
   */
  private mapStatusFromStorage(status: string): JobStatus {
    switch (status) {
      case 'RUNNING':
        return JobStatus.IN_PROGRESS;
      case 'DONE':
        return JobStatus.COMPLETED;
      case 'FAILED':
        return JobStatus.FAILED;
      case 'RESUMABLE_FAILURE':
        return JobStatus.RESUMABLE_FAILURE;
      default:
        return JobStatus.PENDING;
    }
  }

  /**
   * Map local JobStatus enum to storage status
   */
  private mapStatusToStorage(status: JobStatus): 'RUNNING' | 'DONE' | 'FAILED' | 'RESUMABLE_FAILURE' {
    switch (status) {
      case JobStatus.IN_PROGRESS:
      case JobStatus.PENDING:
        return 'RUNNING';
      case JobStatus.COMPLETED:
        return 'DONE';
      case JobStatus.FAILED:
        return 'FAILED';
      case JobStatus.RESUMABLE_FAILURE:
        return 'RESUMABLE_FAILURE';
    }
  }

  /**
   * Convert storage checkpoint to local format
   */
  private fromStorage(storageCheckpoint: StorageCheckpoint): JobCheckpoint {
    return {
      ...storageCheckpoint,
      status: this.mapStatusFromStorage(storageCheckpoint.status),
      completed_stages: []  // Storage layer doesn't track completed_stages, derive from stage_outputs
    };
  }

  /**
   * Create a new checkpoint for a job
   */
  async createCheckpoint(jobId: string, jobType: string, inputs: Record<string, unknown>): Promise<JobCheckpoint> {
    const storageCheckpoint = await this.store.createCheckpoint(jobId, jobType, inputs);

    const checkpoint: JobCheckpoint = {
      ...storageCheckpoint,
      status: JobStatus.PENDING,
      completed_stages: []
    };

    return checkpoint;
  }

  /**
   * Load checkpoint for a job
   */
  async loadCheckpoint(jobId: string): Promise<JobCheckpoint | null> {
    const storageCheckpoint = await this.store.loadCheckpoint(jobId);
    if (!storageCheckpoint) return null;

    return this.fromStorage(storageCheckpoint);
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
    await this.store.updateStage(jobId, stage, {
      success: completed,
      outputs
    });
  }

  /**
   * Mark job as completed
   */
  async markCompleted(jobId: string): Promise<void> {
    await this.store.markComplete(jobId);
  }

  /**
   * Mark job as failed (non-resumable)
   */
  async markFailed(jobId: string, error: string): Promise<void> {
    await this.store.markFailed(jobId, error);
  }

  /**
   * Mark job as resumable failure (can be resumed)
   */
  async markResumableFailure(jobId: string, error: string): Promise<void> {
    await this.store.markResumableFailure(jobId, error);
  }

  /**
   * List all checkpoints
   */
  async listCheckpoints(): Promise<JobCheckpoint[]> {
    const storageCheckpoints = await this.store.listCheckpoints();
    return storageCheckpoints.map(sc => this.fromStorage(sc));
  }

  /**
   * Check if a file's content matches expected hash (for idempotency)
   */
  async checkFileHash(filePath: string, expectedHash: string): Promise<boolean> {
    return this.store.checkFileHash(filePath, expectedHash);
  }

  /**
   * Hash content for verification
   */
  hashContent(content: string): string {
    return this.store.hashContent(content);
  }
}

export default CheckpointEngine;
