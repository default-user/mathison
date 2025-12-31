/**
 * Genome package conformance tests
 * Proves: canonicalization stable, genome_id stable, signature verification works
 */

import {
  Genome,
  canonicalizeGenome,
  computeGenomeId,
  validateGenomeSchema,
  verifyGenomeSignature
} from '../index';

describe('Genome Conformance Tests', () => {
  const testGenome: Genome = {
    schema_version: 'genome.v0.1',
    name: 'TEST_GENOME',
    version: '1.0.0',
    parents: [],
    created_at: '2025-12-31T00:00:00Z',
    authority: {
      signers: [
        {
          key_id: 'test-key-001',
          alg: 'ed25519',
          public_key: 'MCowBQYDK2VwAyEAo2ZVoZHzDKYcKOFVWekFiA+vBkT5o57jgQB5D0RBQfY='
        }
      ],
      threshold: 1
    },
    invariants: [
      {
        id: 'INV-TEST',
        severity: 'CRITICAL',
        testable_claim: 'test invariant',
        enforcement_hook: 'test.hook'
      }
    ],
    capabilities: [
      {
        cap_id: 'CAP-TEST',
        risk_class: 'A',
        allow_actions: ['test_action'],
        deny_actions: []
      }
    ],
    build_manifest: {
      files: [
        {
          path: 'test/file.ts',
          sha256: 'abc123'
        }
      ]
    }
  };

  describe('Schema Validation', () => {
    test('validates correct genome schema', () => {
      const result = validateGenomeSchema(testGenome);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects genome with missing required fields', () => {
      const invalid = { ...testGenome, name: undefined };
      const result = validateGenomeSchema(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('rejects genome with invalid schema_version', () => {
      const invalid = { ...testGenome, schema_version: 'invalid' };
      const result = validateGenomeSchema(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid schema_version: expected "genome.v0.1", got "invalid"');
    });
  });

  describe('Canonicalization', () => {
    test('produces stable canonical representation', () => {
      const canonical1 = canonicalizeGenome(testGenome);
      const canonical2 = canonicalizeGenome(testGenome);
      expect(canonical1).toBe(canonical2);
    });

    test('removes signature field from canonical representation', () => {
      const genomeWithSig: Genome = {
        ...testGenome,
        signature: {
          alg: 'ed25519',
          signer_key_id: 'test-key-001',
          sig_base64: 'dummy-signature'
        }
      };
      const canonical = canonicalizeGenome(genomeWithSig);
      expect(canonical).not.toContain('signature');
      expect(canonical).not.toContain('dummy-signature');
    });

    test('canonical form is valid JSON', () => {
      const canonical = canonicalizeGenome(testGenome);
      expect(() => JSON.parse(canonical)).not.toThrow();
    });
  });

  describe('Genome ID Computation', () => {
    test('produces stable genome ID', () => {
      const id1 = computeGenomeId(testGenome);
      const id2 = computeGenomeId(testGenome);
      expect(id1).toBe(id2);
    });

    test('genome ID is hex string of correct length (sha256 = 64 hex chars)', () => {
      const id = computeGenomeId(testGenome);
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    });

    test('different genomes produce different IDs', () => {
      const genome2 = { ...testGenome, name: 'DIFFERENT_GENOME' };
      const id1 = computeGenomeId(testGenome);
      const id2 = computeGenomeId(genome2);
      expect(id1).not.toBe(id2);
    });

    test('genome ID changes when content changes', () => {
      const id1 = computeGenomeId(testGenome);
      const modified = {
        ...testGenome,
        invariants: [
          ...testGenome.invariants,
          {
            id: 'INV-NEW',
            severity: 'HIGH' as const,
            testable_claim: 'new invariant',
            enforcement_hook: 'new.hook'
          }
        ]
      };
      const id2 = computeGenomeId(modified);
      expect(id1).not.toBe(id2);
    });

    test('genome ID ignores signature field (signature does not affect ID)', () => {
      const unsigned = { ...testGenome };
      const signed: Genome = {
        ...testGenome,
        signature: {
          alg: 'ed25519',
          signer_key_id: 'test-key-001',
          sig_base64: 'dummy-signature'
        }
      };
      const id1 = computeGenomeId(unsigned);
      const id2 = computeGenomeId(signed);
      expect(id1).toBe(id2);
    });
  });

  describe('Signature Verification', () => {
    test('rejects genome without signature', async () => {
      const unsigned = { ...testGenome };
      const result = await verifyGenomeSignature(unsigned);
      expect(result.verified).toBe(false);
      expect(result.errors).toContain('Genome missing signature');
    });

    test('rejects genome with unknown signer', async () => {
      const genomeWithBadSigner: Genome = {
        ...testGenome,
        signature: {
          alg: 'ed25519',
          signer_key_id: 'unknown-key',
          sig_base64: 'dummy-signature'
        }
      };
      const result = await verifyGenomeSignature(genomeWithBadSigner);
      expect(result.verified).toBe(false);
      expect(result.errors[0]).toContain('Signer key_id not found in authority');
    });

    test('computes genome_id even on verification failure', async () => {
      const unsigned = { ...testGenome };
      const result = await verifyGenomeSignature(unsigned);
      expect(result.genome_id).toBeDefined();
      expect(result.genome_id).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
