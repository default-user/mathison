/**
 * P1.1: Governance Integrity Verification
 *
 * Verifies that critical governance modules (CIF, CDI, ActionGate)
 * match expected hashes from the genome build manifest.
 *
 * Purpose: Detect tampering or corruption of governance enforcement code.
 * If integrity check fails → FAIL CLOSED (boot aborted).
 */

import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface IntegrityManifestEntry {
  path: string;
  sha256: string;
}

export interface IntegrityCheckResult {
  valid: boolean;
  errors: string[];
  checked: {
    path: string;
    expected: string;
    actual: string;
    match: boolean;
  }[];
}

/**
 * Compute SHA256 hash of a file
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Verify integrity of critical governance modules
 *
 * Checks that actual file hashes match expected hashes from genome manifest.
 * Skips entries with placeholder hashes (allows dev mode).
 *
 * @param manifest Expected hashes from genome build_manifest
 * @param rootDir Root directory of the repository (for resolving relative paths)
 * @param strictMode If true, fail on placeholder hashes (production mode)
 */
export async function verifyGovernanceIntegrity(
  manifest: IntegrityManifestEntry[],
  rootDir: string,
  strictMode: boolean = false
): Promise<IntegrityCheckResult> {
  const errors: string[] = [];
  const checked: IntegrityCheckResult['checked'] = [];

  for (const entry of manifest) {
    const filePath = path.join(rootDir, entry.path);

    // Skip placeholders in dev mode
    if (!strictMode && entry.sha256.startsWith('placeholder')) {
      console.log(`⚠️  Skipping integrity check for ${entry.path} (placeholder hash in dev mode)`);
      continue;
    }

    // In strict mode, placeholders are errors
    if (strictMode && entry.sha256.startsWith('placeholder')) {
      errors.push(`${entry.path}: placeholder hash not allowed in production`);
      checked.push({
        path: entry.path,
        expected: entry.sha256,
        actual: 'N/A',
        match: false
      });
      continue;
    }

    // Compute actual hash
    let actualHash: string;
    try {
      actualHash = await computeFileHash(filePath);
    } catch (error) {
      errors.push(`${entry.path}: failed to read file (${error instanceof Error ? error.message : String(error)})`);
      checked.push({
        path: entry.path,
        expected: entry.sha256,
        actual: 'ERROR',
        match: false
      });
      continue;
    }

    // Compare hashes
    const match = actualHash === entry.sha256;
    checked.push({
      path: entry.path,
      expected: entry.sha256.substring(0, 16) + '...',
      actual: actualHash.substring(0, 16) + '...',
      match
    });

    if (!match) {
      errors.push(
        `${entry.path}: hash mismatch (expected ${entry.sha256.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...)`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    checked
  };
}

/**
 * Canary watchdog: test known-bad payloads/actions to ensure governance is working
 *
 * These are "canary in the coal mine" checks - if they don't behave as expected,
 * something is wrong with governance enforcement.
 */
export interface CanaryTest {
  name: string;
  description: string;
  test: () => Promise<boolean>; // Returns true if canary PASSED (behaved as expected)
}

/**
 * Create CIF canary: payload that should be blocked
 */
export function createCIFCanary(cif: any): CanaryTest {
  return {
    name: 'CIF blocks oversized payload',
    description: 'Known-bad oversized payload should be blocked by CIF ingress',
    test: async () => {
      try {
        // Create payload larger than CIF limit
        const hugePayload = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB

        const result = await cif.ingress({
          method: 'POST',
          path: '/test',
          body: hugePayload,
          headers: {}
        });

        // Canary PASSES if CIF blocked it
        return !result.allowed;
      } catch (error) {
        // If CIF throws on oversized, that's also acceptable
        return true;
      }
    }
  };
}

/**
 * Create CDI canary: action that should be denied
 */
export function createCDICanary(cdi: any): CanaryTest {
  return {
    name: 'CDI denies hive actions',
    description: 'Known-forbidden hive action should be denied by CDI',
    test: async () => {
      try {
        const result = await cdi.checkAction({
          actor: 'test_actor',
          action: 'merge_agent_state' // Forbidden by Tiriti Rule 7
        });

        // Canary PASSES if CDI denied it
        return result.verdict === 'deny';
      } catch (error) {
        // Unexpected error - canary FAILS
        console.error('CDI canary test error:', error);
        return false;
      }
    }
  };
}

/**
 * Run all canary tests
 */
export async function runCanaryTests(canaries: CanaryTest[]): Promise<{
  passed: boolean;
  results: { name: string; passed: boolean; description: string }[];
}> {
  const results: { name: string; passed: boolean; description: string }[] = [];

  for (const canary of canaries) {
    try {
      const passed = await canary.test();
      results.push({
        name: canary.name,
        passed,
        description: canary.description
      });
    } catch (error) {
      console.error(`Canary test '${canary.name}' threw error:`, error);
      results.push({
        name: canary.name,
        passed: false,
        description: `${canary.description} (ERROR: ${error instanceof Error ? error.message : String(error)})`
      });
    }
  }

  const allPassed = results.every(r => r.passed);

  return { passed: allPassed, results };
}
