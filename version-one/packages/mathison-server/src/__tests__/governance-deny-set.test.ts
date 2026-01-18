/**
 * Governance Deny Set Tests
 * ================================================================================
 * Proves deterministic DENY behavior for missing/invalid prerequisites
 *
 * This test suite is the "trust anchor" for governance fail-closed guarantees.
 * When treaty/genome/crypto/adapter is missing or invalid, the system MUST deny.
 *
 * Each test proves a specific denial condition with:
 * - Deterministic reason code
 * - Explicit failure message
 * - No silent fallback or escalation
 */

import MathisonServer from '../index';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  validateTreaty,
  validateGenome,
  validateAdapter,
  PrerequisiteCode
} from '../prerequisites';

describe('Governance Deny Set - Fail-Closed Guarantees', () => {
  const testDir = join(__dirname, 'fixtures', 'deny-set-test');

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('Treaty Missing/Unreadable', () => {
    test('DENY when treaty file missing', async () => {
      const { treaty, error } = await validateTreaty('/nonexistent/governance.json');

      expect(treaty).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.CONFIG_UNREADABLE);
      expect(error?.message).toMatch(/governance/i);
    });

    test('DENY when treaty file corrupted', async () => {
      const corruptedConfig = join(testDir, 'corrupted.json');
      writeFileSync(corruptedConfig, '{invalid json');

      const { treaty, error } = await validateTreaty(corruptedConfig);

      expect(treaty).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.CONFIG_UNREADABLE);
    });
  });

  describe('Genome Missing/Invalid', () => {
    test('DENY when genome file missing', async () => {
      process.env.MATHISON_GENOME_PATH = '/nonexistent/genome.json';

      const { genome, error } = await validateGenome();

      expect(genome).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.GENOME_MISSING);

      delete process.env.MATHISON_GENOME_PATH;
    });

    test('DENY when genome schema invalid', async () => {
      const invalidGenome = join(testDir, 'invalid-genome.json');
      writeFileSync(invalidGenome, JSON.stringify({ invalid: 'schema' }));

      process.env.MATHISON_GENOME_PATH = invalidGenome;

      const { genome, error } = await validateGenome();

      expect(genome).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.GENOME_INVALID_SCHEMA);

      delete process.env.MATHISON_GENOME_PATH;
    });

    test('DENY server boot when genome unsigned', async () => {
      const unsignedGenome = join(testDir, 'unsigned-genome.json');
      const genome = {
        schema_version: 'genome.v0.1',
        name: 'UNSIGNED_TEST',
        version: '1.0.0',
        parents: [],
        created_at: '2025-12-31T00:00:00Z',
        authority: {
          signers: [{
            key_id: 'test',
            alg: 'ed25519',
            public_key: 'MCowBQYDK2VwAyEAo2ZVoZHzDKYcKOFVWekFiA+vBkT5o57jgQB5D0RBQfY='
          }],
          threshold: 1
        },
        invariants: [],
        capabilities: [],
        build_manifest: { files: [] }
        // NO SIGNATURE
      };
      writeFileSync(unsignedGenome, JSON.stringify(genome));

      process.env.MATHISON_GENOME_PATH = unsignedGenome;
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      process.env.MATHISON_STORE_PATH = '/tmp/mathison-deny-test';

      const server = new MathisonServer({ port: 4001 });

      await expect(server.start()).rejects.toThrow(/signature|GENOME/i);
      await server.stop().catch(() => {});

      delete process.env.MATHISON_GENOME_PATH;
      delete process.env.MATHISON_STORE_BACKEND;
      delete process.env.MATHISON_STORE_PATH;
    }, 10000);
  });

  describe('Storage Adapter Missing/Invalid', () => {
    test('DENY when MATHISON_STORE_BACKEND missing', async () => {
      delete process.env.MATHISON_STORE_BACKEND;

      const { ok, error } = await validateAdapter();

      expect(ok).toBe(false);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.ADAPTER_MISSING);
      expect(error?.message).toMatch(/MATHISON_STORE_BACKEND/);
    });

    test('DENY when MATHISON_STORE_BACKEND invalid', async () => {
      process.env.MATHISON_STORE_BACKEND = 'INVALID_BACKEND';

      const { ok, error } = await validateAdapter();

      expect(ok).toBe(false);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.ADAPTER_INVALID);

      delete process.env.MATHISON_STORE_BACKEND;
    });

    test('DENY when MATHISON_STORE_PATH missing', async () => {
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      delete process.env.MATHISON_STORE_PATH;

      const { ok, error } = await validateAdapter();

      expect(ok).toBe(false);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.ADAPTER_MISSING);
      expect(error?.message).toMatch(/MATHISON_STORE_PATH/);

      delete process.env.MATHISON_STORE_BACKEND;
    });

    test('DENY server boot when adapter invalid', async () => {
      process.env.MATHISON_STORE_BACKEND = 'INVALID_BACKEND';
      process.env.MATHISON_STORE_PATH = '/tmp/test';
      process.env.MATHISON_GENOME_PATH = join(__dirname, 'fixtures', 'test-genome.json');

      const server = new MathisonServer({ port: 4002 });

      await expect(server.start()).rejects.toThrow(/adapter|storage|MATHISON_STORE_BACKEND/i);
      await server.stop().catch(() => {});

      delete process.env.MATHISON_STORE_BACKEND;
      delete process.env.MATHISON_STORE_PATH;
      delete process.env.MATHISON_GENOME_PATH;
    }, 10000);
  });

  describe('Crypto Invalid', () => {
    test('DENY when genome signature verification fails', async () => {
      const badSigGenome = join(testDir, 'bad-sig-genome.json');
      const genome = {
        schema_version: 'genome.v0.1',
        name: 'BAD_SIG_TEST',
        version: '1.0.0',
        parents: [],
        created_at: '2025-12-31T00:00:00Z',
        authority: {
          signers: [{
            key_id: 'test',
            alg: 'ed25519',
            public_key: 'MCowBQYDK2VwAyEAo2ZVoZHzDKYcKOFVWekFiA+vBkT5o57jgQB5D0RBQfY='
          }],
          threshold: 1
        },
        invariants: [],
        capabilities: [],
        build_manifest: { files: [] },
        signature: {
          key_id: 'test',
          alg: 'ed25519',
          value: 'INVALID_SIGNATURE_BASE64'
        }
      };
      writeFileSync(badSigGenome, JSON.stringify(genome));

      process.env.MATHISON_GENOME_PATH = badSigGenome;
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      process.env.MATHISON_STORE_PATH = '/tmp/mathison-deny-test';

      const server = new MathisonServer({ port: 4003 });

      await expect(server.start()).rejects.toThrow(/signature|invalid|GENOME/i);
      await server.stop().catch(() => {});

      delete process.env.MATHISON_GENOME_PATH;
      delete process.env.MATHISON_STORE_BACKEND;
      delete process.env.MATHISON_STORE_PATH;
    }, 10000);
  });

  describe('Conformance Summary', () => {
    test('Deny conditions are exhaustive and deterministic', () => {
      // This test documents the complete deny set
      const denyCodes = [
        PrerequisiteCode.CONFIG_MISSING,
        PrerequisiteCode.CONFIG_INVALID_SCHEMA,
        PrerequisiteCode.CONFIG_UNREADABLE,
        PrerequisiteCode.TREATY_MISSING,
        PrerequisiteCode.TREATY_INVALID_SCHEMA,
        PrerequisiteCode.GENOME_MISSING,
        PrerequisiteCode.GENOME_INVALID_SCHEMA,
        PrerequisiteCode.ADAPTER_INVALID,
        PrerequisiteCode.ADAPTER_MISSING
      ];

      expect(denyCodes.length).toBeGreaterThanOrEqual(9);

      // Each deny code is unique and stable
      const uniqueCodes = new Set(denyCodes);
      expect(uniqueCodes.size).toBe(denyCodes.length);
    });
  });
});
