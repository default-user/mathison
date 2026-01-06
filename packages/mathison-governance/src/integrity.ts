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
 * Resolve dist path from src path if MATHISON_USE_DIST is set
 * E.g., packages/foo/src/index.ts -> packages/foo/dist/index.js
 */
function resolveDistPath(srcPath: string): string {
  const useDist = process.env.MATHISON_USE_DIST === 'true' || process.env.MATHISON_ENV === 'production';

  if (!useDist) {
    return srcPath;
  }

  // Check if path is a TypeScript source file
  if (srcPath.includes('/src/') && srcPath.endsWith('.ts')) {
    // Convert src/*.ts to dist/*.js
    return srcPath.replace('/src/', '/dist/').replace(/\.ts$/, '.js');
  }

  return srcPath;
}

/**
 * Verify integrity of critical governance modules
 *
 * Checks that actual file hashes match expected hashes from genome manifest.
 * Skips entries with placeholder hashes (allows dev mode).
 *
 * In production mode (MATHISON_ENV=production or MATHISON_USE_DIST=true):
 * - Resolves src/*.ts paths to dist/*.js paths before hashing
 * - Placeholder hashes cause verification failure (strictMode)
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
    // Resolve dist path if in production/dist mode
    const targetPath = resolveDistPath(entry.path);
    const filePath = path.join(rootDir, targetPath);

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
 * RED TEAM FIX: Randomize canary inputs to prevent hardcoded watchdog bypass
 */
export function createCIFCanary(cif: any): CanaryTest {
  // Randomize payload size (between 2MB and 4MB) to prevent hardcoded bypass
  const randomSize = 2 * 1024 * 1024 + Math.floor(Math.random() * 2 * 1024 * 1024);
  // Randomize payload character to prevent pattern detection
  const randomChar = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z

  return {
    name: 'CIF blocks oversized payload',
    description: `Known-bad oversized payload (${randomSize} bytes, char '${randomChar}') should be blocked by CIF ingress`,
    test: async () => {
      try {
        // Create payload larger than CIF limit with randomized content
        const hugePayload = { data: randomChar.repeat(randomSize) };

        const result = await cif.ingress({
          clientId: `canary_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          endpoint: `/canary_test_${Math.random().toString(36).substring(7)}`,
          payload: hugePayload,
          headers: {},
          timestamp: Date.now()
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
 * RED TEAM FIX: Randomize canary inputs to prevent hardcoded watchdog bypass
 */
export function createCDICanary(cdi: any): CanaryTest {
  // Randomly select from forbidden hive actions
  const hiveActions = [
    'merge_agent_state',
    'share_identity',
    'sync_internal_state',
    'clone_self_model'
  ];
  const randomAction = hiveActions[Math.floor(Math.random() * hiveActions.length)];
  const randomActor = `canary_actor_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  return {
    name: 'CDI denies hive actions',
    description: `Known-forbidden hive action '${randomAction}' from '${randomActor}' should be denied by CDI`,
    test: async () => {
      try {
        const result = await cdi.checkAction({
          actor: randomActor,
          action: randomAction, // Forbidden by Tiriti Rule 7
          payload: {
            canary_nonce: Math.random().toString(36).substring(2),
            timestamp: Date.now()
          }
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
