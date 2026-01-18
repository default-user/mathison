/**
 * Mathison v2.1 Governance
 *
 * Governance capsule management, CIF validation, and CDI enforcement.
 */

// Types
export * from './types';

// Capsule management
export {
  GovernanceCapsuleLoader,
  CapsuleLoaderConfig,
  createCapsuleLoader,
} from './capsule';

// CIF validation
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
