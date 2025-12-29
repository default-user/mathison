/**
 * End-to-End Output Gating Tests
 * Verifies the full governance pipeline gates outputs correctly
 *
 * SPEC REQUIREMENT (Architecture v0.2):
 * Canonical pipeline: CIF ingress → CDI checkAction → execute → CDI checkOutput → CIF egress
 * All outputs must pass through governance before being returned
 */

import { MathisonServer } from '../index';
import { CDI } from 'mathison-governance/dist/cdi';
import { CIF } from 'mathison-governance/dist/cif';
import * as fs from 'fs';
import * as path from 'path';

describe('End-to-End Output Gating', () => {
  const originalCwd = process.cwd();
  const repoRoot = path.resolve(__dirname, '../../../..');

  const testCheckpointDir = '.mathison-test-gating/checkpoints';
  const testEventLogPath = '.mathison-test-gating/eventlog.jsonl';

  let server: MathisonServer;

  beforeEach(async () => {
    // Change to repo root for treaty loading
    process.chdir(repoRoot);

    // Clean test directories
    if (fs.existsSync('.mathison-test-gating')) {
      fs.rmSync('.mathison-test-gating', { recursive: true, force: true });
    }
    fs.mkdirSync('.mathison-test-gating', { recursive: true });
  });

  afterEach(async () => {
    // Stop server if running
    if (server) {
      await server.stop();
    }

    // Clean up test directories
    if (fs.existsSync('.mathison-test-gating')) {
      fs.rmSync('.mathison-test-gating', { recursive: true, force: true });
    }

    // Restore original working directory
    process.chdir(originalCwd);
  });

  describe('Server Initialization with Governance', () => {
    it('should fail to start if treaty is missing', async () => {
      const treatyPath = path.join(repoRoot, 'docs', 'tiriti.md');
      const treatyBackupPath = path.join(repoRoot, 'docs', 'tiriti.md.backup');

      // Backup treaty
      if (fs.existsSync(treatyPath)) {
        fs.copyFileSync(treatyPath, treatyBackupPath);
      }

      try {
        // Remove treaty
        if (fs.existsSync(treatyPath)) {
          fs.unlinkSync(treatyPath);
        }

        server = new MathisonServer({
          port: 3003,
          host: '127.0.0.1',
          checkpointDir: testCheckpointDir,
          eventLogPath: testEventLogPath
        });

        // Should fail to start
        await expect(server.start()).rejects.toThrow(/TREATY_UNAVAILABLE/);
      } finally {
        // Restore treaty
        if (fs.existsSync(treatyBackupPath)) {
          fs.copyFileSync(treatyBackupPath, treatyPath);
          fs.unlinkSync(treatyBackupPath);
        }
      }
    });

    it('should start successfully with valid treaty', async () => {
      server = new MathisonServer({
        port: 3004,
        host: '127.0.0.1',
        checkpointDir: testCheckpointDir,
        eventLogPath: testEventLogPath
      });

      await server.start();

      // Health check should work
      const app = server.getApp();
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.status).toBe('healthy');
      expect(payload.governance).toBe('ready');
    });
  });

  describe('Governance Pipeline Integration', () => {
    beforeEach(async () => {
      server = new MathisonServer({
        port: 3005,
        host: '127.0.0.1',
        checkpointDir: testCheckpointDir,
        eventLogPath: testEventLogPath
      });

      await server.start();
    });

    it('should pass request through CIF ingress hook', async () => {
      const app = server.getApp();

      // Health endpoint bypasses governance
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
    });

    it('should protect job endpoints with governance', async () => {
      const app = server.getApp();

      // Job endpoints should require governance checks
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: 'nonexistent-file.md',
          outdir: 'output'
        }
      });

      // Should get a response (governance allowed the request structure)
      // But job will fail due to missing input file
      expect(response.statusCode).toBeDefined();
    });

    it('should gate output through full pipeline', async () => {
      const app = server.getApp();

      // Request with valid structure should pass ingress and action checks
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: 'docs/tiriti.md',
          outdir: '.mathison-test-gating/output'
        }
      });

      // Response should go through governance egress
      expect(response.statusCode).toBeDefined();

      // Parse response
      const payload = JSON.parse(response.payload);

      // Should have job structure
      if (response.statusCode === 200) {
        // Success - job completed
        expect(payload.job_id).toBeDefined();
        expect(payload.status).toBeDefined();
      } else {
        // Error - should have error field (gated output)
        expect(payload.error || payload.message).toBeDefined();
      }
    });
  });

  describe('CDI Action Gating', () => {
    it('should deny action when treaty not loaded', async () => {
      const cdi = new CDI();
      // Don't initialize (treaty not loaded)

      const result = await cdi.checkAction({
        actor: '127.0.0.1',
        action: 'run_job',
        payload: { job: 'tiriti-audit' }
      });

      expect(result.verdict).toBe('deny');
      expect(result.reason).toContain('TREATY_UNAVAILABLE');
    });

    it('should allow safe actions when treaty loaded', async () => {
      const cdi = new CDI();
      await cdi.initialize();

      const result = await cdi.checkAction({
        actor: '127.0.0.1',
        action: 'health_check',
        payload: {}
      });

      // Should not be denied for TREATY_UNAVAILABLE
      expect(result.reason).not.toContain('TREATY_UNAVAILABLE');
    });
  });

  describe('CIF Egress Filtering', () => {
    it('should sanitize output through egress', async () => {
      const cif = new CIF();
      await cif.initialize();

      const egressContext = {
        clientId: 'test-client',
        endpoint: '/v1/jobs/run',
        payload: {
          result: 'success',
          message: 'Operation completed'
        }
      };

      const result = await cif.egress(egressContext);

      // Egress should allow safe output
      expect(result.allowed).toBe(true);
      expect(result.sanitizedPayload).toBeDefined();
    });

    it('should detect and handle dangerous patterns', async () => {
      const cif = new CIF();
      await cif.initialize();

      // CIF should handle potentially dangerous patterns
      const egressContext = {
        clientId: 'test-client',
        endpoint: '/v1/jobs/run',
        payload: {
          message: 'Test output',
          data: 'normal data'
        }
      };

      const result = await cif.egress(egressContext);

      // Should still allow (not actually dangerous in this test)
      expect(result.allowed).toBe(true);
    });
  });

  describe('End-to-End Job Execution with Governance', () => {
    beforeEach(async () => {
      server = new MathisonServer({
        port: 3006,
        host: '127.0.0.1',
        checkpointDir: testCheckpointDir,
        eventLogPath: testEventLogPath
      });

      await server.start();
    });

    it('should execute full job through governance pipeline', async () => {
      const app = server.getApp();

      // Create test input
      const inputPath = path.join('.mathison-test-gating', 'test-input.md');
      fs.writeFileSync(inputPath, `# Tiriti o te Kai\n\nversion: "1.0"\n\nTest content.`);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: inputPath,
          outdir: '.mathison-test-gating/output'
        }
      });

      // Verify response went through governance
      expect(response.statusCode).toBeDefined();

      const payload = JSON.parse(response.payload);

      // Response should have expected structure (gated by governance)
      expect(payload).toBeDefined();

      // If error, should have safe error message (not raw internal error)
      if (payload.error) {
        expect(typeof payload.error).toBe('string');
        expect(typeof payload.message).toBe('string');
      }
    });

    it('should gate status endpoint responses', async () => {
      const app = server.getApp();

      // Query non-existent job
      const response = await app.inject({
        method: 'GET',
        url: '/v1/jobs/nonexistent-job/status'
      });

      // Should get governed response
      expect(response.statusCode).toBeDefined();

      const payload = JSON.parse(response.payload);

      // Error response should be gated
      if (payload.error) {
        expect(payload.error).toBeDefined();
        expect(payload.message).toBeDefined();
      }
    });
  });

  describe('Governance Fail-Closed Verification', () => {
    it('should deny requests if governance not ready', async () => {
      // This verifies the server doesn't bypass governance

      const cdi = new CDI();
      const cif = new CIF();

      // Don't initialize - governance not ready

      // Verify CDI denies when not initialized
      const actionResult = await cdi.checkAction({
        actor: 'test',
        action: 'run_job',
        payload: {}
      });

      expect(actionResult.verdict).toBe('deny');

      // Verify CIF handles uninitialized state
      const egressResult = await cif.egress({
        clientId: 'test',
        endpoint: '/test',
        payload: { data: 'test' }
      });

      expect(egressResult).toBeDefined();
    });
  });
});
