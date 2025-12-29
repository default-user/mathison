/**
 * Storage Adapter Interfaces
 *
 * P2 requirement: All storage must go through adapters, never direct filesystem access.
 * This enables:
 * - Audit pack generation independent of storage backend
 * - Swap backends (File → SQLite → distributed) without changing application code
 * - Integrity verification (hashes, tamper-evidence)
 */

export interface JobCheckpoint {
  job_id: string;
  job_type: string;
  status: 'RUNNING' | 'RESUMABLE_FAILURE' | 'DONE' | 'FAILED';
  current_stage: string;
  inputs: Record<string, unknown>;
  stage_outputs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  error?: string;
}

export interface Receipt {
  job_id: string;
  stage: string;
  action: string;
  timestamp: number;
  notes?: string;
  verdict?: 'allow' | 'deny';
  reason?: string;
  // P2-B.4: Integrity fields
  treaty_hash?: string;      // Treaty version hash used in decision
  treaty_version?: string;   // Treaty version (e.g., "1.0")
  policy_id?: string;        // Policy identifier
  inputs_hash?: string;      // Hash of inputs to this decision
  outputs_hash?: string;     // Hash of outputs from this decision
}

export interface MemoryNode {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface MemoryEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation: string;
  attributes: Record<string, unknown>;
  created_at: string;
}

export interface MemoryHyperedge {
  id: string;
  node_ids: string[];
  relation: string;
  attributes: Record<string, unknown>;
  created_at: string;
}

/**
 * CheckpointStore - Durable job state for resumability
 */
export interface CheckpointStore {
  /**
   * Initialize the store (create tables, open connections, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the store (close connections, flush buffers, etc.)
   */
  shutdown(): Promise<void>;

  /**
   * Create a new checkpoint for a job
   */
  createCheckpoint(jobId: string, jobType: string, inputs: Record<string, unknown>): Promise<JobCheckpoint>;

  /**
   * Load an existing checkpoint
   */
  loadCheckpoint(jobId: string): Promise<JobCheckpoint | null>;

  /**
   * Update checkpoint stage
   */
  updateStage(jobId: string, stage: string, result: { success: boolean; outputs?: unknown; error?: string }): Promise<void>;

  /**
   * Mark job as RESUMABLE_FAILURE
   */
  markResumableFailure(jobId: string, error: string): Promise<void>;

  /**
   * Mark job as DONE
   */
  markComplete(jobId: string): Promise<void>;

  /**
   * Mark job as FAILED (non-resumable)
   */
  markFailed(jobId: string, error: string): Promise<void>;

  /**
   * List all checkpoints (for audit/reporting)
   */
  listCheckpoints(): Promise<JobCheckpoint[]>;

  /**
   * Compute content hash (deterministic)
   */
  hashContent(content: string): string;

  /**
   * Verify file hash matches expected
   */
  checkFileHash(filePath: string, expectedHash: string): Promise<boolean>;
}

/**
 * ReceiptStore - Append-only event log for governance actions
 */
export interface ReceiptStore {
  /**
   * Initialize the store
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the store
   */
  shutdown(): Promise<void>;

  /**
   * Append a receipt to the log
   */
  append(receipt: Receipt): Promise<void>;

  /**
   * Query receipts by job ID
   */
  queryByJobId(jobId: string): Promise<Receipt[]>;

  /**
   * Query receipts by verdict (allow/deny)
   */
  queryByVerdict(verdict: 'allow' | 'deny'): Promise<Receipt[]>;

  /**
   * List all receipts (for audit/reporting)
   */
  listAll(): Promise<Receipt[]>;

  /**
   * Get receipts in a time range
   */
  queryByTimeRange(startTime: number, endTime: number): Promise<Receipt[]>;

  /**
   * Get latest receipt for a job (P2-B.1 requirement)
   */
  latest(jobId: string): Promise<Receipt | null>;
}

/**
 * PolicyStore - Treaty/policy version tracking (P2-B.1 optional)
 */
export interface PolicyStore {
  /**
   * Initialize the store
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the store
   */
  shutdown(): Promise<void>;

  /**
   * Store a policy version
   */
  storePolicy(policyId: string, version: string, content: string): Promise<void>;

  /**
   * Load a policy by ID and version
   */
  loadPolicy(policyId: string, version: string): Promise<{ content: string; content_hash: string } | null>;

  /**
   * List all policies
   */
  listPolicies(): Promise<Array<{ policy_id: string; version: string; content_hash: string }>>;
}

/**
 * MemoryStore - Graph storage for OI memory (Phase P2-C)
 */
export interface MemoryStore {
  /**
   * Initialize the store
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the store
   */
  shutdown(): Promise<void>;

  /**
   * Write a node
   */
  writeNode(node: MemoryNode): Promise<void>;

  /**
   * Write an edge
   */
  writeEdge(edge: MemoryEdge): Promise<void>;

  /**
   * Write a hyperedge
   */
  writeHyperedge(hyperedge: MemoryHyperedge): Promise<void>;

  /**
   * Query nodes by type
   */
  queryNodesByType(type: string): Promise<MemoryNode[]>;

  /**
   * Query edges from a node
   */
  queryEdgesFrom(nodeId: string): Promise<MemoryEdge[]>;

  /**
   * Query hyperedges containing a node
   */
  queryHyperedgesContaining(nodeId: string): Promise<MemoryHyperedge[]>;

  /**
   * Export all memory (requires explicit capability)
   */
  exportAll(): Promise<{ nodes: MemoryNode[]; edges: MemoryEdge[]; hyperedges: MemoryHyperedge[] }>;
}
