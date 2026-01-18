/**
 * P0.4: Capability Token Tests
 */

import { randomBytes } from 'crypto';
import {
  initializeTokenKey,
  getTokenKeyId,
  mintToken,
  mintSingleUseToken,
  validateToken,
  assertTokenValid,
  CapabilityToken
} from '../capability-token';

describe('Capability Token - P0.4', () => {
  beforeAll(() => {
    // Initialize token key for tests
    const testKey = randomBytes(32);
    const testKeyId = 'test_token_key';
    initializeTokenKey(testKey, testKeyId);
  });

  describe('Token minting', () => {
    it('should mint token for registered action', () => {
      const token = mintToken({
        action_id: 'action:read:genome',
        actor: 'user123'
      });

      expect(token).toBeDefined();
      expect(token.token_id).toBeDefined();
      expect(token.action_id).toBe('action:read:genome');
      expect(token.actor).toBe('user123');
      expect(token.max_use).toBe(1); // Default single-use
      expect(token.use_count).toBe(0);
      expect(token.signature).toBeDefined();
      expect(token.boot_key_id).toBe(getTokenKeyId());
    });

    it('should mint token with context', () => {
      const token = mintToken({
        action_id: 'action:write:storage',
        actor: 'user123',
        context: {
          route: '/api/storage',
          method: 'POST',
          request_hash: 'abc123'
        }
      });

      expect(token.context.route).toBe('/api/storage');
      expect(token.context.method).toBe('POST');
      expect(token.context.request_hash).toBe('abc123');
    });

    it('should mint token with custom TTL', () => {
      const token = mintToken({
        action_id: 'action:read:config',
        actor: 'user123',
        ttl_ms: 120000 // 2 minutes
      });

      const issuedAt = new Date(token.issued_at);
      const expiresAt = new Date(token.expires_at);
      const ttl = expiresAt.getTime() - issuedAt.getTime();

      expect(ttl).toBe(120000);
    });

    it('should mint token with custom max_use', () => {
      const token = mintToken({
        action_id: 'action:read:genome',
        actor: 'user123',
        max_use: 5
      });

      expect(token.max_use).toBe(5);
    });

    it('should throw on unregistered action', () => {
      expect(() =>
        mintToken({
          action_id: 'action:nonexistent',
          actor: 'user123'
        })
      ).toThrow('UNREGISTERED_ACTION');
    });
  });

  describe('Single-use token convenience', () => {
    it('should mint single-use token', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      expect(token.max_use).toBe(1);
      expect(token.use_count).toBe(0);
    });

    it('should mint single-use token with context', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123', {
        route: '/api/genome',
        method: 'GET'
      });

      expect(token.max_use).toBe(1);
      expect(token.context.route).toBe('/api/genome');
      expect(token.context.method).toBe('GET');
    });
  });

  describe('Token validation', () => {
    it('should validate fresh token', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      const validation = validateToken(token, { increment_use: false });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should increment use count when validating', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      const validation = validateToken(token, { increment_use: true });

      expect(validation.valid).toBe(true);
      expect(validation.token?.use_count).toBe(1);
    });

    it('should reject token with wrong boot key ID', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      token.boot_key_id = 'wrong_key_id';

      const validation = validateToken(token, { increment_use: false });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('key ID mismatch'))).toBe(true);
    });

    it('should reject token with invalid signature', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      token.signature = 'tampered_signature';

      const validation = validateToken(token, { increment_use: false });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Invalid token signature'))).toBe(true);
    });

    it('should reject expired token', () => {
      const token = mintToken({
        action_id: 'action:read:genome',
        actor: 'user123',
        ttl_ms: -1000 // Already expired
      });

      const validation = validateToken(token, { increment_use: false });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('expired'))).toBe(true);
    });

    it('should reject exhausted token', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      token.use_count = 1; // Exhausted (max_use is 1)

      const validation = validateToken(token, { increment_use: false });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('exhausted'))).toBe(true);
    });

    it('should validate action ID match', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      const validation = validateToken(token, {
        expected_action_id: 'action:read:genome',
        increment_use: false
      });

      expect(validation.valid).toBe(true);
    });

    it('should reject action ID mismatch', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      const validation = validateToken(token, {
        expected_action_id: 'action:read:config',
        increment_use: false
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Action ID mismatch'))).toBe(true);
    });

    it('should validate actor match', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      const validation = validateToken(token, {
        expected_actor: 'user123',
        increment_use: false
      });

      expect(validation.valid).toBe(true);
    });

    it('should reject actor mismatch', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      const validation = validateToken(token, {
        expected_actor: 'user456',
        increment_use: false
      });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Actor mismatch'))).toBe(true);
    });
  });

  describe('Token assertion', () => {
    it('should assert valid token', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      expect(() => assertTokenValid(token)).not.toThrow();
    });

    it('should throw on missing token', () => {
      expect(() => assertTokenValid(undefined)).toThrow('TOKEN_MISSING');
    });

    it('should throw on invalid token', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      token.signature = 'tampered';

      expect(() => assertTokenValid(token)).toThrow('TOKEN_INVALID');
    });

    it('should assert with action ID check', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      expect(() =>
        assertTokenValid(token, { expected_action_id: 'action:read:genome' })
      ).not.toThrow();
    });

    it('should throw on action ID mismatch', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');

      expect(() =>
        assertTokenValid(token, { expected_action_id: 'action:read:config' })
      ).toThrow('TOKEN_INVALID');
    });
  });

  describe('Multi-use tokens', () => {
    it('should allow multiple uses within limit', () => {
      const token = mintToken({
        action_id: 'action:read:genome',
        actor: 'user123',
        max_use: 3
      });

      // Use 1
      const validation1 = validateToken(token, { increment_use: true });
      expect(validation1.valid).toBe(true);
      expect(validation1.token?.use_count).toBe(1);

      // Use 2
      const validation2 = validateToken(validation1.token!, { increment_use: true });
      expect(validation2.valid).toBe(true);
      expect(validation2.token?.use_count).toBe(2);

      // Use 3
      const validation3 = validateToken(validation2.token!, { increment_use: true });
      expect(validation3.valid).toBe(true);
      expect(validation3.token?.use_count).toBe(3);

      // Use 4 (should fail - exhausted)
      const validation4 = validateToken(validation3.token!, { increment_use: true });
      expect(validation4.valid).toBe(false);
      expect(validation4.errors.some(e => e.includes('exhausted'))).toBe(true);
    });
  });

  describe('Token tampering detection', () => {
    it('should detect modified action_id', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      (token as any).action_id = 'action:read:config';

      const validation = validateToken(token, { increment_use: false });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('signature'))).toBe(true);
    });

    it('should detect modified actor', () => {
      const token = mintSingleUseToken('action:read:genome', 'user123');
      (token as any).actor = 'user456';

      const validation = validateToken(token, { increment_use: false });

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('signature'))).toBe(true);
    });

    it('should detect modified use_count', () => {
      const token = mintToken({
        action_id: 'action:read:genome',
        actor: 'user123',
        max_use: 5
      });

      // Tamper with use_count to fake it being unused
      (token as any).use_count = 0;

      const validation = validateToken(token, { increment_use: false });

      // Signature won't match if use_count was actually higher
      expect(validation.valid).toBe(true); // Since we start from 0, it's valid

      // But if we increment and then tamper:
      const validation2 = validateToken(token, { increment_use: true });
      const tamperedToken = validation2.token!;
      (tamperedToken as any).use_count = 0; // Reset to fake unused

      const validation3 = validateToken(tamperedToken, { increment_use: false });
      expect(validation3.valid).toBe(false);
      expect(validation3.errors.some(e => e.includes('signature'))).toBe(true);
    });
  });
});
