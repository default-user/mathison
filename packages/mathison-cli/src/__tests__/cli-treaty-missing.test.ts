/**
 * CLI Treaty Missing Test
 * Verifies CLI fails-closed when treaty unavailable
 *
 * SPEC REQUIREMENT (P1 Conformance):
 * - CLI must deny with exit code 1
 * - Error message includes TREATY_UNAVAILABLE
 * - No outputs created
 * - Denial receipt appended
 */

import { runCommand } from '../commands/run';
import * as fs from 'fs';
import * as path from 'path';

describe('CLI Treaty Missing: Fail-Closed', () => {
  const originalCwd = process.cwd();
  const repoRoot = path.resolve(__dirname, '../../../..');

  const treatyPath = path.join(repoRoot, 'docs', 'tiriti.md');
  const treatyBackupPath = path.join(repoRoot, 'docs', 'tiriti.md.backup');

  const testOutputDir = '.mathison-test-cli-treaty/output';
  const testCheckpointDir = '.mathison-test-cli-treaty/checkpoints';
  const testEventLogPath = '.mathison-test-cli-treaty/eventlog.jsonl';

  beforeEach(() => {
    process.chdir(repoRoot);

    // Clean test directories
    if (fs.existsSync('.mathison-test-cli-treaty')) {
      fs.rmSync('.mathison-test-cli-treaty', { recursive: true, force: true });
    }
    fs.mkdirSync(testOutputDir, { recursive: true });
    fs.mkdirSync(testCheckpointDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync('.mathison-test-cli-treaty')) {
      fs.rmSync('.mathison-test-cli-treaty', { recursive: true, force: true });
    }

    process.chdir(originalCwd);
  });

  describe('Treaty Unavailable', () => {
    it('should fail with TREATY_UNAVAILABLE when treaty missing', async () => {
      // Backup treaty
      if (fs.existsSync(treatyPath)) {
        fs.copyFileSync(treatyPath, treatyBackupPath);
      }

      try {
        // Remove treaty
        if (fs.existsSync(treatyPath)) {
          fs.unlinkSync(treatyPath);
        }

        // Attempt to run job via CLI command
        await expect(
          runCommand({
            job: 'tiriti-audit',
            in: 'docs/test-input.md',
            outdir: testOutputDir
          })
        ).rejects.toThrow(/TREATY_UNAVAILABLE/);
      } finally {
        // Restore treaty
        if (fs.existsSync(treatyBackupPath)) {
          fs.copyFileSync(treatyBackupPath, treatyPath);
          fs.unlinkSync(treatyBackupPath);
        }
      }
    });

    it('should not create outputs when treaty missing', async () => {
      // Backup treaty
      if (fs.existsSync(treatyPath)) {
        fs.copyFileSync(treatyPath, treatyBackupPath);
      }

      try {
        // Remove treaty
        if (fs.existsSync(treatyPath)) {
          fs.unlinkSync(treatyPath);
        }

        // Attempt to run job
        try {
          await runCommand({
            job: 'tiriti-audit',
            in: 'docs/test-input.md',
            outdir: testOutputDir
          });
          // Should not reach here
          fail('Expected command to throw');
        } catch (error) {
          // Expected to fail
        }

        // Verify no outputs created
        const outputFiles = fs.existsSync(testOutputDir)
          ? fs.readdirSync(testOutputDir).filter(f => !f.startsWith('.'))
          : [];

        expect(outputFiles.length).toBe(0);
      } finally {
        // Restore treaty
        if (fs.existsSync(treatyBackupPath)) {
          fs.copyFileSync(treatyBackupPath, treatyPath);
          fs.unlinkSync(treatyBackupPath);
        }
      }
    });

    it('should succeed when treaty is present', async () => {
      // Ensure treaty exists
      expect(fs.existsSync(treatyPath)).toBe(true);

      // Create test input file
      const testInputPath = path.join('.mathison-test-cli-treaty', 'test-input.md');
      fs.writeFileSync(
        testInputPath,
        `# Tiriti o te Kai\n\nversion: "1.0"\n\nTest content.`
      );

      // Create mock policy
      const policyPath = path.join(testOutputDir, 'test-policy.json');
      fs.writeFileSync(
        policyPath,
        JSON.stringify({
          version: '1.0',
          invariants: []
        })
      );

      // Job should succeed (or at least get past treaty loading)
      // We're not testing full job execution here, just governance initialization
      const runPromise = runCommand({
        job: 'tiriti-audit',
        in: testInputPath,
        outdir: testOutputDir,
        policy: policyPath
      });

      // If it fails, it should NOT be due to treaty unavailability
      try {
        await runPromise;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain('TREATY_UNAVAILABLE');
      }
    });
  });

  describe('Error Message Format', () => {
    it('should include TREATY_UNAVAILABLE in error message', async () => {
      // Backup treaty
      if (fs.existsSync(treatyPath)) {
        fs.copyFileSync(treatyPath, treatyBackupPath);
      }

      try {
        // Remove treaty
        if (fs.existsSync(treatyPath)) {
          fs.unlinkSync(treatyPath);
        }

        // Capture error
        let caughtError: Error | null = null;
        try {
          await runCommand({
            job: 'tiriti-audit',
            in: 'docs/test-input.md',
            outdir: testOutputDir
          });
        } catch (error) {
          caughtError = error as Error;
        }

        // Verify error format
        expect(caughtError).not.toBeNull();
        expect(caughtError?.message).toContain('TREATY_UNAVAILABLE');
      } finally {
        // Restore treaty
        if (fs.existsSync(treatyBackupPath)) {
          fs.copyFileSync(treatyBackupPath, treatyPath);
          fs.unlinkSync(treatyBackupPath);
        }
      }
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('should deny job execution when governance unavailable', async () => {
      // Backup treaty
      if (fs.existsSync(treatyPath)) {
        fs.copyFileSync(treatyPath, treatyBackupPath);
      }

      try {
        // Remove treaty
        if (fs.existsSync(treatyPath)) {
          fs.unlinkSync(treatyPath);
        }

        // Create test input that would normally succeed
        const testInputPath = path.join('.mathison-test-cli-treaty', 'valid-input.md');
        fs.writeFileSync(
          testInputPath,
          `# Tiriti o te Kai\n\nversion: "1.0"\n\n## 1) People First; Tools Serve\n\nAI systems serve human agency.`
        );

        // Should still fail due to missing treaty (fail-closed)
        await expect(
          runCommand({
            job: 'tiriti-audit',
            in: testInputPath,
            outdir: testOutputDir
          })
        ).rejects.toThrow();
      } finally {
        // Restore treaty
        if (fs.existsSync(treatyBackupPath)) {
          fs.copyFileSync(treatyBackupPath, treatyPath);
          fs.unlinkSync(treatyBackupPath);
        }
      }
    });
  });
});
