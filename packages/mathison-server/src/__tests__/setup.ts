/**
 * Global test setup for mathison-server tests
 *
 * This file ensures proper cleanup of global state between tests,
 * particularly for storage sealing which persists across tests.
 */

import { unsealStorageForTesting, isStorageSealed } from 'mathison-storage';

/**
 * Reset global state before each test
 * This is critical for tests that involve storage sealing
 */
beforeEach(() => {
  // Unseal storage if sealed (allows tests to start fresh)
  if (isStorageSealed()) {
    unsealStorageForTesting();
  }
});

/**
 * Cleanup after each test
 */
afterEach(() => {
  // Unseal storage to ensure next test starts clean
  if (isStorageSealed()) {
    unsealStorageForTesting();
  }
});

// Suppress console output during tests (optional)
if (process.env.SUPPRESS_TEST_LOGS === '1') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error for debugging
  };
}
