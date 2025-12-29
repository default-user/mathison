/**
 * Treaty-Missing Fail-Closed Tests
 * Verifies system fails closed when treaty is unavailable/corrupted
 *
 * SPEC REQUIREMENT (Architecture v0.2):
 * If docs/tiriti.md is missing/unreadable or treaty integrity check fails:
 * - Side-effect endpoints must DENY
 * - No outputs written (no job run)
 * - Governance receipt appended with reason TREATY_UNAVAILABLE
 */

import { MathisonServer } from '../index';
import { CDI } from 'mathison-governance/dist/cdi';
import * as fs from 'fs';
import * as path from 'path';

describe('Treaty-Missing Fail-Closed', () => {
  // Change to repo root for treaty loading
  const originalCwd = process.cwd();
  const repoRoot = path.resolve(__dirname, '../../../..');

  const testCheckpointDir = '.mathison-test-treaty/checkpoints';
  const testEventLogPath = '.mathison-test-treaty/eventlog.jsonl';
  const treatyPath = path.join(repoRoot, 'docs', 'tiriti.md');
  const treatyBackupPath = path.join(repoRoot, 'docs', 'tiriti.md.backup');

  beforeEach(async () => {
    // Change to repo root so CDI can find config/governance.json
    process.chdir(repoRoot);
    // Clean test directories
    if (fs.existsSync('.mathison-test-treaty')) {
      fs.rmSync('.mathison-test-treaty', { recursive: true, force: true });
    }
    fs.mkdirSync(testCheckpointDir, { recursive: true });

    // Backup treaty if it exists
    if (fs.existsSync(treatyPath)) {
      fs.copyFileSync(treatyPath, treatyBackupPath);
    }
  });

  afterEach(async () => {
    // Restore treaty
    if (fs.existsSync(treatyBackupPath)) {
      fs.copyFileSync(treatyBackupPath, treatyPath);
      fs.unlinkSync(treatyBackupPath);
    }

    // Clean up test directories
    if (fs.existsSync('.mathison-test-treaty')) {
      fs.rmSync('.mathison-test-treaty', { recursive: true, force: true });
    }

    // Restore original working directory
    process.chdir(originalCwd);
  });

  describe('CDI Treaty Loading', () => {
    it('should fail to initialize when treaty file is missing', async () => {
      // Delete treaty
      if (fs.existsSync(treatyPath)) {
        fs.unlinkSync(treatyPath);
      }

      const cdi = new CDI();

      // CDI.initialize() should throw when treaty is missing
      await expect(cdi.initialize()).rejects.toThrow(/TREATY_UNAVAILABLE/);
    });

    it('should fail to initialize when treaty is corrupted (missing version)', async () => {
      // Write corrupted treaty (no version field)
      fs.writeFileSync(treatyPath, '# Corrupted Treaty\n\nNo version here!');

      const cdi = new CDI();

      // CDI.initialize() should throw when treaty is invalid
      await expect(cdi.initialize()).rejects.toThrow(/Treaty missing version field/);
    });

    it('should deny all actions when treaty not loaded', async () => {
      // Create CDI without initializing (treaty not loaded)
      const cdi = new CDI();

      const result = await cdi.checkAction({
        actor: '127.0.0.1',
        action: 'run_job',
        payload: { job: 'tiriti-audit' }
      });

      expect(result.verdict).toBe('deny');
      expect(result.reason).toContain('TREATY_UNAVAILABLE');
    });
  });

  describe('Server Fail-Closed on Missing Treaty', () => {
    it('should fail to start when treaty is missing', async () => {
      // Delete treaty
      if (fs.existsSync(treatyPath)) {
        fs.unlinkSync(treatyPath);
      }

      const server = new MathisonServer({
        port: 3002,
        host: '127.0.0.1',
        checkpointDir: testCheckpointDir,
        eventLogPath: testEventLogPath
      });

      // Server.start() should throw when treaty is missing
      await expect(server.start()).rejects.toThrow(/TREATY_UNAVAILABLE/);
    });

    it('should fail to start when treaty is corrupted', async () => {
      // Write corrupted treaty
      fs.writeFileSync(treatyPath, '# Broken Treaty\n\nMissing version!');

      const server = new MathisonServer({
        port: 3002,
        host: '127.0.0.1',
        checkpointDir: testCheckpointDir,
        eventLogPath: testEventLogPath
      });

      // Server.start() should throw when treaty is invalid
      await expect(server.start()).rejects.toThrow();
    });
  });

  describe('No Side Effects When Treaty Missing', () => {
    it('should not create checkpoints when CDI denies due to missing treaty', async () => {
      // This test verifies that even if we somehow bypass server init checks,
      // CDI will still deny actions and prevent side effects

      const cdi = new CDI();
      // Don't initialize (treaty not loaded)

      // Attempt action
      const result = await cdi.checkAction({
        actor: '127.0.0.1',
        action: 'run_job',
        payload: { job: 'tiriti-audit' }
      });

      // Action denied
      expect(result.verdict).toBe('deny');

      // No checkpoint should exist (because action was denied before execution)
      const checkpointFiles = fs.readdirSync(testCheckpointDir);
      expect(checkpointFiles.length).toBe(0);
    });
  });

  describe('Treaty Integrity', () => {
    it('should successfully load valid treaty', async () => {
      // Ensure treaty exists with valid content
      const validTreaty = `# Tiriti o te Kai

version: "1.0"

Consent and stop always win.
`;
      fs.writeFileSync(treatyPath, validTreaty);

      const cdi = new CDI();

      // Should not throw
      await expect(cdi.initialize()).resolves.not.toThrow();
    });

    it('should extract treaty version correctly', async () => {
      const validTreaty = `# Tiriti o te Kai

version: "1.0"

Core rules.
`;
      fs.writeFileSync(treatyPath, validTreaty);

      const cdi = new CDI();
      await cdi.initialize();

      // CDI should have loaded treaty (verified by actions not being denied)
      const result = await cdi.checkAction({
        actor: '127.0.0.1',
        action: 'safe_action',
        payload: {}
      });

      // Should not be denied for TREATY_UNAVAILABLE
      expect(result.reason).not.toContain('TREATY_UNAVAILABLE');
    });
  });

  describe('Governance Receipt on Treaty Failure', () => {
    it('should log treaty failure reason in action result', async () => {
      const cdi = new CDI();
      // Don't initialize

      const result = await cdi.checkAction({
        actor: '127.0.0.1',
        action: 'run_job',
        payload: { job: 'tiriti-audit' }
      });

      expect(result.verdict).toBe('deny');
      expect(result.reason).toContain('TREATY_UNAVAILABLE');
      expect(result.reason).toContain('Treaty not loaded');
    });
  });
});
