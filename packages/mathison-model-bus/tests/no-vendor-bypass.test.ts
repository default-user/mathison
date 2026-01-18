/**
 * WHY: no-vendor-bypass.test.ts - CI invariant test for Model Bus exclusivity
 * -----------------------------------------------------------------------------
 * - Ensures vendor API endpoints and SDK imports ONLY appear in @mathison/model-bus.
 * - Fails CI if any vendor patterns are found outside the model-bus package.
 * - This is a critical security invariant for v2.2.
 *
 * INVARIANT: NO vendor SDK imports outside @mathison/model-bus.
 * INVARIANT: NO vendor API endpoints outside @mathison/model-bus.
 * INVARIANT: All model calls MUST flow through governed handlers.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Vendor Patterns to Detect
// ============================================================================

/**
 * Patterns that indicate vendor SDK imports
 *
 * WHY these patterns: These are the npm package names and import patterns
 * that would allow direct vendor API access, bypassing governance.
 */
const VENDOR_SDK_PATTERNS = [
  // OpenAI SDK
  /from\s+['"]openai['"]/,
  /require\s*\(\s*['"]openai['"]\s*\)/,
  /import\s+.*\s+from\s+['"]openai['"]/,
  // Anthropic SDK
  /from\s+['"]@anthropic-ai\/sdk['"]/,
  /require\s*\(\s*['"]@anthropic-ai\/sdk['"]\s*\)/,
  /import\s+.*\s+from\s+['"]@anthropic-ai\/sdk['"]/,
  // Generic AI SDK imports
  /from\s+['"]@openai\//,
  /from\s+['"]anthropic['"]/,
];

/**
 * Patterns that indicate direct vendor API endpoint usage
 *
 * WHY these patterns: Direct fetch/axios calls to vendor APIs bypass
 * the governed adapter path.
 */
const VENDOR_ENDPOINT_PATTERNS = [
  // OpenAI API endpoints
  /api\.openai\.com/,
  // Anthropic API endpoints
  /api\.anthropic\.com/,
  // Generic patterns for vendor calls (when not in http-client)
  /chat\/completions/,
  /v1\/messages/,
];

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Recursively find all TypeScript files in a directory
 */
function findTypeScriptFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and dist
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      findTypeScriptFiles(fullPath, files);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check a file for vendor patterns
 */
function checkFileForVendorPatterns(
  filePath: string,
  patterns: RegExp[]
): { found: boolean; matches: string[] } {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches: string[] = [];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      matches.push(`${pattern.source} -> "${match[0]}"`);
    }
  }

  return {
    found: matches.length > 0,
    matches,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('No-Vendor-Bypass Invariants', () => {
  const packagesDir = path.resolve(__dirname, '../../..');
  const modelBusDir = path.resolve(__dirname, '../src');

  // Get all packages except model-bus
  const allPackages = fs.readdirSync(packagesDir)
    .filter((name) => name.startsWith('mathison-') && name !== 'mathison-model-bus')
    .map((name) => path.join(packagesDir, name, 'src'));

  describe('INVARIANT: No vendor SDK imports outside @mathison/model-bus', () => {
    for (const packageSrcDir of allPackages) {
      const packageName = path.basename(path.dirname(packageSrcDir));

      test(`${packageName} should not import vendor SDKs`, () => {
        const files = findTypeScriptFiles(packageSrcDir);

        const violations: { file: string; matches: string[] }[] = [];

        for (const file of files) {
          const result = checkFileForVendorPatterns(file, VENDOR_SDK_PATTERNS);
          if (result.found) {
            violations.push({
              file: path.relative(packagesDir, file),
              matches: result.matches,
            });
          }
        }

        if (violations.length > 0) {
          const message = violations
            .map((v) => `  ${v.file}:\n    ${v.matches.join('\n    ')}`)
            .join('\n');

          fail(
            `Vendor SDK imports found outside @mathison/model-bus:\n${message}\n\n` +
            'WHY this fails: All vendor API access must go through the governed Model Bus. ' +
            'Importing vendor SDKs directly bypasses capability enforcement.'
          );
        }

        expect(violations).toHaveLength(0);
      });
    }
  });

  describe('INVARIANT: No vendor API endpoints outside @mathison/model-bus', () => {
    for (const packageSrcDir of allPackages) {
      const packageName = path.basename(path.dirname(packageSrcDir));

      test(`${packageName} should not contain vendor API endpoints`, () => {
        const files = findTypeScriptFiles(packageSrcDir);

        const violations: { file: string; matches: string[] }[] = [];

        for (const file of files) {
          const result = checkFileForVendorPatterns(file, VENDOR_ENDPOINT_PATTERNS);
          if (result.found) {
            violations.push({
              file: path.relative(packagesDir, file),
              matches: result.matches,
            });
          }
        }

        if (violations.length > 0) {
          const message = violations
            .map((v) => `  ${v.file}:\n    ${v.matches.join('\n    ')}`)
            .join('\n');

          fail(
            `Vendor API endpoints found outside @mathison/model-bus:\n${message}\n\n` +
            'WHY this fails: Direct vendor API calls bypass the governed Model Bus. ' +
            'All model invocations must go through adapters with capability tokens.'
          );
        }

        expect(violations).toHaveLength(0);
      });
    }
  });

  describe('INVARIANT: Model Bus contains the only vendor access', () => {
    test('model-bus should contain vendor patterns (proves it is the right place)', () => {
      const files = findTypeScriptFiles(modelBusDir);

      let hasVendorEndpoints = false;

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (
          content.includes('api.openai.com') ||
          content.includes('api.anthropic.com')
        ) {
          hasVendorEndpoints = true;
          break;
        }
      }

      // This test ensures model-bus actually has the vendor endpoints
      // (if it doesn't, the architecture might have drifted)
      expect(hasVendorEndpoints).toBe(true);
    });
  });
});
