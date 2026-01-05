/**
 * P0.2: Storage Sealing Mechanism
 *
 * Purpose: Prevent governance bypass by direct storage access
 *
 * After server boot completes, storage is "sealed" - only governance-authorized
 * components (ActionGate) can create new storage adapters. This prevents handlers
 * from bypassing governance by importing storage directly.
 *
 * Attack prevention:
 * ```typescript
 * // ❌ This should fail after sealing:
 * import { makeStorageAdapterFromEnv } from 'mathison-storage';
 * const adapter = makeStorageAdapterFromEnv(); // BLOCKED
 * await adapter.init();
 * await adapter.getGraphStore().addNode({ ... }); // Never reached
 * ```
 */

import { randomBytes } from 'crypto';

/**
 * Governance capability token - only governance components can hold this
 */
export const GOVERNANCE_CAPABILITY_TOKEN = Symbol.for('mathison.governance.capability');

/**
 * Storage seal state
 */
let sealed = false;
let sealedAt: Date | null = null;

/**
 * The actual governance token value (random, created at seal time)
 */
let governanceTokenValue: symbol | null = null;

/**
 * Seal storage - after this point, only governance-authorized calls can create adapters
 * Can only be called once (idempotent after first call)
 *
 * @returns The governance token to be held by ActionGate
 */
export function sealStorage(): symbol {
  if (sealed && governanceTokenValue) {
    // Already sealed - return the existing token (idempotent)
    console.warn('⚠️  Storage already sealed, returning existing token');
    return governanceTokenValue;
  }

  sealed = true;
  sealedAt = new Date();

  // Create a unique token for this boot session
  governanceTokenValue = Symbol.for(`mathison.gov.token.${randomBytes(16).toString('hex')}`);

  console.log(`🔒 Storage SEALED at ${sealedAt.toISOString()}`);
  console.log('   Only governance-authorized components can create storage adapters');

  return governanceTokenValue;
}

/**
 * Check if storage is sealed
 */
export function isStorageSealed(): boolean {
  return sealed;
}

/**
 * Get seal timestamp (for audit/debugging)
 */
export function getSealedAt(): Date | null {
  return sealedAt;
}

/**
 * Verify governance capability token
 *
 * @param token The token to verify
 * @returns true if token is valid and storage is sealed
 */
export function verifyGovernanceCapability(token: symbol | undefined): boolean {
  if (!sealed) {
    // Not sealed yet - allow (pre-boot setup phase)
    return true;
  }

  if (!token || !governanceTokenValue) {
    return false;
  }

  // Compare symbols by converting to string (symbol identity)
  return token.toString() === governanceTokenValue.toString();
}

/**
 * Assert that caller has governance capability
 * Throws if storage is sealed and token is invalid
 *
 * @param token The governance capability token
 * @throws Error if governance capability check fails
 */
export function assertGovernanceCapability(token: symbol | undefined): void {
  if (!sealed) {
    // Not sealed yet - allow all
    return;
  }

  if (!verifyGovernanceCapability(token)) {
    throw new Error(
      'GOVERNANCE_BYPASS_DETECTED: Storage is sealed. ' +
      'Only governance-authorized components (ActionGate) can create storage adapters. ' +
      'Direct storage access is blocked to prevent governance bypass.'
    );
  }
}

/**
 * Unseal storage (for testing only - DO NOT use in production)
 * This is dangerous and should only be used in test teardown
 */
export function unsealStorageForTesting(): void {
  if (process.env.NODE_ENV === 'production' || process.env.MATHISON_ENV === 'production') {
    throw new Error('UNSEAL_FORBIDDEN: Cannot unseal storage in production');
  }

  sealed = false;
  sealedAt = null;
  governanceTokenValue = null;
  console.warn('⚠️  Storage UNSEALED (testing only)');
}
