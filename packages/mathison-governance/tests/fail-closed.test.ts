/**
 * Mathison v2.1 Fail-Closed Tests
 *
 * INVARIANT: If treaty/genome/config/crypto/adapter-conformance is missing/invalid/stale, deny safely.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  GovernanceCapsuleLoader,
  createCapsuleLoader,
  CapsuleLoaderConfig,
} from '../src/capsule';

describe('Fail-Closed Invariants', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('INVARIANT: Missing capsule = deny high-risk', () => {
    it('should deny high-risk actions when capsule is missing', async () => {
      const loader = createCapsuleLoader({ ttl_seconds: 300 });

      // Don't load any capsule
      const result = loader.isActionAllowed('high_risk');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('degradation');
    });

    it('should deny medium-risk actions when capsule is missing', async () => {
      const loader = createCapsuleLoader({ ttl_seconds: 300 });

      const result = loader.isActionAllowed('medium_risk');

      expect(result.allowed).toBe(false);
    });

    it('should allow read-only actions in full degradation mode', async () => {
      const loader = createCapsuleLoader({ ttl_seconds: 300 });

      const result = loader.isActionAllowed('read_only');

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('degradation');
    });
  });

  describe('INVARIANT: Invalid capsule = deny', () => {
    it('should deny when capsule has invalid JSON', async () => {
      const capsulePath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(capsulePath, 'not valid json');

      const loader = createCapsuleLoader({ ttl_seconds: 300 });
      const status = await loader.loadCapsule(capsulePath);

      expect(status.valid).toBe(false);
      expect(status.error).toContain('Invalid JSON');

      const result = loader.isActionAllowed('low_risk');
      expect(result.allowed).toBe(false);
    });

    it('should deny when capsule fails schema validation', async () => {
      const capsulePath = path.join(tempDir, 'invalid-schema.json');
      fs.writeFileSync(
        capsulePath,
        JSON.stringify({
          version: '1.0',
          // Missing required fields
        })
      );

      const loader = createCapsuleLoader({ ttl_seconds: 300 });
      const status = await loader.loadCapsule(capsulePath);

      expect(status.valid).toBe(false);
      expect(status.error).toContain('schema');
    });
  });

  describe('INVARIANT: Expired capsule = deny', () => {
    it('should deny when capsule has expired', async () => {
      const capsulePath = path.join(tempDir, 'expired.json');
      const expiredCapsule = {
        version: '1.0',
        capsule_id: 'test-capsule',
        issued_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago (expired)
        issuer: 'test-issuer',
        treaty: {
          id: 'test-treaty',
          name: 'Test Treaty',
          constraints: {
            max_token_budget: 100000,
            allowed_model_families: ['openai'],
            allowed_tool_categories: ['file'],
            data_retention_days: 30,
          },
        },
        genome: {
          id: 'test-genome',
          capabilities: {
            memory_read: true,
            memory_write: true,
            model_invocation: true,
            tool_invocation: false,
            cross_namespace_envelope: false,
          },
        },
        posture: {
          mode: 'development',
          strict_validation: false,
          audit_all_actions: false,
        },
        signature: 'DEV_SIGNATURE_NOT_FOR_PRODUCTION',
      };

      fs.writeFileSync(capsulePath, JSON.stringify(expiredCapsule));

      const loader = createCapsuleLoader({
        ttl_seconds: 300,
        allow_dev_signatures: true,
      });
      const status = await loader.loadCapsule(capsulePath);

      expect(status.valid).toBe(false);
      expect(status.error).toContain('expired');
    });
  });

  describe('INVARIANT: Stale capsule = restrict high-risk', () => {
    it('should restrict high-risk actions when capsule is stale', async () => {
      const capsulePath = path.join(tempDir, 'valid.json');
      const validCapsule = {
        version: '1.0',
        capsule_id: 'test-capsule',
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        issuer: 'test-issuer',
        treaty: {
          id: 'test-treaty',
          name: 'Test Treaty',
          constraints: {
            max_token_budget: 100000,
            allowed_model_families: ['openai'],
            allowed_tool_categories: ['file'],
            data_retention_days: 30,
          },
        },
        genome: {
          id: 'test-genome',
          capabilities: {
            memory_read: true,
            memory_write: true,
            model_invocation: true,
            tool_invocation: false,
            cross_namespace_envelope: false,
          },
        },
        posture: {
          mode: 'development',
          strict_validation: false,
          audit_all_actions: false,
        },
        signature: 'DEV_SIGNATURE_NOT_FOR_PRODUCTION',
      };

      fs.writeFileSync(capsulePath, JSON.stringify(validCapsule));

      // Use very short TTL to make capsule stale immediately
      const loader = createCapsuleLoader({
        ttl_seconds: 0, // Immediately stale
        allow_dev_signatures: true,
      });
      await loader.loadCapsule(capsulePath);

      // Wait a bit for TTL to trigger staleness
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = loader.getStatus();
      expect(status.stale).toBe(true);

      // High-risk should be denied when stale
      const result = loader.isActionAllowed('high_risk');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('stale');
    });
  });

  describe('INVARIANT: Unverifiable signature = deny', () => {
    it('should deny when signature cannot be verified in production mode', async () => {
      const capsulePath = path.join(tempDir, 'bad-sig.json');
      const capsule = {
        version: '1.0',
        capsule_id: 'test-capsule',
        issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        issuer: 'test-issuer',
        treaty: {
          id: 'test-treaty',
          name: 'Test Treaty',
          constraints: {
            max_token_budget: 100000,
            allowed_model_families: ['openai'],
            allowed_tool_categories: ['file'],
            data_retention_days: 30,
          },
        },
        genome: {
          id: 'test-genome',
          capabilities: {
            memory_read: true,
            memory_write: true,
            model_invocation: true,
            tool_invocation: false,
            cross_namespace_envelope: false,
          },
        },
        posture: {
          mode: 'production', // Production mode
          strict_validation: true,
          audit_all_actions: true,
        },
        signature: 'DEV_SIGNATURE_NOT_FOR_PRODUCTION', // Dev signature in production
      };

      fs.writeFileSync(capsulePath, JSON.stringify(capsule));

      // Save original NODE_ENV
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const loader = createCapsuleLoader({
          ttl_seconds: 300,
          allow_dev_signatures: false, // Don't allow dev signatures
        });
        const status = await loader.loadCapsule(capsulePath);

        expect(status.valid).toBe(false);
        expect(status.error).toContain('signature');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('INVARIANT: File not found = deny', () => {
    it('should deny when capsule file does not exist', async () => {
      const loader = createCapsuleLoader({ ttl_seconds: 300 });
      const status = await loader.loadCapsule('/nonexistent/path/capsule.json');

      expect(status.valid).toBe(false);
      expect(status.error).toContain('not found');
      expect(status.degradation_level).toBe('full');
    });
  });
});
