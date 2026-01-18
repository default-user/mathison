/**
 * P0.3: Receipt Chain Utilities
 *
 * Implements tamper-evident receipt chaining (blockchain-like)
 * Each receipt links to previous via hash chain + HMAC signature
 */

import { createHash, createHmac } from 'crypto';
import { Receipt } from './receipt_store';

// Use the same boot key from governance-proof for chain signing
// This ensures receipt chains are bound to the current boot session
let CHAIN_BOOT_KEY: Buffer | null = null;
let CHAIN_BOOT_KEY_ID: string | null = null;

/**
 * Initialize chain boot key (call once at server startup)
 * Shares the same boot key ID as governance proofs for consistency
 */
export function initializeChainKey(bootKey: Buffer, bootKeyId: string): void {
  CHAIN_BOOT_KEY = bootKey;
  CHAIN_BOOT_KEY_ID = bootKeyId;
  console.log(`🔗 Receipt chain: Using boot key ID ${bootKeyId}`);
}

/**
 * Get chain boot key (throws if not initialized)
 */
function getChainBootKey(): Buffer {
  if (!CHAIN_BOOT_KEY) {
    throw new Error('CHAIN_KEY_NOT_INITIALIZED: Call initializeChainKey() first');
  }
  return CHAIN_BOOT_KEY;
}

/**
 * Compute hash of a receipt (for chaining)
 * Excludes chain fields to avoid circular dependency
 */
export function computeReceiptHash(receipt: Receipt): string {
  // Create a copy without chain fields for hashing
  const { prev_hash, sequence_number, chain_signature, ...hashableReceipt } = receipt;

  const data = JSON.stringify(hashableReceipt);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Sign a receipt with HMAC using chain boot key
 */
export function signReceipt(receiptHash: string, prevHash: string, sequence: number): string {
  const bootKey = getChainBootKey();
  const data = JSON.stringify({ receiptHash, prevHash, sequence });
  return createHmac('sha256', bootKey).update(data).digest('hex');
}

/**
 * Verify receipt signature
 */
export function verifyReceiptSignature(
  receiptHash: string,
  prevHash: string,
  sequence: number,
  signature: string
): boolean {
  try {
    const expectedSignature = signReceipt(receiptHash, prevHash, sequence);
    return signature === expectedSignature;
  } catch (error) {
    console.error('Receipt signature verification failed:', error);
    return false;
  }
}

/**
 * Add chain fields to a receipt before appending
 *
 * @param receipt The receipt to chain
 * @param prevHash Hash of previous receipt (or genesis hash)
 * @param sequence Sequence number (0-based, increments per receipt)
 * @returns Receipt with chain fields populated
 */
export function chainReceipt(
  receipt: Receipt,
  prevHash: string,
  sequence: number
): Receipt {
  // Compute hash of receipt content (excluding chain fields)
  const receiptHash = computeReceiptHash(receipt);

  // Sign the chain link
  const signature = signReceipt(receiptHash, prevHash, sequence);

  return {
    ...receipt,
    prev_hash: prevHash,
    sequence_number: sequence,
    chain_signature: signature
  };
}

/**
 * Validate a receipt chain
 *
 * @param receipts Array of receipts in sequence order
 * @returns Validation result with errors if any
 */
export function validateReceiptChain(receipts: Receipt[]): {
  valid: boolean;
  errors: string[];
  lastSequence: number;
} {
  const errors: string[] = [];

  if (receipts.length === 0) {
    return { valid: true, errors: [], lastSequence: -1 };
  }

  let expectedPrevHash = '0'.repeat(64); // Genesis hash (all zeros)
  let expectedSequence = 0;

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i];

    // Check sequence number
    if (receipt.sequence_number !== expectedSequence) {
      errors.push(
        `Receipt ${i}: sequence mismatch (expected ${expectedSequence}, got ${receipt.sequence_number})`
      );
    }

    // Check prev_hash
    if (receipt.prev_hash !== expectedPrevHash) {
      errors.push(
        `Receipt ${i}: prev_hash mismatch (expected ${expectedPrevHash?.substring(0, 8)}..., got ${receipt.prev_hash?.substring(0, 8)}...)`
      );
    }

    // Verify signature
    if (receipt.chain_signature) {
      const receiptHash = computeReceiptHash(receipt);
      const validSig = verifyReceiptSignature(
        receiptHash,
        receipt.prev_hash || expectedPrevHash,
        receipt.sequence_number || expectedSequence,
        receipt.chain_signature
      );

      if (!validSig) {
        errors.push(
          `Receipt ${i}: invalid chain signature (tampering detected)`
        );
      }
    } else {
      errors.push(`Receipt ${i}: missing chain signature`);
    }

    // Compute hash of current receipt for next iteration
    const currentHash = computeReceiptHash(receipt);
    expectedPrevHash = currentHash;
    expectedSequence++;
  }

  return {
    valid: errors.length === 0,
    errors,
    lastSequence: receipts.length > 0 ? (receipts[receipts.length - 1].sequence_number ?? -1) : -1
  };
}

/**
 * Genesis hash (for first receipt in chain)
 */
export const GENESIS_HASH = '0'.repeat(64);
