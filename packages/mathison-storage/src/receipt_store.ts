export interface Receipt {
  timestamp: string; // ISO
  job_id: string;
  stage: string;
  action: string;

  decision?: string; // ALLOW/DENY/TRANSFORM/etc
  policy_id?: string;

  inputs_hash?: string;
  outputs_hash?: string;

  notes?: string;
  extensible?: Record<string, unknown>;

  // Governance audit fields
  reason_code?: string; // Why the action was allowed/denied
  content_hash?: string; // Hash of the content operated on

  // REQUIRED for P2-B wiring:
  store_backend?: "FILE" | "SQLITE";

  // Genome metadata (added for memetic genome governance)
  genome_id?: string;
  genome_version?: string;
}

export interface ReceiptStore {
  init(): Promise<void>;
  append(r: Receipt): Promise<void>;
  readByJob(jobId: string, opts?: { limit?: number }): Promise<Receipt[]>;
  latest(jobId: string): Promise<Receipt | null>;
}
