/**
 * Mathison v2.1 CIF (Common Ingress Framework)
 *
 * Validates request context, schema, required fields, size limits, and taint rules.
 * This is stage 2 (ingress) and stage 6 (egress) of the pipeline.
 */

import { z } from 'zod';
import {
  CifValidationResult,
  CIF_MAX_STRING_LENGTH,
  CIF_MAX_ARRAY_LENGTH,
  CIF_MAX_PAYLOAD_SIZE,
} from './types';

// ============================================================================
// CIF Validation Utilities
// ============================================================================

/**
 * Validate a value against a Zod schema with CIF constraints
 */
export function validateCIF<T>(
  schema: z.ZodType<T>,
  input: unknown
): CifValidationResult<T> {
  // First check payload size
  const payloadSize = JSON.stringify(input).length;
  if (payloadSize > CIF_MAX_PAYLOAD_SIZE) {
    return {
      valid: false,
      errors: [`Payload size ${payloadSize} exceeds maximum ${CIF_MAX_PAYLOAD_SIZE}`],
    };
  }

  // Validate against schema
  const result = schema.safeParse(input);

  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(
        (e) => `${e.path.join('.')}: ${e.message}`
      ),
    };
  }

  return {
    valid: true,
    data: result.data,
  };
}

/**
 * Check for oversized strings in an object
 */
export function checkStringLimits(
  obj: unknown,
  path: string[] = []
): string[] {
  const errors: string[] = [];

  if (typeof obj === 'string') {
    if (obj.length > CIF_MAX_STRING_LENGTH) {
      errors.push(
        `${path.join('.') || 'value'}: string length ${obj.length} exceeds maximum ${CIF_MAX_STRING_LENGTH}`
      );
    }
  } else if (Array.isArray(obj)) {
    if (obj.length > CIF_MAX_ARRAY_LENGTH) {
      errors.push(
        `${path.join('.') || 'value'}: array length ${obj.length} exceeds maximum ${CIF_MAX_ARRAY_LENGTH}`
      );
    }
    obj.forEach((item, index) => {
      errors.push(...checkStringLimits(item, [...path, String(index)]));
    });
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      errors.push(...checkStringLimits(value, [...path, key]));
    }
  }

  return errors;
}

// ============================================================================
// Standard CIF Schemas
// ============================================================================

/**
 * Base request schema - required fields for all requests
 */
export const BaseRequestSchema = z.object({
  namespace_id: z.string().min(1).max(255),
  thread_id: z.string().uuid().optional(),
});

/**
 * Create thread request schema
 */
export const CreateThreadRequestSchema = BaseRequestSchema.extend({
  scope: z.string().min(1).max(1000),
  priority: z.number().int().min(0).max(100),
});

/**
 * Add commitment request schema
 */
export const AddCommitmentRequestSchema = z.object({
  thread_id: z.string().uuid(),
  next_action: z.string().min(1).max(CIF_MAX_STRING_LENGTH),
  status: z.string().min(1).max(255),
  due_at: z.string().datetime().optional(),
  blockers: z.array(z.string().max(CIF_MAX_STRING_LENGTH)).max(CIF_MAX_ARRAY_LENGTH).optional(),
});

/**
 * Add message request schema
 */
export const AddMessageRequestSchema = z.object({
  thread_id: z.string().uuid(),
  namespace_id: z.string().min(1).max(255),
  message: z.string().min(1).max(CIF_MAX_STRING_LENGTH),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Memory query request schema
 */
export const MemoryQueryRequestSchema = z.object({
  namespace_id: z.string().min(1).max(255),
  query: z.string().min(1).max(CIF_MAX_STRING_LENGTH),
  limit: z.number().int().min(1).max(1000).optional(),
  filters: z.record(z.unknown()).optional(),
});

// ============================================================================
// CIF Ingress Validation
// ============================================================================

/**
 * Validate CIF ingress (request coming in)
 */
export function validateCifIngress(
  context: {
    trace_id: string;
    principal_id: string;
    oi_id: string;
    intent: string;
  },
  payload: unknown
): CifValidationResult {
  const errors: string[] = [];

  // Validate context fields
  if (!context.trace_id) {
    errors.push('context.trace_id: required');
  }
  if (!context.principal_id) {
    errors.push('context.principal_id: required');
  }
  if (!context.oi_id) {
    errors.push('context.oi_id: required');
  }
  if (!context.intent) {
    errors.push('context.intent: required');
  }

  // Check for oversized strings in payload
  if (payload !== null && payload !== undefined) {
    errors.push(...checkStringLimits(payload, ['payload']));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: payload };
}

// ============================================================================
// CIF Egress Validation
// ============================================================================

/**
 * Validate CIF egress (response going out)
 */
export function validateCifEgress(
  context: {
    trace_id: string;
    oi_id: string;
  },
  response: unknown
): CifValidationResult {
  const errors: string[] = [];

  // Check for oversized strings in response
  if (response !== null && response !== undefined) {
    errors.push(...checkStringLimits(response, ['response']));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: response };
}

// ============================================================================
// Taint Checking
// ============================================================================

/**
 * Taint rules for checking data flow
 */
export interface TaintRule {
  /** Pattern to match in data */
  pattern: RegExp;
  /** Taint label to apply if matched */
  label: string;
  /** Whether this taint is blocking (fails validation) */
  blocking: boolean;
  /** Reason for the taint */
  reason: string;
}

/**
 * Default taint rules
 */
export const DEFAULT_TAINT_RULES: TaintRule[] = [
  {
    pattern: /password|secret|api[_-]?key|token|credential/i,
    label: 'potential_secret',
    blocking: false, // Warn but don't block
    reason: 'Potential secret detected in data',
  },
  {
    pattern: /<script|javascript:|on\w+=/i,
    label: 'potential_xss',
    blocking: true,
    reason: 'Potential XSS payload detected',
  },
  {
    pattern: /\bDROP\s+TABLE|DELETE\s+FROM|UPDATE\s+.*SET|INSERT\s+INTO/i,
    label: 'potential_sql_injection',
    blocking: true,
    reason: 'Potential SQL injection detected',
  },
];

/**
 * Check for tainted data
 */
export function checkTaint(
  data: unknown,
  rules: TaintRule[] = DEFAULT_TAINT_RULES
): { tainted: boolean; labels: string[]; blocking: boolean; reasons: string[] } {
  const labels: string[] = [];
  const reasons: string[] = [];
  let blocking = false;

  const checkValue = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const rule of rules) {
        if (rule.pattern.test(value)) {
          labels.push(rule.label);
          reasons.push(rule.reason);
          if (rule.blocking) {
            blocking = true;
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach(checkValue);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(checkValue);
    }
  };

  checkValue(data);

  return {
    tainted: labels.length > 0,
    labels: [...new Set(labels)],
    blocking,
    reasons: [...new Set(reasons)],
  };
}
