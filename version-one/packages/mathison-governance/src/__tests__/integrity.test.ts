/**
 * P1.1: Governance Integrity Tests
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  computeFileHash,
  verifyGovernanceIntegrity,
  createCIFCanary,
  createCDICanary,
  runCanaryTests
} from '../integrity';
import { CIF } from '../cif';
import { CDI } from '../cdi';

describe('Governance Integrity - P1.1', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integrity-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('File hashing', () => {
    it('should compute SHA256 hash of file', async () => {
      const testFile = path.join(tempDir, 'test.txt');
      const content = 'test content';
      await fs.writeFile(testFile, content, 'utf-8');

      const hash = await computeFileHash(testFile);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 hex length
    });

    it('should produce same hash for same content', async () => {
      const testFile1 = path.join(tempDir, 'test1.txt');
      const testFile2 = path.join(tempDir, 'test2.txt');
      const content = 'identical content';

      await fs.writeFile(testFile1, content, 'utf-8');
      await fs.writeFile(testFile2, content, 'utf-8');

      const hash1 = await computeFileHash(testFile1);
      const hash2 = await computeFileHash(testFile2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different content', async () => {
      const testFile1 = path.join(tempDir, 'test1.txt');
      const testFile2 = path.join(tempDir, 'test2.txt');

      await fs.writeFile(testFile1, 'content A', 'utf-8');
      await fs.writeFile(testFile2, 'content B', 'utf-8');

      const hash1 = await computeFileHash(testFile1);
      const hash2 = await computeFileHash(testFile2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Integrity verification', () => {
    it('should verify files with matching hashes', async () => {
      const testFile = path.join(tempDir, 'module.ts');
      const content = 'export const test = true;';
      await fs.writeFile(testFile, content, 'utf-8');

      const expectedHash = await computeFileHash(testFile);

      const result = await verifyGovernanceIntegrity(
        [{ path: path.relative(tempDir, testFile), sha256: expectedHash }],
        tempDir,
        true // strict mode
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.checked.length).toBe(1);
      expect(result.checked[0].match).toBe(true);
    });

    it('should detect hash mismatch', async () => {
      const testFile = path.join(tempDir, 'module.ts');
      await fs.writeFile(testFile, 'original content', 'utf-8');

      const wrongHash = 'a'.repeat(64); // Wrong hash

      const result = await verifyGovernanceIntegrity(
        [{ path: path.relative(tempDir, testFile), sha256: wrongHash }],
        tempDir,
        true
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('hash mismatch');
      expect(result.checked[0].match).toBe(false);
    });

    it('should detect missing file', async () => {
      const result = await verifyGovernanceIntegrity(
        [{ path: 'nonexistent.ts', sha256: 'abc123' }],
        tempDir,
        true
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('failed to read file');
    });

    it('should skip placeholder hashes in dev mode', async () => {
      const testFile = path.join(tempDir, 'module.ts');
      await fs.writeFile(testFile, 'content', 'utf-8');

      const result = await verifyGovernanceIntegrity(
        [{ path: path.relative(tempDir, testFile), sha256: 'placeholder-will-compute' }],
        tempDir,
        false // dev mode
      );

      expect(result.valid).toBe(true); // No checks performed
      expect(result.errors).toEqual([]);
      expect(result.checked.length).toBe(0); // Skipped
    });

    it('should reject placeholder hashes in strict mode', async () => {
      const testFile = path.join(tempDir, 'module.ts');
      await fs.writeFile(testFile, 'content', 'utf-8');

      const result = await verifyGovernanceIntegrity(
        [{ path: path.relative(tempDir, testFile), sha256: 'placeholder-will-compute' }],
        tempDir,
        true // strict mode
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('placeholder hash not allowed');
    });

    it('should pass when hashes match and fail when file content changes', async () => {
      const testFile = path.join(tempDir, 'module.ts');
      const originalContent = 'export const value = 42;';
      await fs.writeFile(testFile, originalContent, 'utf-8');

      // Build manifest entry with correct hash
      const correctHash = await computeFileHash(testFile);
      const manifest = [{ path: path.relative(tempDir, testFile), sha256: correctHash }];

      // First verification should pass
      const result1 = await verifyGovernanceIntegrity(manifest, tempDir, true);
      expect(result1.valid).toBe(true);
      expect(result1.errors).toEqual([]);
      expect(result1.checked[0].match).toBe(true);

      // Modify file content
      const modifiedContent = 'export const value = 99; // TAMPERED';
      await fs.writeFile(testFile, modifiedContent, 'utf-8');

      // Second verification should fail (hash mismatch)
      const result2 = await verifyGovernanceIntegrity(manifest, tempDir, true);
      expect(result2.valid).toBe(false);
      expect(result2.errors.length).toBe(1);
      expect(result2.errors[0]).toContain('hash mismatch');
      expect(result2.checked[0].match).toBe(false);
    });

    it('should fail in strict mode on any placeholder hash regardless of prefix', async () => {
      const testFile = path.join(tempDir, 'module.ts');
      await fs.writeFile(testFile, 'content', 'utf-8');

      const placeholders = [
        'placeholder-dev',
        'placeholder-will-compute-in-production',
        'placeholder',
        'placeholderABCD'
      ];

      for (const placeholder of placeholders) {
        const result = await verifyGovernanceIntegrity(
          [{ path: path.relative(tempDir, testFile), sha256: placeholder }],
          tempDir,
          true // strict mode
        );

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBe(1);
        expect(result.errors[0]).toContain('placeholder hash not allowed');
      }
    });

    it('should verify multiple files', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');

      await fs.writeFile(file1, 'content 1', 'utf-8');
      await fs.writeFile(file2, 'content 2', 'utf-8');

      const hash1 = await computeFileHash(file1);
      const hash2 = await computeFileHash(file2);

      const result = await verifyGovernanceIntegrity(
        [
          { path: path.relative(tempDir, file1), sha256: hash1 },
          { path: path.relative(tempDir, file2), sha256: hash2 }
        ],
        tempDir,
        true
      );

      expect(result.valid).toBe(true);
      expect(result.checked.length).toBe(2);
      expect(result.checked.every(c => c.match)).toBe(true);
    });

    it('should fail if any file mismatches', async () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');

      await fs.writeFile(file1, 'content 1', 'utf-8');
      await fs.writeFile(file2, 'content 2', 'utf-8');

      const hash1 = await computeFileHash(file1);
      const wrongHash = 'a'.repeat(64);

      const result = await verifyGovernanceIntegrity(
        [
          { path: path.relative(tempDir, file1), sha256: hash1 },
          { path: path.relative(tempDir, file2), sha256: wrongHash } // Wrong!
        ],
        tempDir,
        true
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.checked.length).toBe(2);
      expect(result.checked[0].match).toBe(true);
      expect(result.checked[1].match).toBe(false);
    });
  });

  describe('CIF Canary', () => {
    it('should create CIF canary test', async () => {
      const cif = new CIF({ maxRequestSize: 1024, maxResponseSize: 1024 });
      await cif.initialize();

      const canary = createCIFCanary(cif);

      expect(canary).toBeDefined();
      expect(canary.name).toContain('CIF');
      expect(canary.description).toBeDefined();
      expect(typeof canary.test).toBe('function');

      await cif.shutdown();
    });

    it('should pass if CIF blocks oversized payload', async () => {
      const cif = new CIF({ maxRequestSize: 1024, maxResponseSize: 1024 });
      await cif.initialize();

      const canary = createCIFCanary(cif);
      const passed = await canary.test();

      // CIF should block the oversized payload, so canary passes
      expect(passed).toBe(true);

      await cif.shutdown();
    });
  });

  describe('CDI Canary', () => {
    it('should create CDI canary test', async () => {
      const cdi = new CDI({ strictMode: true });
      await cdi.initialize();

      const canary = createCDICanary(cdi);

      expect(canary).toBeDefined();
      expect(canary.name).toContain('CDI');
      expect(canary.description).toBeDefined();
      expect(typeof canary.test).toBe('function');

      await cdi.shutdown();
    });

    it('should pass if CDI denies hive actions', async () => {
      const cdi = new CDI({ strictMode: true });
      await cdi.initialize();

      const canary = createCDICanary(cdi);
      const passed = await canary.test();

      // CDI should deny hive actions, so canary passes
      expect(passed).toBe(true);

      await cdi.shutdown();
    });
  });

  describe('Canary test runner', () => {
    it('should run all canary tests', async () => {
      const cif = new CIF({ maxRequestSize: 1024, maxResponseSize: 1024 });
      const cdi = new CDI({ strictMode: true });
      await cif.initialize();
      await cdi.initialize();

      const canaries = [
        createCIFCanary(cif),
        createCDICanary(cdi)
      ];

      const result = await runCanaryTests(canaries);

      expect(result.passed).toBe(true);
      expect(result.results.length).toBe(2);
      expect(result.results.every(r => r.passed)).toBe(true);

      await cif.shutdown();
      await cdi.shutdown();
    });

    it('should detect canary failure', async () => {
      const failingCanary = {
        name: 'Failing Test',
        description: 'This test always fails',
        test: async () => false
      };

      const result = await runCanaryTests([failingCanary]);

      expect(result.passed).toBe(false);
      expect(result.results.length).toBe(1);
      expect(result.results[0].passed).toBe(false);
    });

    it('should handle canary test errors', async () => {
      const errorCanary = {
        name: 'Error Test',
        description: 'This test throws an error',
        test: async () => {
          throw new Error('Test error');
        }
      };

      const result = await runCanaryTests([errorCanary]);

      expect(result.passed).toBe(false);
      expect(result.results.length).toBe(1);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].description).toContain('ERROR');
    });

    it('should report partial failures', async () => {
      const passingCanary = {
        name: 'Pass',
        description: 'Passes',
        test: async () => true
      };

      const failingCanary = {
        name: 'Fail',
        description: 'Fails',
        test: async () => false
      };

      const result = await runCanaryTests([passingCanary, failingCanary]);

      expect(result.passed).toBe(false); // Overall failed
      expect(result.results.length).toBe(2);
      expect(result.results[0].passed).toBe(true);
      expect(result.results[1].passed).toBe(false);
    });
  });
});
