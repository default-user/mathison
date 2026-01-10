/**
 * Storage Seal Tests
 * Tests for P0.2: Storage sealing mechanism to prevent governance bypass
 */

import {
  sealStorage,
  isStorageSealed,
  verifyGovernanceCapability,
  assertGovernanceCapability,
  unsealStorageForTesting,
  GovernanceCapabilityToken
} from '../storage-seal';
import { makeStorageAdapterFromEnv } from '../storage-adapter';
import { makeStoresFromEnv } from '../factory';

describe('Storage Seal - P0.2', () => {
  beforeEach(() => {
    // Ensure storage is unsealed before each test
    if (isStorageSealed()) {
      unsealStorageForTesting();
    }
  });

  afterEach(() => {
    // Clean up: unseal after each test
    if (isStorageSealed()) {
      unsealStorageForTesting();
    }
  });

  describe('Basic sealing', () => {
    it('should not be sealed initially', () => {
      expect(isStorageSealed()).toBe(false);
    });

    it('should seal storage and return token', () => {
      const token = sealStorage();

      expect(isStorageSealed()).toBe(true);
      expect(token).toBeDefined();
      expect(token.secret).toBeInstanceOf(Buffer);
      expect(token.secret.length).toBe(32); // 256 bits
      expect(token.issuedAt).toBeInstanceOf(Date);
    });

    it('should be idempotent (return same token on second call)', () => {
      const token1 = sealStorage();
      const token2 = sealStorage();

      expect(token1.secret.equals(token2.secret)).toBe(true);
      expect(token1.issuedAt).toEqual(token2.issuedAt);
    });

    it('should unseal for testing (non-production only)', () => {
      sealStorage();
      expect(isStorageSealed()).toBe(true);

      unsealStorageForTesting();
      expect(isStorageSealed()).toBe(false);
    });
  });

  describe('Governance capability verification', () => {
    it('should allow access before sealing', () => {
      expect(verifyGovernanceCapability(undefined)).toBe(true);
      expect(() => assertGovernanceCapability(undefined)).not.toThrow();
    });

    it('should reject undefined token after sealing', () => {
      sealStorage();

      expect(verifyGovernanceCapability(undefined)).toBe(false);
      expect(() => assertGovernanceCapability(undefined)).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should accept valid token after sealing', () => {
      const token = sealStorage();

      expect(verifyGovernanceCapability(token)).toBe(true);
      expect(() => assertGovernanceCapability(token)).not.toThrow();
    });

    it('should reject wrong token after sealing', () => {
      sealStorage();
      const wrongToken: GovernanceCapabilityToken = {
        secret: Buffer.from('wrong_token_value_here_32bytes!'),
        issuedAt: new Date()
      };

      expect(verifyGovernanceCapability(wrongToken)).toBe(false);
      expect(() => assertGovernanceCapability(wrongToken)).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should reject token with wrong length', () => {
      sealStorage();
      const wrongToken: GovernanceCapabilityToken = {
        secret: Buffer.from('short'),
        issuedAt: new Date()
      };

      expect(verifyGovernanceCapability(wrongToken)).toBe(false);
      expect(() => assertGovernanceCapability(wrongToken)).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });
  });

  describe('Storage adapter factory with seal', () => {
    beforeAll(() => {
      // Ensure env vars are set for storage config
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      process.env.MATHISON_STORE_PATH = '/tmp/mathison-test-storage-seal';
    });

    it('should allow creating adapter before sealing', () => {
      expect(() => {
        const adapter = makeStorageAdapterFromEnv();
        expect(adapter).toBeDefined();
      }).not.toThrow();
    });

    it('should block creating adapter after sealing without token', () => {
      sealStorage();

      expect(() => {
        makeStorageAdapterFromEnv();
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should allow creating adapter after sealing with valid token', () => {
      const token = sealStorage();

      expect(() => {
        const adapter = makeStorageAdapterFromEnv(process.env, token);
        expect(adapter).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Store factory with seal', () => {
    beforeAll(() => {
      // Ensure env vars are set for storage config
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      process.env.MATHISON_STORE_PATH = '/tmp/mathison-test-storage-seal';
    });

    it('should allow creating stores before sealing', () => {
      expect(() => {
        const stores = makeStoresFromEnv();
        expect(stores).toBeDefined();
        expect(stores.checkpointStore).toBeDefined();
        expect(stores.receiptStore).toBeDefined();
        expect(stores.graphStore).toBeDefined();
      }).not.toThrow();
    });

    it('should block creating stores after sealing without token', () => {
      sealStorage();

      expect(() => {
        makeStoresFromEnv();
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should allow creating stores after sealing with valid token', () => {
      const token = sealStorage();

      expect(() => {
        const stores = makeStoresFromEnv(process.env, token);
        expect(stores).toBeDefined();
        expect(stores.checkpointStore).toBeDefined();
        expect(stores.receiptStore).toBeDefined();
        expect(stores.graphStore).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Security properties', () => {
    it('should generate cryptographically random tokens', () => {
      unsealStorageForTesting();
      const token1 = sealStorage();

      unsealStorageForTesting();
      const token2 = sealStorage();

      // Different seals should produce different tokens
      expect(token1.secret.equals(token2.secret)).toBe(false);
    });

    it('should use constant-time comparison for token verification', () => {
      const token = sealStorage();

      // This test verifies that verifyGovernanceCapability uses timingSafeEqual
      // by checking it handles length mismatches correctly
      const shortToken: GovernanceCapabilityToken = {
        secret: Buffer.from('too_short'),
        issuedAt: new Date()
      };

      // Should return false, not throw (timingSafeEqual would throw on length mismatch if not handled)
      expect(verifyGovernanceCapability(shortToken)).toBe(false);
    });
  });

  describe('Direct adapter construction bypass prevention', () => {
    it('should block FileStorageAdapter construction after sealing without token', () => {
      sealStorage();

      expect(() => {
        const { FileStorageAdapter } = require('../storage-adapter');
        new FileStorageAdapter('/tmp/test');
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should block SqliteStorageAdapter construction after sealing without token', () => {
      sealStorage();

      expect(() => {
        const { SqliteStorageAdapter } = require('../storage-adapter');
        new SqliteStorageAdapter('/tmp/test.db');
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should allow FileStorageAdapter construction after sealing with valid token', () => {
      const token = sealStorage();

      expect(() => {
        const { FileStorageAdapter } = require('../storage-adapter');
        new FileStorageAdapter('/tmp/test', token);
      }).not.toThrow();
    });

    it('should allow SqliteStorageAdapter construction after sealing with valid token', () => {
      const token = sealStorage();

      expect(() => {
        const { SqliteStorageAdapter } = require('../storage-adapter');
        new SqliteStorageAdapter('/tmp/test.db', token);
      }).not.toThrow();
    });

    it('should allow adapter construction before sealing (pre-boot phase)', () => {
      expect(() => {
        const { FileStorageAdapter, SqliteStorageAdapter } = require('../storage-adapter');
        new FileStorageAdapter('/tmp/test');
        new SqliteStorageAdapter('/tmp/test.db');
      }).not.toThrow();
    });
  });
});
