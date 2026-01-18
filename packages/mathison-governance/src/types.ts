/**
 * Mathison v2.1 Governance Types
 *
 * Types for governance capsules, treaties, CIF validation, and CDI decisions.
 */

import { z } from 'zod';

// ============================================================================
// Authority Model
// ============================================================================

/**
 * Principal - the human or organization that owns an OI
 */
export interface Principal {
  id: string;
  name: string;
  type: 'personal' | 'organizational';
}

/**
 * Risk class definitions
 */
export interface RiskClass {
  level: number;
  requires_capsule: boolean;
  allowed_on_degraded: boolean;
}

/**
 * Authority configuration - root of trust for an OI
 */
export interface AuthorityConfig {
  version: string;
  principal: Principal;
  admins: string[];
  delegations: {
    delegate_id: string;
    permissions: string[];
    expires_at?: string;
  }[];
  default_permissions: {
    allow_thread_creation: boolean;
    allow_namespace_creation: boolean;
    allow_cross_namespace_transfer: boolean;
    allow_model_invocation: boolean;
    allow_tool_invocation: boolean;
  };
  risk_classes: Record<string, RiskClass>;
}

// ============================================================================
// Governance Capsule
// ============================================================================

/**
 * Treaty - agreement governing OI behavior
 */
export interface Treaty {
  id: string;
  name: string;
  constraints: {
    max_token_budget: number;
    allowed_model_families: string[];
    allowed_tool_categories: string[];
    data_retention_days: number;
  };
}

/**
 * Genome - capability configuration for an OI
 */
export interface Genome {
  id: string;
  capabilities: {
    memory_read: boolean;
    memory_write: boolean;
    model_invocation: boolean;
    tool_invocation: boolean;
    cross_namespace_envelope: boolean;
  };
}

/**
 * Posture - operational mode configuration
 */
export interface Posture {
  mode: 'development' | 'staging' | 'production';
  strict_validation: boolean;
  audit_all_actions: boolean;
}

/**
 * Governance capsule - signed bundle of governance material
 */
export interface GovernanceCapsule {
  version: string;
  capsule_id: string;
  issued_at: string;
  expires_at: string;
  issuer: string;
  treaty: Treaty;
  genome: Genome;
  posture: Posture;
  signature: string;
}

/**
 * Zod schema for governance capsule validation
 */
export const GovernanceCapsuleSchema = z.object({
  version: z.string(),
  capsule_id: z.string(),
  issued_at: z.string(),
  expires_at: z.string(),
  issuer: z.string(),
  treaty: z.object({
    id: z.string(),
    name: z.string(),
    constraints: z.object({
      max_token_budget: z.number(),
      allowed_model_families: z.array(z.string()),
      allowed_tool_categories: z.array(z.string()),
      data_retention_days: z.number(),
    }),
  }),
  genome: z.object({
    id: z.string(),
    capabilities: z.object({
      memory_read: z.boolean(),
      memory_write: z.boolean(),
      model_invocation: z.boolean(),
      tool_invocation: z.boolean(),
      cross_namespace_envelope: z.boolean(),
    }),
  }),
  posture: z.object({
    mode: z.enum(['development', 'staging', 'production']),
    strict_validation: z.boolean(),
    audit_all_actions: z.boolean(),
  }),
  signature: z.string(),
});

// ============================================================================
// CIF Types
// ============================================================================

/**
 * CIF validation constraints
 */
export const CIF_MAX_STRING_LENGTH = 10000;
export const CIF_MAX_ARRAY_LENGTH = 1000;
export const CIF_MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * CIF validation result
 */
export interface CifValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  errors?: string[];
}

// ============================================================================
// CDI Types
// ============================================================================

/**
 * CDI context for decision making
 */
export interface CdiContext {
  source_namespace_id: string;
  target_namespace_id?: string;
  actor_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CDI decision result
 */
export interface CdiDecision {
  allowed: boolean;
  reason: string;
  requires_confirmation?: boolean;
  capability_tokens?: CapabilityTokenData[];
  redaction_rules?: RedactionRuleData[];
  tool_limits?: Record<string, number>;
}

/**
 * Capability token data
 */
export interface CapabilityTokenData {
  token_id: string;
  capability: string;
  oi_id: string;
  principal_id: string;
  expires_at: Date;
  constraints: Record<string, unknown>;
}

/**
 * Redaction rule data
 */
export interface RedactionRuleData {
  pattern: string;
  replacement: string;
  reason: string;
}

// ============================================================================
// Capsule Status
// ============================================================================

/**
 * Degradation level for capsule status
 */
export type DegradationLevel = 'none' | 'partial' | 'full';

/**
 * Capsule loading status
 */
export interface CapsuleStatus {
  loaded: boolean;
  valid: boolean;
  capsule_id?: string;
  expires_at?: Date;
  stale: boolean;
  degradation_level: DegradationLevel;
  last_loaded_at?: Date;
  error?: string;
}
