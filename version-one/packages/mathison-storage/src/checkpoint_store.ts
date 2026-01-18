export interface JobCheckpoint {
  job_id: string;
  job_type: string;
  status: string;
  current_stage?: string | null;
  completed_stages: string[];
  inputs?: unknown;
  stage_outputs?: Record<string, unknown>;
  timestamps?: Record<string, string>;
  error?: { message: string; code?: string } | null;
  // Optional but useful for idempotency:
  content_hash?: string;
}

export interface CheckpointStore {
  init(): Promise<void>;
  create(cp: JobCheckpoint): Promise<void>;
  load(jobId: string): Promise<JobCheckpoint | null>;
  save(cp: JobCheckpoint): Promise<void>;
  list(opts?: { limit?: number }): Promise<JobCheckpoint[]>;
}
