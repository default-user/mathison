/**
 * P0.3: Token Ledger - Server-side replay protection for capability tokens
 *
 * Purpose: Close the verification asymmetry where "single-use" tokens could be replayed
 * because there was no server-side record of token usage.
 *
 * Design:
 * - In-memory ledger keyed by (boot_key_id, token_id)
 * - Token IDs are recorded as "spent" on first valid use
 * - Subsequent uses are denied (replay attack prevention)
 * - Ledger entries expire after token expiry + grace window
 * - Ledger is scoped to boot session (cleared on restart)
 */

import { getBootKeyId } from './governance-proof';

interface LedgerEntry {
  token_id: string;
  action_id: string;
  actor: string;
  first_use_at: Date;
  expires_at: Date;
  request_hash?: string;
}

/**
 * Token ledger for replay protection
 * Single instance per server boot
 */
class TokenLedger {
  private entries: Map<string, LedgerEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private graceWindowMs: number;

  constructor(options?: { graceWindowMs?: number; cleanupIntervalMs?: number }) {
    this.graceWindowMs = options?.graceWindowMs ?? 60000; // 1 minute grace
    const cleanupIntervalMs = options?.cleanupIntervalMs ?? 60000; // Cleanup every minute

    // Start periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
    this.cleanupInterval.unref?.();
  }

  /**
   * Generate ledger key from boot key ID and token ID
   */
  private makeKey(bootKeyId: string, tokenId: string): string {
    return `${bootKeyId}:${tokenId}`;
  }

  /**
   * Check if a token has been spent (used before)
   * Does NOT record the token as spent - use markSpent() for that
   */
  isSpent(tokenId: string, bootKeyId?: string): boolean {
    const key = this.makeKey(bootKeyId ?? getBootKeyId(), tokenId);
    return this.entries.has(key);
  }

  /**
   * Mark a token as spent (record first use)
   * Returns true if this is the first use, false if already spent (replay)
   *
   * @param tokenId - Unique token ID
   * @param actionId - Action the token was used for
   * @param actor - Actor who used the token
   * @param expiresAt - Token expiry time (for ledger entry expiry)
   * @param requestHash - Optional hash of the request for binding verification
   * @param bootKeyId - Optional boot key ID (defaults to current)
   */
  markSpent(
    tokenId: string,
    actionId: string,
    actor: string,
    expiresAt: Date,
    requestHash?: string,
    bootKeyId?: string
  ): { success: boolean; error?: string } {
    const resolvedBootKeyId = bootKeyId ?? getBootKeyId();
    const key = this.makeKey(resolvedBootKeyId, tokenId);

    // Check if already spent
    if (this.entries.has(key)) {
      const existing = this.entries.get(key)!;
      return {
        success: false,
        error: `TOKEN_REPLAYED: Token ${tokenId} was already used at ${existing.first_use_at.toISOString()} ` +
               `for action ${existing.action_id} by ${existing.actor}`
      };
    }

    // Record as spent
    const entry: LedgerEntry = {
      token_id: tokenId,
      action_id: actionId,
      actor,
      first_use_at: new Date(),
      expires_at: new Date(expiresAt.getTime() + this.graceWindowMs),
      request_hash: requestHash
    };

    this.entries.set(key, entry);

    return { success: true };
  }

  /**
   * Validate and consume a token in one atomic operation
   * This is the preferred method for checking single-use tokens
   *
   * @returns Result with success/failure and any errors
   */
  validateAndConsume(
    tokenId: string,
    actionId: string,
    actor: string,
    expiresAt: Date,
    options?: {
      expectedRequestHash?: string;
      bootKeyId?: string;
    }
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const bootKeyId = options?.bootKeyId ?? getBootKeyId();

    // Check if from same boot session
    try {
      const currentBootKeyId = getBootKeyId();
      if (bootKeyId !== currentBootKeyId) {
        errors.push(`Token from different boot session (expected: ${currentBootKeyId}, got: ${bootKeyId})`);
        return { valid: false, errors };
      }
    } catch (e) {
      errors.push('Boot key not initialized');
      return { valid: false, errors };
    }

    // Check expiry
    const now = new Date();
    if (now >= expiresAt) {
      errors.push(`Token expired at ${expiresAt.toISOString()}`);
      return { valid: false, errors };
    }

    // Attempt to mark as spent (atomic check-and-set)
    const result = this.markSpent(tokenId, actionId, actor, expiresAt, options?.expectedRequestHash, bootKeyId);
    if (!result.success) {
      errors.push(result.error!);
      return { valid: false, errors };
    }

    // If request hash binding is required, verify it matches
    if (options?.expectedRequestHash) {
      const entry = this.entries.get(this.makeKey(bootKeyId, tokenId));
      if (entry && entry.request_hash && entry.request_hash !== options.expectedRequestHash) {
        errors.push(`Request hash mismatch (token bound to different request)`);
        return { valid: false, errors };
      }
    }

    return { valid: true, errors: [] };
  }

  /**
   * Get ledger entry for a token (for debugging/auditing)
   */
  getEntry(tokenId: string, bootKeyId?: string): LedgerEntry | undefined {
    const key = this.makeKey(bootKeyId ?? getBootKeyId(), tokenId);
    return this.entries.get(key);
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.entries) {
      if (now >= entry.expires_at) {
        this.entries.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🎫 TokenLedger: Cleaned up ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
   * Get current ledger size (for monitoring)
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Clear all entries (for testing only)
   */
  clear(): void {
    if (process.env.NODE_ENV === 'production' || process.env.MATHISON_ENV === 'production') {
      console.warn('⚠️  TokenLedger.clear() called in production - ignoring');
      return;
    }
    this.entries.clear();
  }

  /**
   * Shutdown ledger (stop cleanup timer)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Global token ledger instance
 * Scoped to boot session (entries reference boot key ID)
 */
let globalLedger: TokenLedger | null = null;

/**
 * Initialize the global token ledger
 * Should be called once at server startup, after boot key is initialized
 */
export function initializeTokenLedger(options?: { graceWindowMs?: number; cleanupIntervalMs?: number }): TokenLedger {
  if (globalLedger) {
    console.warn('⚠️  Token ledger already initialized');
    return globalLedger;
  }

  globalLedger = new TokenLedger(options);
  console.log('🎫 Token ledger initialized (replay protection enabled)');
  return globalLedger;
}

/**
 * Get the global token ledger
 * Throws if not initialized
 */
export function getTokenLedger(): TokenLedger {
  if (!globalLedger) {
    throw new Error('TOKEN_LEDGER_NOT_INITIALIZED: Call initializeTokenLedger() first');
  }
  return globalLedger;
}

/**
 * Check if token ledger is initialized
 */
export function isTokenLedgerInitialized(): boolean {
  return globalLedger !== null;
}

/**
 * Shutdown token ledger (for testing cleanup)
 */
export function shutdownTokenLedger(): void {
  if (globalLedger) {
    globalLedger.shutdown();
    globalLedger = null;
  }
}

// Export the class for testing
export { TokenLedger };
