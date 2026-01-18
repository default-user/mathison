/**
 * WHY: types.ts - Pipeline type contracts and schemas
 * -----------------------------------------------------------------------------
 * - Defines PipelineContext, Request/Response, Handler, GovernanceProvider, and stage types
 * - Needed to ensure type safety across pipeline stages; Zod schemas for runtime validation
 * - Enforces: structured context with trace_id, principal, OI; capability tokens in responses
 * - Tradeoff: Comprehensive typing enables IDE support but requires sync with governance types
 */

import { z } from 'zod';

// ============================================================================
// Request Context
// ============================================================================

/**
 * Origin information for taint tracking and purpose labeling
 */
export interface RequestOrigin {
  /** Source of the request: http, grpc, cli, worker */
  source: 'http' | 'grpc' | 'cli' | 'worker';
  /** Origin labels for taint tracking */
  labels: string[];
  /** Purpose of the request */
  purpose: string;
  /** IP address or client identifier */
  client_id?: string;
}

/**
 * Normalized request context - required for every pipeline execution
 */
export interface PipelineContext {
  /** Unique trace ID for request correlation */
  trace_id: string;
  /** Principal making the request */
  principal_id: string;
  /** OI namespace for this request */
  oi_id: string;
  /** Intent/action being requested */
  intent: string;
  /** Capabilities requested by the caller */
  requested_capabilities: string[];
  /** Origin and taint information */
  origin: RequestOrigin;
  /** Timestamp when context was created */
  created_at: Date;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Zod schema for validating pipeline context
 */
export const PipelineContextSchema = z.object({
  trace_id: z.string().uuid(),
  principal_id: z.string().min(1),
  oi_id: z.string().min(1),
  intent: z.string().min(1),
  requested_capabilities: z.array(z.string()),
  origin: z.object({
    source: z.enum(['http', 'grpc', 'cli', 'worker']),
    labels: z.array(z.string()),
    purpose: z.string(),
    client_id: z.string().optional(),
  }),
  created_at: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Pipeline Request/Response
// ============================================================================

/**
 * Input to the pipeline
 */
export interface PipelineRequest<T = unknown> {
  /** Normalized context */
  context: PipelineContext;
  /** Request payload */
  payload: T;
}

/**
 * Capability token issued by CDI for authorized operations
 */
export interface CapabilityToken {
  /** Token ID */
  token_id: string;
  /** What this token authorizes */
  capability: string;
  /** OI namespace scope */
  oi_id: string;
  /** Principal this token was issued to */
  principal_id: string;
  /** Expiration timestamp */
  expires_at: Date;
  /** Constraints on usage */
  constraints: Record<string, unknown>;
}

/**
 * Decision metadata from CDI checks
 */
export interface DecisionMeta {
  /** Whether the action was allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Risk classification of the action */
  risk_class: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk';
  /** Capability tokens issued for this request */
  capability_tokens: CapabilityToken[];
  /** Redaction rules to apply to output */
  redaction_rules: RedactionRule[];
  /** Tool limits for this request */
  tool_limits?: Record<string, number>;
  /** Whether confirmation was required */
  required_confirmation: boolean;
  /** Timestamp of decision */
  decided_at: Date;
}

/**
 * Redaction rule for output filtering
 */
export interface RedactionRule {
  /** Pattern to match (regex string) */
  pattern: string;
  /** Replacement text */
  replacement: string;
  /** Reason for redaction */
  reason: string;
}

/**
 * Output from the pipeline
 */
export interface PipelineResponse<T = unknown> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response payload (if success) */
  data?: T;
  /** Error information (if failure) */
  error?: PipelineError;
  /** Decision metadata for auditing */
  decision_meta: DecisionMeta;
  /** Trace ID for correlation */
  trace_id: string;
}

/**
 * Pipeline error with human-legible reason
 */
export interface PipelineError {
  /** Error code */
  code: string;
  /** Human-legible reason */
  message: string;
  /** Stage where error occurred */
  stage: PipelineStage;
  /** Additional details */
  details?: Record<string, unknown>;
}

// ============================================================================
// Pipeline Stages
// ============================================================================

/**
 * Pipeline execution stages
 */
export type PipelineStage =
  | 'context_normalization'
  | 'cif_ingress'
  | 'cdi_action_check'
  | 'handler_execution'
  | 'cdi_output_check'
  | 'cif_egress';

/**
 * Result from a pipeline stage
 */
export interface StageResult<T = unknown> {
  /** Whether the stage passed */
  passed: boolean;
  /** Data produced by the stage */
  data?: T;
  /** Error if stage failed */
  error?: PipelineError;
  /** Duration in milliseconds */
  duration_ms: number;
}

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Handler function that executes the actual business logic
 * Only called if CDI allows the action
 */
export type PipelineHandler<TReq = unknown, TRes = unknown> = (
  context: PipelineContext,
  payload: TReq,
  capabilities: CapabilityToken[]
) => Promise<TRes>;

/**
 * Handler registration with metadata
 */
export interface RegisteredHandler<TReq = unknown, TRes = unknown> {
  /** Unique handler identifier */
  id: string;
  /** Intent this handler serves */
  intent: string;
  /** Risk classification */
  risk_class: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk';
  /** Required capabilities */
  required_capabilities: string[];
  /** The handler function */
  handler: PipelineHandler<TReq, TRes>;
  /** Request payload schema (Zod) */
  request_schema?: z.ZodType<TReq>;
  /** Response payload schema (Zod) */
  response_schema?: z.ZodType<TRes>;
}

// ============================================================================
// Governance Integration Types
// ============================================================================

/**
 * Governance capsule status
 */
export interface GovernanceCapsuleStatus {
  /** Whether capsule is loaded and valid */
  valid: boolean;
  /** Capsule ID if loaded */
  capsule_id?: string;
  /** When capsule expires */
  expires_at?: Date;
  /** Whether capsule is stale (past TTL but not expired) */
  stale: boolean;
  /** Degradation level */
  degradation_level: 'none' | 'partial' | 'full';
}

/**
 * Interface for governance provider (injected into pipeline)
 */
export interface GovernanceProvider {
  /** Get current capsule status */
  getCapsuleStatus(): GovernanceCapsuleStatus;

  /** Validate CIF ingress */
  validateCifIngress(context: PipelineContext, payload: unknown): Promise<StageResult>;

  /** Check CDI action permission */
  checkCdiAction(
    context: PipelineContext,
    intent: string,
    risk_class: string,
    requested_capabilities: string[]
  ): Promise<StageResult<DecisionMeta>>;

  /** Check CDI output constraints */
  checkCdiOutput(
    context: PipelineContext,
    response: unknown,
    decision_meta: DecisionMeta
  ): Promise<StageResult<{ redacted_response: unknown; applied_rules: RedactionRule[] }>>;

  /** Validate CIF egress */
  validateCifEgress(context: PipelineContext, response: unknown): Promise<StageResult>;
}
