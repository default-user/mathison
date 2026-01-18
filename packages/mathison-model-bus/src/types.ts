/**
 * WHY: types.ts - Core type definitions for the Model Bus
 * -----------------------------------------------------------------------------
 * - Defines the contract for model adapters and routing.
 * - Standardizes request/response shapes across all vendors.
 * - Enforces capability token requirements at the type level.
 * - Provides provenance data structure for traceability.
 *
 * INVARIANT: All model calls MUST include a capability token.
 * INVARIANT: Responses MUST include provenance for auditing.
 */

import { z } from 'zod';
import { CapabilityToken } from '@mathison/adapters';

// ============================================================================
// Model Message Types
// ============================================================================

/**
 * Role in a conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * A message in a conversation
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Zod schema for chat message validation
 */
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(100000),
});

// ============================================================================
// Model Request Types
// ============================================================================

/**
 * Model generation parameters
 */
export interface ModelParameters {
  /** Temperature for sampling (0.0 - 2.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Stop sequences */
  stop_sequences?: string[];
  /** Top-p sampling */
  top_p?: number;
}

/**
 * Zod schema for model parameters
 */
export const ModelParametersSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(200000).optional(),
  stop_sequences: z.array(z.string()).max(10).optional(),
  top_p: z.number().min(0).max(1).optional(),
});

/**
 * Request to invoke a model through the bus
 *
 * WHY capability_token is required: Ensures all model calls are authorized
 * through the CDI layer. Without this, adapters could be called directly.
 */
export interface ModelBusRequest {
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus', 'local') */
  model_id: string;
  /** Messages to send */
  messages: ChatMessage[];
  /** Optional generation parameters */
  parameters?: ModelParameters;
  /** Required capability token from CDI */
  capability_token: CapabilityToken;
  /** Trace ID for correlation */
  trace_id: string;
  /** Namespace ID for provenance */
  namespace_id: string;
}

/**
 * Zod schema for model bus request
 */
export const ModelBusRequestSchema = z.object({
  model_id: z.string().min(1).max(255),
  messages: z.array(ChatMessageSchema).min(1).max(1000),
  parameters: ModelParametersSchema.optional(),
  capability_token: z.object({
    token_id: z.string(),
    capability: z.string(),
    oi_id: z.string(),
    principal_id: z.string(),
    expires_at: z.date(),
    constraints: z.record(z.unknown()),
  }),
  trace_id: z.string().uuid(),
  namespace_id: z.string().min(1).max(255),
});

// ============================================================================
// Model Response Types
// ============================================================================

/**
 * Token usage information
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
}

/**
 * Finish reason for generation
 */
export type FinishReason = 'stop' | 'length' | 'error' | 'content_filter';

/**
 * Provenance information for auditing
 *
 * WHY provenance is critical: Enables tracing which provider/model served
 * each request, latency tracking, and cost attribution.
 */
export interface ModelProvenance {
  /** Provider that handled the request (openai, anthropic, local) */
  provider: string;
  /** Actual model ID used */
  model_id: string;
  /** Token usage */
  usage: TokenUsage;
  /** Latency in milliseconds */
  latency_ms: number;
  /** Trace ID for correlation */
  trace_id: string;
  /** Capability token ID used */
  capability_token_id: string;
  /** Vendor-specific request ID (if available) */
  vendor_request_id?: string;
  /** Timestamp when request was made */
  timestamp: Date;
}

/**
 * Response from the model bus
 */
export interface ModelBusResponse {
  /** Generated content */
  content: string;
  /** Finish reason */
  finish_reason: FinishReason;
  /** Provenance information for auditing */
  provenance: ModelProvenance;
}

// ============================================================================
// Adapter Types
// ============================================================================

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** API key (loaded from environment) */
  api_key?: string;
  /** Base URL override */
  base_url?: string;
  /** Timeout in milliseconds */
  timeout_ms?: number;
  /** Maximum retries */
  max_retries?: number;
}

/**
 * Model adapter interface for the bus
 *
 * WHY separate from @mathison/adapters ModelAdapter: The Model Bus adapters
 * handle actual HTTP calls to vendors, while @mathison/adapters defines the
 * conformance contract. This keeps vendor-specific code isolated.
 */
export interface ModelBusAdapter {
  /** Provider identifier */
  readonly provider: string;
  /** Supported model patterns (regex) */
  readonly supported_models: RegExp[];

  /**
   * Check if this adapter supports a model
   */
  supports(model_id: string): boolean;

  /**
   * Invoke the model
   *
   * WHY this is the ONLY place vendor calls happen: Centralizes all external
   * API calls, making it easy to audit and impossible to bypass.
   */
  invoke(request: ModelBusRequest): Promise<ModelBusResponse>;
}

// ============================================================================
// Router Types
// ============================================================================

/**
 * Routing configuration
 */
export interface RoutingConfig {
  /** Default provider if model doesn't match any pattern */
  default_provider?: string;
  /** Provider configurations */
  providers: Record<string, ProviderConfig>;
  /** Model to provider overrides */
  model_overrides?: Record<string, string>;
}

/**
 * Router result
 */
export interface RouterResult {
  /** Whether routing was successful */
  success: boolean;
  /** Response if successful */
  response?: ModelBusResponse;
  /** Error if failed */
  error?: string;
}
