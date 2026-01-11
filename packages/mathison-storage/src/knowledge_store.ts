/**
 * KnowledgeStore - Storage for grounded claims and hypotheses
 *
 * Stores verified claims with full provenance to prevent hallucinations
 * from being treated as knowledge.
 */

export interface GroundedClaim {
  claim_id: string;
  type: string;
  text: string;
  support: Array<{ chunk_id: string; span?: string }>;
  key?: string;
  confidence?: number;

  // Provenance
  packet_id: string;
  chunk_hashes: string[];
  sources_hash?: string;
  template_checksum?: string;
  signature_status?: 'valid' | 'invalid' | 'missing';

  // Status
  status: 'grounded' | 'hypothesis';
  taint?: string;

  // Timestamps
  created_at: number;
}

export interface ConflictRecord {
  conflict_id: string;
  key: string;
  existing_claim_id: string;
  new_claim_id: string;
  existing_text: string;
  new_text: string;
  detected_at: number;
  packet_id: string;
}

export interface IngestionLogEntry {
  ingestion_run_id: string;
  packet_id: string;
  grounded_count: number;
  hypothesis_count: number;
  denied_count: number;
  conflict_count: number;
  sources_hash?: string;
  timestamp: number;
}

/**
 * KnowledgeStore Interface
 */
export interface KnowledgeStore {
  /**
   * Initialize the store
   */
  init(): Promise<void>;

  /**
   * Close the store
   */
  close(): Promise<void>;

  /**
   * Write a grounded claim
   */
  writeClaim(claim: GroundedClaim): Promise<void>;

  /**
   * Read a claim by ID
   */
  readClaim(claim_id: string): Promise<GroundedClaim | null>;

  /**
   * Find claims by key (for conflict detection)
   */
  findClaimsByKey(key: string): Promise<GroundedClaim[]>;

  /**
   * Record a conflict
   */
  recordConflict(conflict: ConflictRecord): Promise<void>;

  /**
   * Get conflicts for a packet
   */
  getConflicts(packet_id: string): Promise<ConflictRecord[]>;

  /**
   * Log an ingestion run
   */
  logIngestion(entry: IngestionLogEntry): Promise<void>;

  /**
   * Get ingestion log entries
   */
  getIngestionLog(packet_id?: string): Promise<IngestionLogEntry[]>;
}
