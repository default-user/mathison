/**
 * WHY: index.ts - Governance package entry point
 * -----------------------------------------------------------------------------
 * - Exports governance capsule management, CIF validation, and CDI enforcement.
 * - All governance-related functionality must be imported from this module.
 * - v2.2 adds ai.chat schemas for Model Bus integration.
 *
 * INVARIANT: Fail-closed - invalid/missing governance = deny.
 * INVARIANT: All intents require CIF validation and CDI capability check.
 */

// Types
export * from './types';

// Capsule management
export {
  GovernanceCapsuleLoader,
  CapsuleLoaderConfig,
  createCapsuleLoader,
} from './capsule';

// CIF validation (including v2.2 ai.chat schemas)
export {
  validateCIF,
  checkStringLimits,
  validateCifIngress,
  validateCifEgress,
  checkTaint,
  TaintRule,
  DEFAULT_TAINT_RULES,
  BaseRequestSchema,
  CreateThreadRequestSchema,
  AddCommitmentRequestSchema,
  AddMessageRequestSchema,
  MemoryQueryRequestSchema,
  // v2.2 ai.chat schemas
  ALLOWED_MODEL_PATTERNS,
  isValidModelId,
  AiChatParametersSchema,
  AiChatRequestSchema,
  AiChatResponseSchema,
} from './cif';

// CDI enforcement
export {
  CdiActionChecker,
  CdiOutputChecker,
  isCrossNamespaceOperation,
  checkCDI,
  checkCDIPostAction,
} from './cdi';

// Governance provider (for pipeline integration)
export {
  GovernanceProviderImpl,
  createGovernanceProvider,
} from './provider';
