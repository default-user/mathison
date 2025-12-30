/**
 * Mathison SDK Types
 * Type definitions matching the Mathison Server API
 */

// ============================================================================
// Governance Types
// ============================================================================

export type GovernanceReasonCode =
  | 'ALLOWED'
  | 'CDI_DENIED'
  | 'CIF_INGRESS_BLOCKED'
  | 'CIF_EGRESS_BLOCKED'
  | 'GOVERNANCE_INIT_FAILED'
  | 'MALFORMED_REQUEST'
  | 'ROUTE_NOT_FOUND';

export interface GovernanceDecision {
  allowed: boolean;
  reasonCode: GovernanceReasonCode;
  message: string;
}

export interface GovernanceError extends Error {
  reasonCode: GovernanceReasonCode;
  message: string;
  violations?: string[];
}

// ============================================================================
// Health Types
// ============================================================================

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  bootStatus: 'booting' | 'ready' | 'failed';
  error?: string;
  governance?: {
    treaty: {
      version: string;
      authority: string;
    };
    cdi: {
      strictMode: boolean;
      initialized: boolean;
    };
    cif: {
      maxRequestSize: number;
      maxResponseSize: number;
      initialized: boolean;
    };
  };
  storage?: {
    initialized: boolean;
  };
  memory?: {
    initialized: boolean;
  };
}

// ============================================================================
// Job Types
// ============================================================================

export interface JobRequest {
  jobType?: string;
  inputs: Record<string, any>;
  policyId?: string;
  jobId?: string;
}

export interface JobResult {
  success: boolean;
  job_id: string;
  data?: any;
  governance: GovernanceDecision;
  receipt?: Receipt;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface Receipt {
  receipt_id: string;
  job_id: string;
  action: string;
  actor: string;
  timestamp: number;
  governance: GovernanceDecision;
  payload?: any;
}

export interface ReceiptsResponse {
  job_id: string;
  count: number;
  receipts: Receipt[];
}

// ============================================================================
// Memory Types
// ============================================================================

export interface Node {
  id: string;
  type: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface NodeEdgesResponse {
  node_id: string;
  count: number;
  edges: Edge[];
}

export interface SearchResponse {
  query: string;
  limit: number;
  count: number;
  results: Node[];
}

export interface CreateNodeRequest {
  idempotency_key: string;
  id?: string;
  type: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface CreateNodeResponse {
  node: Node;
  created: boolean;
  message?: string;
  receipt?: Receipt;
}

export interface CreateEdgeRequest {
  idempotency_key: string;
  from: string;
  to: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface CreateEdgeResponse {
  edge: Edge;
  created: boolean;
  receipt?: Receipt;
}

// ============================================================================
// Error Response Types
// ============================================================================

export interface ErrorResponse {
  error?: string;
  reason_code?: GovernanceReasonCode;
  message?: string;
  violations?: string[];
  quarantined?: boolean;
  leaks?: string[];
  details?: any;
}
