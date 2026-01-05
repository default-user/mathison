/**
 * P0.1: GovernanceProof Tests
 * Verify cryptographic proof generation and verification
 */

import {
  initializeBootKey,
  getBootKeyId,
  GovernanceProofBuilder,
  verifyGovernanceProof,
  createDenialProof,
  hashStage,
  computeCumulativeHash,
  signProof,
  verifyProof
} from '../governance-proof';

describe('GovernanceProof - P0.1', () => {
  beforeAll(() => {
    // Initialize boot key once for all tests
    initializeBootKey();
  });

  describe('Boot key management', () => {
    it('should initialize boot key with ID', () => {
      const bootKeyId = getBootKeyId();
      expect(bootKeyId).toBeDefined();
      expect(typeof bootKeyId).toBe('string');
      expect(bootKeyId.length).toBe(16);
    });

    it('should maintain same boot key ID across calls', () => {
      const id1 = getBootKeyId();
      const id2 = getBootKeyId();
      expect(id1).toBe(id2);
    });
  });

  describe('Stage hashing', () => {
    it('should hash stage with input and output', () => {
      const input = { clientId: 'test', endpoint: '/api', payload: {} };
      const output = { allowed: true };

      const hash = hashStage('cif_ingress', input, output);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 produces 64-char hex
    });

    it('should produce different hashes for different inputs', () => {
      const input1 = { data: 'foo' };
      const input2 = { data: 'bar' };
      const output = { allowed: true };

      const hash1 = hashStage('test', input1, output);
      const hash2 = hashStage('test', input2, output);

      expect(hash1).not.toBe(hash2);
    });

    it('should include timestamp in hash (makes each execution unique)', () => {
      const input = { data: 'test' };
      const output = { allowed: true };

      const hash1 = hashStage('test', input, output);
      // Add small delay to ensure different timestamp
      const start = Date.now();
      while (Date.now() === start) {
        // Busy wait for 1ms
      }
      const hash2 = hashStage('test', input, output);

      // With different timestamps, hashes should differ
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Cumulative hash computation', () => {
    it('should compute cumulative hash from stage hashes', () => {
      const stageHashes = {
        cif_ingress: 'abc123',
        cdi_action: 'def456',
        cif_egress: 'ghi789'
      };

      const cumulativeHash = computeCumulativeHash(stageHashes);

      expect(cumulativeHash).toBeDefined();
      expect(typeof cumulativeHash).toBe('string');
      expect(cumulativeHash.length).toBe(64);
    });

    it('should produce different cumulative hashes for different stage sets', () => {
      const stageHashes1 = {
        cif_ingress: 'abc123',
        cdi_action: 'def456'
      };

      const stageHashes2 = {
        cif_ingress: 'abc123',
        cdi_action: 'xyz999'
      };

      const hash1 = computeCumulativeHash(stageHashes1);
      const hash2 = computeCumulativeHash(stageHashes2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Proof signing and verification', () => {
    it('should sign proof with HMAC', () => {
      const cumulativeHash = 'test_hash_value';
      const signature = signProof(cumulativeHash);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // HMAC-SHA256
    });

    it('should verify valid proof signature', () => {
      const cumulativeHash = 'test_hash_value';
      const signature = signProof(cumulativeHash);

      const isValid = verifyProof(cumulativeHash, signature);
      expect(isValid).toBe(true);
    });

    it('should reject tampered proof signature', () => {
      const cumulativeHash = 'test_hash_value';
      const signature = signProof(cumulativeHash);

      // Tamper with signature
      const tamperedSignature = signature.slice(0, -1) + 'X';

      const isValid = verifyProof(cumulativeHash, tamperedSignature);
      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong cumulative hash', () => {
      const cumulativeHash = 'test_hash_value';
      const signature = signProof(cumulativeHash);

      // Different cumulative hash
      const isValid = verifyProof('different_hash', signature);
      expect(isValid).toBe(false);
    });
  });

  describe('GovernanceProofBuilder', () => {
    it('should build proof with all stages', () => {
      const requestId = 'req_test123';
      const request = { method: 'GET', url: '/test' };

      const builder = new GovernanceProofBuilder(requestId, request);

      // Add all stages
      builder.addCIFIngress({ payload: 'test' }, { allowed: true });
      builder.addCDIAction({ action: 'test_action' }, { verdict: 'allow' });
      builder.addHandler({ input: 'test' }, { output: 'result' });
      builder.addCDIOutput({ content: 'result' }, { allowed: true });
      builder.addCIFEgress({ payload: 'result' }, { allowed: true });
      builder.setVerdict('allow');

      const proof = builder.build();

      expect(proof.request_id).toBe(requestId);
      expect(proof.verdict).toBe('allow');
      expect(proof.boot_key_id).toBe(getBootKeyId());
      expect(proof.stage_hashes.cif_ingress).toBeDefined();
      expect(proof.stage_hashes.cdi_action).toBeDefined();
      expect(proof.stage_hashes.handler).toBeDefined();
      expect(proof.stage_hashes.cdi_output).toBeDefined();
      expect(proof.stage_hashes.cif_egress).toBeDefined();
      expect(proof.cumulative_hash).toBeDefined();
      expect(proof.signature).toBeDefined();
      expect(proof.timestamp).toBeDefined();
    });

    it('should build proof with partial stages (denied at CIF ingress)', () => {
      const builder = new GovernanceProofBuilder('req_denied', { url: '/bad' });

      builder.addCIFIngress({ payload: '<script>' }, { allowed: false });
      builder.setVerdict('deny');

      const proof = builder.build();

      expect(proof.verdict).toBe('deny');
      expect(proof.stage_hashes.cif_ingress).toBeDefined();
      expect(proof.stage_hashes.cdi_action).toBeUndefined();
      expect(proof.stage_hashes.cif_egress).toBeUndefined();
    });

    it('should compute valid signature', () => {
      const builder = new GovernanceProofBuilder('req_test', { url: '/test' });
      builder.addCIFIngress({}, { allowed: true });
      builder.setVerdict('allow');

      const proof = builder.build();

      // Signature should be verifiable
      const isValid = verifyProof(proof.cumulative_hash, proof.signature);
      expect(isValid).toBe(true);
    });
  });

  describe('Proof verification', () => {
    it('should verify valid proof', () => {
      const builder = new GovernanceProofBuilder('req_valid', { url: '/test' });
      builder.addCIFIngress({}, { allowed: true });
      builder.addCDIAction({ action: 'test' }, { verdict: 'allow' });
      builder.addCIFEgress({}, { allowed: true });
      builder.setVerdict('allow');

      const proof = builder.build();

      const verification = verifyGovernanceProof(proof);

      expect(verification.valid).toBe(true);
      expect(verification.errors).toEqual([]);
    });

    it('should detect tampered cumulative hash', () => {
      const builder = new GovernanceProofBuilder('req_test', { url: '/test' });
      builder.addCIFIngress({}, { allowed: true });
      builder.setVerdict('allow');

      const proof = builder.build();

      // Tamper with cumulative hash
      proof.cumulative_hash = 'tampered_hash';

      const verification = verifyGovernanceProof(proof);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain('Cumulative hash mismatch (proof tampered)');
    });

    it('should detect forged signature', () => {
      const builder = new GovernanceProofBuilder('req_test', { url: '/test' });
      builder.addCIFIngress({}, { allowed: true });
      builder.setVerdict('allow');

      const proof = builder.build();

      // Forge signature
      proof.signature = 'forged_signature_not_valid';

      const verification = verifyGovernanceProof(proof);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain('Signature verification failed (proof forged)');
    });

    it('should detect empty proof (no stages)', () => {
      const builder = new GovernanceProofBuilder('req_empty', { url: '/test' });
      builder.setVerdict('uncertain');

      const proof = builder.build();

      const verification = verifyGovernanceProof(proof);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain('No stages recorded (empty proof)');
    });
  });

  describe('Denial proofs', () => {
    it('should create denial proof for CIF ingress block', () => {
      const proof = createDenialProof(
        'req_denied',
        { url: '/bad' },
        'cif_ingress',
        { payload: '<script>xss</script>' },
        { allowed: false, violations: ['XSS detected'] }
      );

      expect(proof.verdict).toBe('deny');
      expect(proof.stage_hashes.cif_ingress).toBeDefined();
      expect(proof.stage_hashes.cdi_action).toBeUndefined();

      // Proof should be verifiable
      const verification = verifyGovernanceProof(proof);
      expect(verification.valid).toBe(true);
    });

    it('should create denial proof for CDI action block', () => {
      const proof = createDenialProof(
        'req_denied',
        { url: '/hive' },
        'cdi_action',
        { action: 'merge_agent_state' },
        { verdict: 'deny', reason: 'Hive action forbidden' }
      );

      expect(proof.verdict).toBe('deny');
      expect(proof.stage_hashes.cdi_action).toBeDefined();
      expect(proof.stage_hashes.cdi_output).toBeUndefined();
    });

    it('should create denial proof for CDI output block', () => {
      const proof = createDenialProof(
        'req_denied',
        { url: '/api' },
        'cdi_output',
        { content: 'I am sentient' },
        { allowed: false, violations: ['Claims sentience'] }
      );

      expect(proof.verdict).toBe('deny');
      expect(proof.stage_hashes.cdi_output).toBeDefined();
    });

    it('should create denial proof for CIF egress block', () => {
      const proof = createDenialProof(
        'req_denied',
        { url: '/api' },
        'cif_egress',
        { payload: { secret: 'sk-abc123' } },
        { allowed: false, leaksDetected: ['API key'] }
      );

      expect(proof.verdict).toBe('deny');
      expect(proof.stage_hashes.cif_egress).toBeDefined();
    });
  });

  describe('Tamper detection scenarios', () => {
    it('should detect if stage hash is modified after building', () => {
      const builder = new GovernanceProofBuilder('req_test', { url: '/test' });
      builder.addCIFIngress({}, { allowed: true });
      builder.setVerdict('allow');

      const proof = builder.build();

      // Tamper with a stage hash
      proof.stage_hashes.cif_ingress = 'tampered_hash';

      const verification = verifyGovernanceProof(proof);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain('Cumulative hash mismatch (proof tampered)');
    });

    it('should detect if stages are removed after building', () => {
      const builder = new GovernanceProofBuilder('req_test', { url: '/test' });
      builder.addCIFIngress({}, { allowed: true });
      builder.addCDIAction({ action: 'test' }, { verdict: 'allow' });
      builder.setVerdict('allow');

      const proof = builder.build();

      // Remove a stage
      delete proof.stage_hashes.cdi_action;

      const verification = verifyGovernanceProof(proof);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain('Cumulative hash mismatch (proof tampered)');
    });

    it('should detect if stages are added after building', () => {
      const builder = new GovernanceProofBuilder('req_test', { url: '/test' });
      builder.addCIFIngress({}, { allowed: true });
      builder.setVerdict('allow');

      const proof = builder.build();

      // Add a stage that wasn't in the original proof
      proof.stage_hashes.cdi_action = 'injected_hash';

      const verification = verifyGovernanceProof(proof);

      expect(verification.valid).toBe(false);
      expect(verification.errors).toContain('Cumulative hash mismatch (proof tampered)');
    });
  });
});
