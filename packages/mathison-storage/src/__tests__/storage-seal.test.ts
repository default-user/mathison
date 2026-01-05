/**
 * P0.2: Storage Sealing Tests
 * Verify that storage sealing prevents governance bypass
 */

import {
  sealStorage,
  isStorageSealed,
  getSealedAt,
  verifyGovernanceCapability,
  assertGovernanceCapability,
  unsealStorageForTesting,
  GOVERNANCE_CAPABILITY_TOKEN
} from '../storage-seal';
import { makeStorageAdapterFromEnv } from '../storage-adapter';

describe('Storage Sealing - P0.2', () => {
  beforeEach(() => {
    // Ensure clean state for each test
    unsealStorageForTesting();
  });

  afterEach(() => {
    // Cleanup after each test
    unsealStorageForTesting();
  });

  describe('Seal state management', () => {
    it('should start unsealed', () => {
      expect(isStorageSealed()).toBe(false);
      expect(getSealedAt()).toBeNull();
    });

    it('should seal storage and return token', () => {
      const token = sealStorage();

      expect(token).toBeDefined();
      expect(typeof token).toBe('symbol');
      expect(isStorageSealed()).toBe(true);
      expect(getSealedAt()).toBeInstanceOf(Date);
    });

    it('should be idempotent (multiple seal calls return same token)', () => {
      const token1 = sealStorage();
      const token2 = sealStorage();

      expect(token1.toString()).toBe(token2.toString());
      expect(isStorageSealed()).toBe(true);
    });

    it('should record seal timestamp', () => {
      const before = new Date();
      sealStorage();
      const after = new Date();

      const sealedAt = getSealedAt();
      expect(sealedAt).not.toBeNull();
      expect(sealedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sealedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Governance capability verification', () => {
    it('should allow all operations before sealing', () => {
      expect(verifyGovernanceCapability(undefined)).toBe(true);
      expect(verifyGovernanceCapability(Symbol('invalid'))).toBe(true);

      // Should not throw
      expect(() => assertGovernanceCapability(undefined)).not.toThrow();
    });

    it('should reject undefined token after sealing', () => {
      sealStorage();

      expect(verifyGovernanceCapability(undefined)).toBe(false);
    });

    it('should reject invalid token after sealing', () => {
      sealStorage();

      const invalidToken = Symbol('invalid');
      expect(verifyGovernanceCapability(invalidToken)).toBe(false);
    });

    it('should accept valid token after sealing', () => {
      const token = sealStorage();

      expect(verifyGovernanceCapability(token)).toBe(true);
    });

    it('should throw on invalid token with assertGovernanceCapability', () => {
      sealStorage();

      expect(() => {
        assertGovernanceCapability(undefined);
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should not throw on valid token with assertGovernanceCapability', () => {
      const token = sealStorage();

      expect(() => {
        assertGovernanceCapability(token);
      }).not.toThrow();
    });
  });

  describe('Storage adapter creation (bypass prevention)', () => {
    beforeAll(() => {
      // Set required env vars for storage adapter
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      process.env.MATHISON_STORE_PATH = '/tmp/mathison-test-seal';
    });

    it('should allow storage adapter creation before sealing', () => {
      expect(() => {
        const adapter = makeStorageAdapterFromEnv();
        expect(adapter).toBeDefined();
      }).not.toThrow();
    });

    it('should block storage adapter creation after sealing (no token)', () => {
      sealStorage();

      expect(() => {
        makeStorageAdapterFromEnv();
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should block storage adapter creation with invalid token', () => {
      sealStorage();

      const invalidToken = Symbol('invalid');

      expect(() => {
        makeStorageAdapterFromEnv(process.env, invalidToken);
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should allow storage adapter creation with valid token', () => {
      const token = sealStorage();

      expect(() => {
        const adapter = makeStorageAdapterFromEnv(process.env, token);
        expect(adapter).toBeDefined();
      }).not.toThrow();
    });

    it('should provide clear error message on bypass attempt', () => {
      sealStorage();

      try {
        makeStorageAdapterFromEnv();
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('GOVERNANCE_BYPASS_DETECTED');
        expect((error as Error).message).toContain('sealed');
        expect((error as Error).message).toContain('ActionGate');
      }
    });
  });

  describe('Unsealing (testing only)', () => {
    it('should unseal storage in test environment', () => {
      sealStorage();
      expect(isStorageSealed()).toBe(true);

      unsealStorageForTesting();
      expect(isStorageSealed()).toBe(false);
      expect(getSealedAt()).toBeNull();
    });

    it('should block unsealing in production', () => {
      const originalEnv = process.env.MATHISON_ENV;
      process.env.MATHISON_ENV = 'production';

      try {
        expect(() => {
          unsealStorageForTesting();
        }).toThrow('UNSEAL_FORBIDDEN');
      } finally {
        process.env.MATHISON_ENV = originalEnv;
      }
    });

    it('should allow new adapter creation after unsealing', () => {
      const token = sealStorage();
      expect(isStorageSealed()).toBe(true);

      // Unsealing should allow direct creation again
      unsealStorageForTesting();

      expect(() => {
        makeStorageAdapterFromEnv();
      }).not.toThrow();
    });
  });

  describe('Attack scenario simulations', () => {
    it('should prevent malicious handler from bypassing governance', () => {
      // Simulate normal server boot
      const adapter1 = makeStorageAdapterFromEnv();
      sealStorage();

      // Simulate malicious handler attempting direct storage access
      const maliciousHandlerAttempt = () => {
        // This is what a malicious handler might try:
        const adapter = makeStorageAdapterFromEnv();
        return adapter.getGraphStore();
      };

      expect(maliciousHandlerAttempt).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should prevent token forgery', () => {
      const realToken = sealStorage();

      // Attacker tries to create their own token
      const forgedToken = Symbol.for('mathison.governance.capability');

      expect(verifyGovernanceCapability(forgedToken)).toBe(false);

      expect(() => {
        makeStorageAdapterFromEnv(process.env, forgedToken);
      }).toThrow('GOVERNANCE_BYPASS_DETECTED');
    });

    it('should prevent token theft across boot sessions', () => {
      const token1 = sealStorage();

      // Simulate server restart (unseal + reseal)
      unsealStorageForTesting();
      const token2 = sealStorage();

      // Old token from previous session should not work
      expect(token1.toString()).not.toBe(token2.toString());
      expect(verifyGovernanceCapability(token1)).toBe(false);
    });
  });
});
