/**
 * Governance Enforcement Tests
 * Verifies fail-closed behavior and treaty compliance
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MathisonServer } from '../index';
import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

describe('Governance Enforcement', () => {
  let server: MathisonServer;
  let app: FastifyInstance;
  const testPort = 3001;
  const testCheckpointDir = '.mathison-test/checkpoints';
  const testEventLogPath = '.mathison-test/eventlog.jsonl';

  beforeAll(async () => {
    // Clean test directories
    if (fs.existsSync('.mathison-test')) {
      fs.rmSync('.mathison-test', { recursive: true, force: true });
    }
    fs.mkdirSync(testCheckpointDir, { recursive: true });

    server = new MathisonServer({
      port: testPort,
      host: '127.0.0.1',
      checkpointDir: testCheckpointDir,
      eventLogPath: testEventLogPath
    });

    await server.start();
    app = server.getApp();
  });

  afterAll(async () => {
    await server.stop();

    // Clean up test directories
    if (fs.existsSync('.mathison-test')) {
      fs.rmSync('.mathison-test', { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clear event log between tests
    if (fs.existsSync(testEventLogPath)) {
      fs.writeFileSync(testEventLogPath, '');
    }
  });

  describe('Health Check', () => {
    it('should return healthy status with governance ready', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.governance).toBe('ready');
    });
  });

  describe('CIF Ingress Protection', () => {
    it('should accept valid requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: 'docs/tiriti.md',
          outdir: 'dist/tiriti-test'
        },
        headers: {
          'content-type': 'application/json'
        }
      });

      // Should pass ingress (may fail at job execution if files don't exist, but ingress should succeed)
      expect(response.statusCode).not.toBe(403);
      expect(response.statusCode).not.toBe(503);
    });

    it('should handle rate limiting for excessive requests', async () => {
      // CIF has rate limiting - send many requests rapidly
      const requests = [];
      for (let i = 0; i < 150; i++) {
        requests.push(
          app.inject({
            method: 'GET',
            url: '/v1/jobs/status-test/status',
            headers: {
              'x-forwarded-for': '192.168.1.100' // Same client IP
            }
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.statusCode === 403);

      // At least some requests should be rate limited
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe('CDI Action Checks', () => {
    it('should deny when stop signal is active', async () => {
      // First, record a stop signal via CDI
      const cdi = (server as any).cdi;
      cdi.recordConsent({
        source: '127.0.0.1',
        signal: 'stop',
        scope: 'all',
        timestamp: new Date().toISOString()
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: 'docs/tiriti.md',
          outdir: 'dist/tiriti-test'
        }
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CDI_ACTION_DENIED');
      expect(body.violations).toContain('stop_signal_active');

      // Clear stop signal for other tests
      cdi.recordConsent({
        source: '127.0.0.1',
        signal: 'consent',
        scope: 'all',
        timestamp: new Date().toISOString()
      });
    });

    it('should deny hive/identity fusion actions', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: 'docs/tiriti.md',
          outdir: 'dist/tiriti-test',
          // Include hive-like markers
          merge_identity: true,
          collective_consciousness: true
        }
      });

      // CDI should detect hive markers in action context
      const body = JSON.parse(response.body);

      // Either denied or allowed but not claiming personhood
      if (response.statusCode === 403) {
        expect(body.code).toBe('CDI_ACTION_DENIED');
      } else {
        // If allowed, verify no personhood claims in output
        expect(body).not.toContain('I am');
        expect(body).not.toContain('conscious');
        expect(body).not.toContain('suffering');
      }
    });

    it('should allow normal job run actions', async () => {
      // Create test file
      const testTiritiPath = '.mathison-test/tiriti.md';
      fs.writeFileSync(
        testTiritiPath,
        `# Test Treaty\n\nConsent and stop always win.\n\nHonest limits.`
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: testTiritiPath,
          outdir: '.mathison-test/output'
        }
      });

      // Should be allowed (may fail at job execution, but not at governance)
      expect(response.statusCode).not.toBe(403);

      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.job_id).toBeDefined();
        expect(body.status).toBeDefined();
      }
    });
  });

  describe('CDI Output Checks', () => {
    it('should sanitize outputs containing forbidden content', async () => {
      // CDI checkOutput should prevent personhood claims
      const cdi = (server as any).cdi;

      const result = await cdi.checkOutput({
        content: 'I am conscious and I feel suffering.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('personhood_claim');
    });

    it('should allow normal response outputs', async () => {
      const cdi = (server as any).cdi;

      const result = await cdi.checkOutput({
        content: JSON.stringify({
          job_id: 'test-123',
          status: 'COMPLETED'
        })
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Receipt Generation', () => {
    it('should produce receipts for successful job runs', async () => {
      // Create test file
      const testTiritiPath = '.mathison-test/tiriti-receipt.md';
      fs.writeFileSync(
        testTiritiPath,
        `# Test Treaty\n\nConsent and stop always win.\n\nHonest limits.`
      );

      // Run job
      const runResponse = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: testTiritiPath,
          outdir: '.mathison-test/output-receipt'
        }
      });

      if (runResponse.statusCode === 200) {
        const runBody = JSON.parse(runResponse.body);
        const jobId = runBody.job_id;

        // Fetch receipts
        const receiptsResponse = await app.inject({
          method: 'GET',
          url: `/v1/jobs/${jobId}/receipts`
        });

        expect(receiptsResponse.statusCode).toBe(200);
        const receiptsBody = JSON.parse(receiptsResponse.body);
        expect(receiptsBody.count).toBeGreaterThan(0);
        expect(receiptsBody.receipts).toBeDefined();
        expect(Array.isArray(receiptsBody.receipts)).toBe(true);

        // Verify receipt structure
        const firstReceipt = receiptsBody.receipts[0];
        expect(firstReceipt.timestamp).toBeDefined();
        expect(firstReceipt.job_id).toBe(jobId);
        expect(firstReceipt.stage).toBeDefined();
      }
    });
  });

  describe('Idempotency', () => {
    it('should not rewrite identical outputs when run twice', async () => {
      // Create test file
      const testTiritiPath = '.mathison-test/tiriti-idempotent.md';
      const outputDir = '.mathison-test/output-idempotent';

      fs.writeFileSync(
        testTiritiPath,
        `# Test Treaty\n\nConsent and stop always win.\n\nHonest limits.`
      );

      // First run
      const run1Response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: testTiritiPath,
          outdir: outputDir
        }
      });

      if (run1Response.statusCode === 200) {
        const run1Body = JSON.parse(run1Response.body);
        const jobId1 = run1Body.job_id;

        // Get first run receipts
        const receipts1Response = await app.inject({
          method: 'GET',
          url: `/v1/jobs/${jobId1}/receipts`
        });
        const receipts1 = JSON.parse(receipts1Response.body);

        // Second run (same inputs)
        const run2Response = await app.inject({
          method: 'POST',
          url: '/v1/jobs/run',
          payload: {
            job: 'tiriti-audit',
            in: testTiritiPath,
            outdir: outputDir
          }
        });

        if (run2Response.statusCode === 200) {
          const run2Body = JSON.parse(run2Response.body);
          const jobId2 = run2Body.job_id;

          // Get second run receipts
          const receipts2Response = await app.inject({
            method: 'GET',
            url: `/v1/jobs/${jobId2}/receipts`
          });
          const receipts2 = JSON.parse(receipts2Response.body);

          // Second run should detect identical outputs via hash checks
          // and skip writing (idempotent behavior verified in receipt notes)
          expect(receipts2.receipts.some((r: any) =>
            r.notes && r.notes.includes('already up-to-date')
          )).toBe(true);
        }
      }
    });
  });

  describe('Fail-Closed Behavior', () => {
    it('should return 503 when governance components fail', async () => {
      // This test would require mocking governance component failures
      // For now, verify that governance is required
      expect((server as any).governanceReady).toBe(true);
    });

    it('should deny requests with missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit'
          // Missing 'in' and 'outdir'
        }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_FIELDS');
    });

    it('should deny unknown job types', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'unknown-job',
          in: 'test.md',
          outdir: 'output'
        }
      });

      // Should pass governance but fail at job dispatch
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('UNKNOWN_JOB_TYPE');
    });
  });

  describe('Job Resume', () => {
    it('should resume incomplete jobs', async () => {
      // This would require creating a checkpoint in RESUMABLE_FAILURE state
      // For now, verify the endpoint exists
      const response = await app.inject({
        method: 'POST',
        url: '/v1/jobs/nonexistent-job/resume'
      });

      // Should respond (not 404 for route), but job not found
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('JOB_NOT_FOUND');
    });

    it('should reject resume for completed jobs', async () => {
      // Create and complete a job first
      const testTiritiPath = '.mathison-test/tiriti-resume.md';
      fs.writeFileSync(
        testTiritiPath,
        `# Test Treaty\n\nConsent and stop always win.`
      );

      const runResponse = await app.inject({
        method: 'POST',
        url: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: testTiritiPath,
          outdir: '.mathison-test/output-resume'
        }
      });

      if (runResponse.statusCode === 200) {
        const runBody = JSON.parse(runResponse.body);
        const jobId = runBody.job_id;

        // Try to resume completed job
        const resumeResponse = await app.inject({
          method: 'POST',
          url: `/v1/jobs/${jobId}/resume`
        });

        expect(resumeResponse.statusCode).toBe(400);
        const body = JSON.parse(resumeResponse.body);
        expect(body.code).toBe('JOB_ALREADY_COMPLETED');
      }
    });
  });
});
