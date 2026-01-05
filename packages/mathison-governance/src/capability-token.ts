/**
 * P0.4: Capability Tokens
 *
 * Minted tokens that grant specific capabilities to actors
 * Each token is:
 * - Scoped to a specific action, actor, and context
 * - Time-limited (TTL)
 * - Use-limited (max_use, default 1)
 * - Cryptographically signed to prevent forgery
 *
 * Purpose: Close verification asymmetry - ActionGate validates token, not just verdict
 */

import { createHmac, randomBytes, createHash } from 'crypto';
import { validateActionId } from './action-registry';

// Use governance boot key for token signing
// (Will be initialized from governance-proof boot key)
let TOKEN_SIGNING_KEY: Buffer | null = null;
let TOKEN_KEY_ID: string | null = null;

/**
 * Initialize token signing key (called at server startup)
 */
export function initializeTokenKey(bootKey: Buffer, bootKeyId: string): void {
  TOKEN_SIGNING_KEY = bootKey;
  TOKEN_KEY_ID = bootKeyId;
  console.log(`🎫 Capability tokens: Using boot key ID ${bootKeyId}`);
}

/**
 * Get token signing key (throws if not initialized)
 */
function getTokenSigningKey(): Buffer {
  if (!TOKEN_SIGNING_KEY) {
    throw new Error('TOKEN_KEY_NOT_INITIALIZED: Call initializeTokenKey() first');
  }
  return TOKEN_SIGNING_KEY;
}

/**
 * Get token key ID
 */
export function getTokenKeyId(): string {
  if (!TOKEN_KEY_ID) {
    throw new Error('TOKEN_KEY_NOT_INITIALIZED: Call initializeTokenKey() first');
  }
  return TOKEN_KEY_ID;
}

/**
 * Capability token structure
 */
export interface CapabilityToken {
  token_id: string; // Unique token ID
  action_id: string; // Canonical action ID from registry
  actor: string; // Who is authorized (e.g., request IP, user ID)
  context: {
    route?: string; // HTTP route
    method?: string; // HTTP method
    request_hash?: string; // Hash of request for binding
  };
  issued_at: string; // ISO timestamp
  expires_at: string; // ISO timestamp
  max_use: number; // Max number of uses (default 1)
  use_count: number; // Current use count
  signature: string; // HMAC signature
  boot_key_id: string; // Boot key ID for session binding
}

/**
 * Mint a new capability token
 */
export function mintToken(options: {
  action_id: string;
  actor: string;
  context?: {
    route?: string;
    method?: string;
    request_hash?: string;
  };
  ttl_ms?: number; // Time to live in milliseconds (default: 60s)
  max_use?: number; // Max uses (default: 1)
}): CapabilityToken {
  // Validate action ID is registered
  validateActionId(options.action_id);

  const tokenId = randomBytes(16).toString('hex');
  const issuedAt = new Date();
  const ttlMs = options.ttl_ms ?? 60000; // Default: 60 seconds
  const expiresAt = new Date(issuedAt.getTime() + ttlMs);

  const token: Omit<CapabilityToken, 'signature' | 'boot_key_id'> = {
    token_id: tokenId,
    action_id: options.action_id,
    actor: options.actor,
    context: options.context || {},
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    max_use: options.max_use ?? 1,
    use_count: 0
  };

  // Sign token
  const signature = signToken(token);

  return {
    ...token,
    signature,
    boot_key_id: getTokenKeyId()
  };
}

/**
 * Sign a token with HMAC
 */
function signToken(token: Omit<CapabilityToken, 'signature' | 'boot_key_id'>): string {
  const key = getTokenSigningKey();
  const data = JSON.stringify({
    token_id: token.token_id,
    action_id: token.action_id,
    actor: token.actor,
    context: token.context,
    issued_at: token.issued_at,
    expires_at: token.expires_at,
    max_use: token.max_use,
    use_count: token.use_count
  });
  return createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Verify token signature
 */
function verifyTokenSignature(token: CapabilityToken): boolean {
  try {
    const expectedSignature = signToken(token);
    return token.signature === expectedSignature;
  } catch (error) {
    console.error('Token signature verification failed:', error);
    return false;
  }
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  errors: string[];
  token?: CapabilityToken; // Updated token with incremented use_count
}

/**
 * Validate a capability token
 *
 * Checks:
 * - Signature validity
 * - Boot key ID matches (prevents cross-session reuse)
 * - Not expired
 * - Use count within limit
 * - Action ID matches (if checking context)
 *
 * Returns updated token with incremented use_count if valid
 */
export function validateToken(
  token: CapabilityToken,
  options?: {
    expected_action_id?: string; // Enforce action ID match
    expected_actor?: string; // Enforce actor match
    increment_use?: boolean; // Increment use count (default: true)
  }
): TokenValidationResult {
  const errors: string[] = [];
  const incrementUse = options?.increment_use ?? true;

  // Check boot key ID
  if (token.boot_key_id !== getTokenKeyId()) {
    errors.push('Token from different boot session (key ID mismatch)');
  }

  // Verify signature
  if (!verifyTokenSignature(token)) {
    errors.push('Invalid token signature (forgery detected)');
  }

  // Check expiry
  const now = new Date();
  const expiresAt = new Date(token.expires_at);
  if (now >= expiresAt) {
    errors.push(`Token expired at ${token.expires_at}`);
  }

  // Check use count
  if (token.use_count >= token.max_use) {
    errors.push(`Token exhausted (use_count ${token.use_count} >= max_use ${token.max_use})`);
  }

  // Check action ID match (if specified)
  if (options?.expected_action_id && token.action_id !== options.expected_action_id) {
    errors.push(`Action ID mismatch (token: ${token.action_id}, expected: ${options.expected_action_id})`);
  }

  // Check actor match (if specified)
  if (options?.expected_actor && token.actor !== options.expected_actor) {
    errors.push(`Actor mismatch (token: ${token.actor}, expected: ${options.expected_actor})`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Token is valid - increment use count if requested
  if (incrementUse) {
    const updatedToken: CapabilityToken = {
      ...token,
      use_count: token.use_count + 1
    };

    // Re-sign with updated use_count
    updatedToken.signature = signToken(updatedToken);

    return { valid: true, errors: [], token: updatedToken };
  }

  return { valid: true, errors: [], token };
}

/**
 * Create a single-use token for a specific action
 * (Convenience function for common case)
 */
export function mintSingleUseToken(
  actionId: string,
  actor: string,
  context?: { route?: string; method?: string; request_hash?: string }
): CapabilityToken {
  return mintToken({
    action_id: actionId,
    actor,
    context,
    ttl_ms: 60000, // 60s TTL
    max_use: 1
  });
}

/**
 * Assert token is valid (throws on invalid)
 */
export function assertTokenValid(
  token: CapabilityToken | undefined,
  options?: {
    expected_action_id?: string;
    expected_actor?: string;
  }
): CapabilityToken {
  if (!token) {
    throw new Error('TOKEN_MISSING: No capability token provided');
  }

  const validation = validateToken(token, { ...options, increment_use: false });

  if (!validation.valid) {
    throw new Error(`TOKEN_INVALID: ${validation.errors.join('; ')}`);
  }

  return token;
}
