/**
 * Mathison v2.1 Adapter Types
 *
 * Types for adapter conformance and gateway interface.
 */

import { z } from 'zod';

// ============================================================================
// Capability Token (from governance)
// ============================================================================

export interface CapabilityToken {
  token_id: string;
  capability: string;
  oi_id: string;
  principal_id: string;
  expires_at: Date;
  constraints: Record<string, unknown>;
}

// ============================================================================
// Model Adapter Types
// ============================================================================

/**
 * Model invocation request
 */
export interface ModelInvocationRequest {
  /** Model identifier */
  model_id: string;
  /** Messages to send */
  messages: ModelMessage[];
  /** Generation parameters */
  parameters?: ModelParameters;
  /** Required capability token */
  capability_token: CapabilityToken;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelParameters {
  temperature?: number;
  max_tokens?: number;
  stop_sequences?: string[];
}

/**
 * Model invocation response
 */
export interface ModelInvocationResponse {
  /** Generated content */
  content: string;
  /** Token usage */
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  /** Finish reason */
  finish_reason: 'stop' | 'length' | 'error';
  /** Model ID used */
  model_id: string;
}

/**
 * Model adapter interface
 */
export interface ModelAdapter {
  /** Adapter identifier */
  id: string;
  /** Supported model families */
  supported_families: string[];
  /** Invoke the model */
  invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse>;
  /** Check if adapter supports a model */
  supports(model_id: string): boolean;
}

// ============================================================================
// Tool Adapter Types
// ============================================================================

/**
 * Tool invocation request
 */
export interface ToolInvocationRequest {
  /** Tool identifier */
  tool_id: string;
  /** Tool input */
  input: Record<string, unknown>;
  /** Required capability token */
  capability_token: CapabilityToken;
}

/**
 * Tool invocation response
 */
export interface ToolInvocationResponse {
  /** Tool output */
  output: unknown;
  /** Whether the tool succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  /** Tool identifier */
  id: string;
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema (JSON Schema) */
  input_schema: Record<string, unknown>;
  /** Tool category */
  category: string;
  /** Risk level */
  risk_level: 'low' | 'medium' | 'high';
}

/**
 * Tool adapter interface
 */
export interface ToolAdapter {
  /** Adapter identifier */
  id: string;
  /** Get available tools */
  getTools(): ToolDefinition[];
  /** Invoke a tool */
  invoke(request: ToolInvocationRequest): Promise<ToolInvocationResponse>;
  /** Check if adapter supports a tool */
  supports(tool_id: string): boolean;
}

// ============================================================================
// Gateway Types
// ============================================================================

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  /** Allowed model families */
  allowed_model_families: string[];
  /** Allowed tool categories */
  allowed_tool_categories: string[];
  /** Maximum tokens per request */
  max_tokens_per_request: number;
  /** Strict mode (fail on any violation) */
  strict_mode: boolean;
}

/**
 * Gateway invocation result
 */
export interface GatewayResult<T> {
  /** Whether the invocation was allowed */
  allowed: boolean;
  /** Result if allowed */
  result?: T;
  /** Reason if denied */
  reason?: string;
  /** Capability token used */
  token_used?: CapabilityToken;
}

// ============================================================================
// Conformance Types
// ============================================================================

/**
 * Conformance check result
 */
export interface ConformanceResult {
  /** Whether the adapter conforms */
  conforms: boolean;
  /** Violations found */
  violations: ConformanceViolation[];
  /** Adapter ID checked */
  adapter_id: string;
  /** Check timestamp */
  checked_at: Date;
}

/**
 * Conformance violation
 */
export interface ConformanceViolation {
  /** Violation code */
  code: string;
  /** Description */
  message: string;
  /** Severity */
  severity: 'error' | 'warning';
}
