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

import { randomBytes, timingSafeEqual } from 'crypto';

/**
 * ATTACK 10 FIX: Use cryptographic capability tokens instead of Symbols
 * Symbols can be forged via Symbol.for(), but crypto tokens cannot
 */
export interface GovernanceCapabilityToken {
  secret: Buffer;
  issuedAt: Date;
}

/**
 * Storage seal state
 */
let sealed = false;
let sealedAt: Date | null = null;

/**
 * The actual governance token value (cryptographic random, created at seal time)
 */
let governanceTokenValue: Buffer | null = null;

/**
 * Seal storage - after this point, only governance-authorized calls can create adapters
 * Can only be called once (idempotent after first call)
 *
 * @returns The governance token to be held by ActionGate
 */
export function sealStorage(): GovernanceCapabilityToken {
  if (sealed && governanceTokenValue) {
    // Already sealed - return the existing token (idempotent)
    console.warn('⚠️  Storage already sealed, returning existing token');
    return {
      secret: governanceTokenValue,
      issuedAt: sealedAt!
    };
  }

  sealed = true;
  sealedAt = new Date();

  // ATTACK 10 FIX: Create a cryptographic random token (32 bytes = 256 bits)
  // This cannot be forged unlike Symbol.for()
  governanceTokenValue = randomBytes(32);

  console.log(`🔒 Storage SEALED at ${sealedAt.toISOString()}`);
  console.log('   Only governance-authorized components can create storage adapters');
  console.log(`   Token: ${governanceTokenValue.toString('hex').substring(0, 16)}... (truncated)`);

  return {
    secret: governanceTokenValue,
    issuedAt: sealedAt
  };
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
 * ATTACK 10 FIX: Verify governance capability token using constant-time comparison
 * Prevents timing attacks to discover the token value
 *
 * @param token The token to verify
 * @returns true if token is valid and storage is sealed
 */
export function verifyGovernanceCapability(token: GovernanceCapabilityToken | undefined): boolean {
  if (!sealed) {
    // Not sealed yet - allow (pre-boot setup phase)
    return true;
  }

  if (!token || !token.secret || !governanceTokenValue) {
    return false;
  }

  // ATTACK 10 FIX: Use constant-time comparison to prevent timing attacks
  try {
    if (token.secret.length !== governanceTokenValue.length) {
      return false;
    }
    return timingSafeEqual(token.secret, governanceTokenValue);
  } catch (error) {
    // timingSafeEqual throws if buffers are different lengths
    return false;
  }
}

/**
 * Assert that caller has governance capability
 * Throws if storage is sealed and token is invalid
 *
 * @param token The governance capability token
 * @throws Error if governance capability check fails
 */
export function assertGovernanceCapability(token: GovernanceCapabilityToken | undefined): void {
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
