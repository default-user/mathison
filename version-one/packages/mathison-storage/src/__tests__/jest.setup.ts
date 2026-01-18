/**
 * Global Jest Setup for mathison-storage
 * Initializes receipt chain key once for all tests
 */

import { createHash } from 'crypto';
import { initializeChainKey } from '../receipt-chain';

// Derive a deterministic test key from a constant string
// This ensures tests are reproducible and not flaky from random keys
const testKey = createHash('sha256')
  .update('mathison-storage-jest-chain-key-v1')
  .digest(); // 32 bytes

const testKeyId = 'jest_test_key_v1';

// Initialize chain key once for all tests
initializeChainKey(testKey, testKeyId);
