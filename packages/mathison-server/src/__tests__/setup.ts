/**
 * Global test setup for mathison-server tests
 *
 * This file ensures proper cleanup of global state between tests,
 * particularly for storage sealing which persists across tests.
 */

import { unsealStorageForTesting, isStorageSealed } from 'mathison-storage';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { mkdirSync } from 'fs';

// Determine repo root dynamically based on this file's location
// This file is at packages/mathison-server/src/__tests__/setup.ts
// Repo root is ../../../../ from here
const REPO_ROOT = resolve(__dirname, '../../../../');

// Set up test environment variables
if (!process.env.MATHISON_REPO_ROOT) {
  process.env.MATHISON_REPO_ROOT = REPO_ROOT;
}

if (!process.env.MATHISON_STORE_BACKEND) {
  process.env.MATHISON_STORE_BACKEND = 'FILE';
}

if (!process.env.MATHISON_STORE_PATH) {
  const testStoreDir = join(tmpdir(), `mathison-test-${process.pid}-${Date.now()}`);
  mkdirSync(testStoreDir, { recursive: true });
  process.env.MATHISON_STORE_PATH = testStoreDir;
}

/**
 * Resolve a path relative to the repository root
 * @param relativePath - Path relative to repo root
 * @returns Absolute path
 */
export function resolveFromRepoRoot(relativePath: string): string {
  return join(REPO_ROOT, relativePath);
}

/**
 * Get path to a test fixture file
 * @param fixtureName - Name of the fixture file
 * @returns Absolute path to the fixture
 */
export function getFixturePath(fixtureName: string): string {
  return join(__dirname, 'fixtures', fixtureName);
}

if (!process.env.MATHISON_GENOME_PATH) {
  process.env.MATHISON_GENOME_PATH = getFixturePath('test-genome.json');
}

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
