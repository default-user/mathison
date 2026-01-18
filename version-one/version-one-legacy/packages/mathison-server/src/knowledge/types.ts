/**
 * Knowledge Ingestion Types
 *
 * Types for the knowledge ingestion gate that prevents hallucinations
 * from being stored as "knowledge".
 */

import { CPACK } from './cpack-schema';

/**
 * Ingestion Mode
 * - GROUND_ONLY: Only grounded claims are accepted (default, safest)
 * - GROUND_PLUS_HYPOTHESIS: Grounded claims + hypotheses in separate namespace
 */
export type IngestionMode = 'GROUND_ONLY' | 'GROUND_PLUS_HYPOTHESIS';

/**
 * Claim Support (provenance)
 */
export interface ClaimSupport {
  chunk_id: string;
  span?: string; // Optional text span from chunk
}

/**
 * Candidate Claim from LLM
 */
export interface CandidateClaim {
  claim_id?: string; // If not provided, will be computed deterministically
  type: string; // e.g., "fact", "number", "date", "quote", "policy"
  text: string;
  support: ClaimSupport[];
  key?: string; // For conflict detection
  confidence?: number;
}

/**
 * LLM Output (untrusted transformer)
 */
export interface LLMOutput {
  plan?: string; // Optional reasoning/plan
  claims: CandidateClaim[];
}

/**
 * Ingestion Request Context
 */
export interface IngestionContext {
  posture?: string; // Security posture
  risk_class?: string; // Risk classification
  task_id?: string;
  user_id?: string;
  oi_id?: string;
}

/**
 * Ingestion Request Payload
 */
export interface IngestionRequest {
  cpack_yaml?: string; // CPACK as YAML string
  cpack?: CPACK; // CPACK as object
  llm_output: LLMOutput;
  mode?: IngestionMode; // Default: GROUND_ONLY
  context?: IngestionContext;
}

/**
 * Fetched Chunk
 */
export interface FetchedChunk {
  chunk_id: string;
  content: string;
  content_hash: string;
  source_uri?: string;
  retrieved_at: number; // Unix timestamp
  has_instructional_text?: boolean; // Detected prompt injection patterns
}

/**
 * Grounded Claim (verified)
 */
export interface GroundedClaim {
  claim_id: string; // Deterministic hash
  type: string;
  text: string;
  support: ClaimSupport[];
  key?: string;
  confidence?: number;

  // Provenance
  packet_id: string;
  chunk_hashes: string[]; // Content hashes of all supporting chunks
  sources_hash?: string; // From CPACK integrity
  template_checksum?: string; // From CPACK integrity
  signature_status?: 'valid' | 'invalid' | 'missing';

  // Status
  status: 'grounded' | 'hypothesis';
  taint?: string; // e.g., "untrusted_llm"
}

/**
 * Conflict Record
 */
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

/**
 * Ingestion Result
 */
export interface IngestionResult {
  success: boolean;
  reason_code: string;
  message: string;

  // Stats
  grounded_count: number;
  hypothesis_count: number;
  denied_count: number;
  conflict_count: number;

  // Details
  grounded_claim_ids?: string[];
  hypothesis_claim_ids?: string[];
  denied_reasons?: Array<{ claim_index: number; reason: string }>;
  conflict_ids?: string[];

  // Audit
  packet_id: string;
  ingestion_run_id: string;
  sources_hash?: string;
  timestamp: number;
}

/**
 * Chunk Retriever Interface
 */
export interface ChunkRetriever {
  /**
   * Fetch a chunk by ID or reference
   */
  fetch(chunk_id: string): Promise<FetchedChunk | null>;

  /**
   * Check if retriever is available
   */
  isAvailable(): Promise<boolean>;
}

/**
 * LLM Adapter Interface (for synthesis stage)
 */
export interface LLMAdapter {
  /**
   * Synthesize claims from fetched chunks
   */
  synthesizeClaims(chunks: FetchedChunk[], instruction: string): Promise<LLMOutput>;

  /**
   * Check if adapter is available
   */
  isAvailable(): boolean;
}
