/**
 * P0.3: Receipt Chain Tests
 * Verify tamper-evident receipt chaining
 */

import {
  chainReceipt,
  validateReceiptChain,
  computeReceiptHash,
  signReceipt,
  verifyReceiptSignature,
  initializeChainKey,
  GENESIS_HASH
} from '../receipt-chain';
import { Receipt } from '../receipt_store';
import { randomBytes } from 'crypto';

describe('Receipt Chain - P0.3', () => {
  beforeAll(() => {
    // Initialize chain key for tests
    const testKey = randomBytes(32);
    const testKeyId = 'test_key_id';
    initializeChainKey(testKey, testKeyId);
  });

  describe('Receipt hashing', () => {
    it('should compute hash excluding chain fields', () => {
      const receipt: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'test_action'
      };

      const hash = computeReceiptHash(receipt);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 hex
    });

    it('should produce same hash for receipts with different chain fields', () => {
      const receipt1: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'test_action',
        prev_hash: 'hash1',
        sequence_number: 0,
        chain_signature: 'sig1'
      };

      const receipt2: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'test_action',
        prev_hash: 'hash2', // Different
        sequence_number: 5, // Different
        chain_signature: 'sig2' // Different
      };

      const hash1 = computeReceiptHash(receipt1);
      const hash2 = computeReceiptHash(receipt2);

      // Hashes should be identical (chain fields excluded)
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different receipt content', () => {
      const receipt1: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'action1'
      };

      const receipt2: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'action2' // Different
      };

      const hash1 = computeReceiptHash(receipt1);
      const hash2 = computeReceiptHash(receipt2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Receipt signing', () => {
    it('should sign receipt with HMAC', () => {
      const receiptHash = 'abc123';
      const prevHash = 'def456';
      const sequence = 0;

      const signature = signReceipt(receiptHash, prevHash, sequence);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // HMAC-SHA256 hex
    });

    it('should verify valid signature', () => {
      const receiptHash = 'abc123';
      const prevHash = 'def456';
      const sequence = 0;

      const signature = signReceipt(receiptHash, prevHash, sequence);
      const valid = verifyReceiptSignature(receiptHash, prevHash, sequence, signature);

      expect(valid).toBe(true);
    });

    it('should reject tampered signature', () => {
      const receiptHash = 'abc123';
      const prevHash = 'def456';
      const sequence = 0;

      const signature = signReceipt(receiptHash, prevHash, sequence);
      const tamperedSignature = signature.slice(0, -1) + 'X';

      const valid = verifyReceiptSignature(receiptHash, prevHash, sequence, tamperedSignature);

      expect(valid).toBe(false);
    });

    it('should reject signature with wrong data', () => {
      const receiptHash = 'abc123';
      const prevHash = 'def456';
      const sequence = 0;

      const signature = signReceipt(receiptHash, prevHash, sequence);

      // Try to verify with different receipt hash
      const valid = verifyReceiptSignature('different', prevHash, sequence, signature);

      expect(valid).toBe(false);
    });
  });

  describe('Receipt chaining', () => {
    it('should add chain fields to receipt', () => {
      const receipt: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'test_action'
      };

      const chained = chainReceipt(receipt, GENESIS_HASH, 0);

      expect(chained.prev_hash).toBe(GENESIS_HASH);
      expect(chained.sequence_number).toBe(0);
      expect(chained.chain_signature).toBeDefined();
      expect(chained.chain_signature!.length).toBe(64);
    });

    it('should preserve receipt content when chaining', () => {
      const receipt: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'test_action',
        notes: 'test notes'
      };

      const chained = chainReceipt(receipt, GENESIS_HASH, 0);

      expect(chained.timestamp).toBe(receipt.timestamp);
      expect(chained.job_id).toBe(receipt.job_id);
      expect(chained.stage).toBe(receipt.stage);
      expect(chained.action).toBe(receipt.action);
      expect(chained.notes).toBe(receipt.notes);
    });

    it('should create valid signature when chaining', () => {
      const receipt: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test_job',
        stage: 'test',
        action: 'test_action'
      };

      const chained = chainReceipt(receipt, GENESIS_HASH, 0);
      const receiptHash = computeReceiptHash(chained);

      const valid = verifyReceiptSignature(
        receiptHash,
        chained.prev_hash!,
        chained.sequence_number!,
        chained.chain_signature!
      );

      expect(valid).toBe(true);
    });
  });

  describe('Chain validation', () => {
    it('should validate empty chain', () => {
      const receipts: Receipt[] = [];

      const validation = validateReceiptChain(receipts);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.lastSequence).toBe(-1);
    });

    it('should validate single receipt chain', () => {
      const receipt = chainReceipt(
        {
          timestamp: '2026-01-05T00:00:00Z',
          job_id: 'test_job',
          stage: 'test',
          action: 'test_action'
        },
        GENESIS_HASH,
        0
      );

      const validation = validateReceiptChain([receipt]);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.lastSequence).toBe(0);
    });

    it('should validate multiple receipt chain', () => {
      const receipts: Receipt[] = [];

      // Create chain of 5 receipts
      let prevHash = GENESIS_HASH;
      for (let i = 0; i < 5; i++) {
        const receipt = chainReceipt(
          {
            timestamp: `2026-01-05T00:00:0${i}Z`,
            job_id: 'test_job',
            stage: 'test',
            action: `action_${i}`
          },
          prevHash,
          i
        );

        receipts.push(receipt);
        prevHash = computeReceiptHash(receipt);
      }

      const validation = validateReceiptChain(receipts);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.lastSequence).toBe(4);
    });

    it('should detect broken sequence numbers', () => {
      const receipt1 = chainReceipt(
        { timestamp: '2026-01-05T00:00:00Z', job_id: 'test', stage: 'test', action: 'a1' },
        GENESIS_HASH,
        0
      );

      const receipt2 = chainReceipt(
        { timestamp: '2026-01-05T00:00:01Z', job_id: 'test', stage: 'test', action: 'a2' },
        computeReceiptHash(receipt1),
        2 // Should be 1, not 2
      );

      const validation = validateReceiptChain([receipt1, receipt2]);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Receipt 1: sequence mismatch (expected 1, got 2)');
    });

    it('should detect broken prev_hash', () => {
      const receipt1 = chainReceipt(
        { timestamp: '2026-01-05T00:00:00Z', job_id: 'test', stage: 'test', action: 'a1' },
        GENESIS_HASH,
        0
      );

      const receipt2 = chainReceipt(
        { timestamp: '2026-01-05T00:00:01Z', job_id: 'test', stage: 'test', action: 'a2' },
        'wrong_hash', // Wrong prev_hash
        1
      );

      const validation = validateReceiptChain([receipt1, receipt2]);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('prev_hash mismatch'))).toBe(true);
    });

    it('should detect tampered receipt content', () => {
      const receipt1 = chainReceipt(
        { timestamp: '2026-01-05T00:00:00Z', job_id: 'test', stage: 'test', action: 'a1' },
        GENESIS_HASH,
        0
      );

      const receipt2 = chainReceipt(
        { timestamp: '2026-01-05T00:00:01Z', job_id: 'test', stage: 'test', action: 'a2' },
        computeReceiptHash(receipt1),
        1
      );

      // Tamper with receipt2 content after chaining
      receipt2.action = 'tampered_action';

      const validation = validateReceiptChain([receipt1, receipt2]);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('invalid chain signature'))).toBe(true);
    });

    it('should detect missing chain signature', () => {
      const receipt: Receipt = {
        timestamp: '2026-01-05T00:00:00Z',
        job_id: 'test',
        stage: 'test',
        action: 'a1',
        prev_hash: GENESIS_HASH,
        sequence_number: 0
        // Missing chain_signature
      };

      const validation = validateReceiptChain([receipt]);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Receipt 0: missing chain signature');
    });

    it('should detect inserted receipt in chain', () => {
      const receipts: Receipt[] = [];

      // Create chain of 3 receipts
      let prevHash = GENESIS_HASH;
      for (let i = 0; i < 3; i++) {
        const receipt = chainReceipt(
          {
            timestamp: `2026-01-05T00:00:0${i}Z`,
            job_id: 'test',
            stage: 'test',
            action: `action_${i}`
          },
          prevHash,
          i
        );

        receipts.push(receipt);
        prevHash = computeReceiptHash(receipt);
      }

      // Insert a forged receipt in the middle
      const forged = chainReceipt(
        { timestamp: '2026-01-05T00:00:05Z', job_id: 'test', stage: 'test', action: 'forged' },
        computeReceiptHash(receipts[0]),
        1
      );

      receipts[1] = forged; // Replace receipt 1 with forged

      const validation = validateReceiptChain(receipts);

      expect(validation.valid).toBe(false);
      // Receipt 2 will have wrong prev_hash since receipt 1 changed
      expect(validation.errors.some(e => e.includes('prev_hash mismatch'))).toBe(true);
    });

    it('should detect deleted receipt from chain', () => {
      const receipts: Receipt[] = [];

      // Create chain of 5 receipts
      let prevHash = GENESIS_HASH;
      for (let i = 0; i < 5; i++) {
        const receipt = chainReceipt(
          {
            timestamp: `2026-01-05T00:00:0${i}Z`,
            job_id: 'test',
            stage: 'test',
            action: `action_${i}`
          },
          prevHash,
          i
        );

        receipts.push(receipt);
        prevHash = computeReceiptHash(receipt);
      }

      // Delete receipt 2 (index 2)
      receipts.splice(2, 1);

      const validation = validateReceiptChain(receipts);

      expect(validation.valid).toBe(false);
      // After deleting receipt 2, receipt 3 (now at index 2) will have wrong sequence and prev_hash
      expect(validation.errors.some(e => e.includes('sequence mismatch'))).toBe(true);
      expect(validation.errors.some(e => e.includes('prev_hash mismatch'))).toBe(true);
    });
  });
});
