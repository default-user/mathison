/**
 * CPACK (Content Provenance ACtion pacKet) Schema
 *
 * Defines the structure for knowledge ingestion packets that ensure
 * grounded claims are stored, not hallucinations.
 */

import { z } from 'zod';

/**
 * CPACK Procedure Step Schema
 */
export const CPACKProcedureStepSchema = z.object({
  step: z.string(),
  description: z.string().optional(),
});

/**
 * CPACK Pointer (chunk reference) Schema
 */
export const CPACKPointerSchema = z.object({
  chunk_id: z.string(),
  source_uri: z.string().optional(),
  namespace: z.string().optional(),
});

/**
 * CPACK Rules Schema
 */
export const CPACKRulesSchema = z.object({
  require_fetch_for: z.array(z.string()).default([]),
  allowed_chunk_namespaces: z.array(z.string()).optional(),
  max_hypotheses: z.number().optional(),
});

/**
 * CPACK Integrity Schema
 */
export const CPACKIntegritySchema = z.object({
  template_checksum: z.string().optional(),
  sources_hash: z.string().optional(),
});

/**
 * CPACK Signing Schema
 */
export const CPACKSigningSchema = z.object({
  signature: z.string().optional(),
  key_id: z.string().optional(),
  algorithm: z.string().optional(),
});

/**
 * Full CPACK Schema
 */
export const CPACKSchema = z.object({
  packet_id: z.string(),
  version: z.string().default('1.0.0'),

  rules: CPACKRulesSchema,
  pointers: z.object({
    cross_refs: z.array(CPACKPointerSchema).default([]),
  }),
  procedure: z.object({
    steps: z.array(CPACKProcedureStepSchema).default([]),
  }),

  integrity: CPACKIntegritySchema.optional(),
  signing: CPACKSigningSchema.optional(),
});

export type CPACK = z.infer<typeof CPACKSchema>;
export type CPACKPointer = z.infer<typeof CPACKPointerSchema>;
export type CPACKRules = z.infer<typeof CPACKRulesSchema>;
export type CPACKProcedureStep = z.infer<typeof CPACKProcedureStepSchema>;
export type CPACKIntegrity = z.infer<typeof CPACKIntegritySchema>;
export type CPACKSigning = z.infer<typeof CPACKSigningSchema>;

/**
 * Parse and validate a CPACK from YAML string
 */
export function parseCPACK(yamlString: string): { success: true; data: CPACK } | { success: false; error: string } {
  try {
    // Dynamic import to avoid bundling yaml in browser contexts
    const YAML = require('yaml');
    const parsed = YAML.parse(yamlString);

    const result = CPACKSchema.safeParse(parsed);
    if (!result.success) {
      return { success: false, error: `CPACK validation failed: ${result.error.message}` };
    }

    return { success: true, data: result.data };
  } catch (err) {
    return { success: false, error: `YAML parse error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Parse and validate a CPACK from object
 */
export function validateCPACK(obj: unknown): { success: true; data: CPACK } | { success: false; error: string } {
  const result = CPACKSchema.safeParse(obj);
  if (!result.success) {
    return { success: false, error: `CPACK validation failed: ${result.error.message}` };
  }

  return { success: true, data: result.data };
}
