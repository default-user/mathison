// WHY: CIF validates input schema and sanitizes data to prevent injection attacks

import { z } from 'zod';
import { ValidationResult } from './types';

// WHY: Max length constraints prevent payload bombing and memory exhaustion
export const CIF_MAX_STRING_LENGTH = 10000;
export const CIF_MAX_ARRAY_LENGTH = 1000;

/**
 * WHY: Zod-based schema validator for CIF ingress, replaces stub with real validation.
 * Enforces required fields, type constraints, and max lengths.
 */
export function validateCIF<T>(schema: z.ZodSchema<T>, input: unknown): ValidationResult<T> {
  // WHY: Fail-fast on null/undefined before schema parsing
  if (input === null || input === undefined) {
    return {
      valid: false,
      errors: ['Input cannot be null or undefined'],
    };
  }

  const result = schema.safeParse(input);

  if (!result.success) {
    // WHY: Extract human-readable error messages from zod validation
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    data: result.data,
  };
}

/**
 * WHY: Common request schema with enforced constraints.
 * All CIF ingress should validate against this or a derivative.
 */
export const BaseRequestSchema = z.object({
  namespace_id: z.string().min(1).max(128),
  // WHY: thread_id is optional for namespace-level operations
  thread_id: z.string().min(1).max(128).optional(),
});

/**
 * WHY: Schema for thread creation requests
 */
export const CreateThreadRequestSchema = BaseRequestSchema.extend({
  scope: z.string().min(1).max(CIF_MAX_STRING_LENGTH),
  priority: z.number().int().min(0).max(100),
});

/**
 * WHY: Schema for adding commitments to a thread
 */
export const AddCommitmentRequestSchema = z.object({
  thread_id: z.string().min(1).max(128),
  next_action: z.string().min(1).max(CIF_MAX_STRING_LENGTH),
  status: z.string().min(1).max(256),
  due_at: z.string().datetime().optional(),
  blockers: z.array(z.string().max(CIF_MAX_STRING_LENGTH)).max(CIF_MAX_ARRAY_LENGTH).optional(),
});

export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;
export type AddCommitmentRequest = z.infer<typeof AddCommitmentRequestSchema>;

/**
 * WHY: Quarantine invalid input for audit
 */
export function quarantineInvalidInput(input: any, errors: string[]): void {
  // TODO: Log to event log
  console.error('[CIF] Quarantined invalid input', { input, errors });
}

/**
 * WHY: Egress redaction prevents cross-namespace leakage
 */
export function redactEgress(output: any, namespace_id: string): any {
  // TODO: Implement redaction logic
  // TODO: Scan for namespace_id references
  // TODO: Redact sensitive fields
  return output;
}
