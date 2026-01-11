/**
 * Phase 3 Server Conformance Tests
 * Proves: fail-closed boot, governance pipeline enforcement, job API works
 */

import { MathisonServer } from '../index';
import { generateTestKeypair, signGenome } from './test-utils';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Phase 3 Server Conformance', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };
  const testGenomePath = path.join(os.tmpdir(), 'mathison-test-genome-server-conformance.json');

  beforeAll(async () => {
    // Generate real test keypair
    const keypair = await generateTestKeypair('test-fixture-key');

    // Create test genome (unsigned)
    const testGenomeUnsigned = {
      schema_version: 'genome.v0.1',
      name: 'TEST_FIXTURE_GENOME',
      version: '1.0.0',
      parents: [],
      created_at: '2025-12-31T00:00:00Z',
      authority: {
        signers: [{
          key_id: 'test-fixture-key',
          alg: 'ed25519',
          public_key: keypair.publicKeyBase64
        }],
        threshold: 1
      },
      invariants: [{
        id: 'INV-TEST',
        severity: 'CRITICAL',
        testable_claim: 'test invariant',
        enforcement_hook: 'test.hook'
      }],
      capabilities: [{
        cap_id: 'CAP-ALL-ACTIONS',
        risk_class: 'A',
        allow_actions: [
          'health_check', 'genome_read', 'memory_read_node', 'memory_read_edges',
          'memory_search', 'memory_create_node', 'memory_create_edge',
          'MEMORY_NODE_CREATE', 'MEMORY_EDGE_CREATE', 'job_run', 'job_status',
          'job_resume', 'receipts_read', 'create_checkpoint', 'save_checkpoint',
          'append_receipt'
        ],
        deny_actions: []
      }],
      build_manifest: { files: [] }
    };

    // Sign genome with real signature
    const testGenome = await signGenome(testGenomeUnsigned, keypair);

    fs.writeFileSync(testGenomePath, JSON.stringify(testGenome));
  });

  afterAll(() => {
    // Cleanup test genome
    if (fs.existsSync(testGenomePath)) {
      fs.unlinkSync(testGenomePath);
    }
  });

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-server-test-'));

    // Set required env vars for FILE backend
    process.env.MATHISON_STORE_BACKEND = 'FILE';
    process.env.MATHISON_STORE_PATH = tempDir;

    // Set genome path to test fixture (required for boot)
    process.env.MATHISON_GENOME_PATH = testGenomePath;
  });

  afterEach(() => {
    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore env
    process.env = { ...originalEnv };
  });

  describe('P3-A: Fail-Closed Boot', () => {
    it('uses config defaults when env vars not set', async () => {
      // Clear env vars to force use of governance.json defaults
      delete process.env.MATHISON_STORE_BACKEND;
      delete process.env.MATHISON_STORE_PATH;

      const server = new MathisonServer({ port: 0 });

      // Should succeed using config defaults (FILE backend, .mathison-store path)
      await server.start();

      const app = server.getApp();
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');

      await server.stop();
    });

    it('refuses to start if MATHISON_STORE_BACKEND invalid', async () => {
      process.env.MATHISON_STORE_BACKEND = 'INVALID';

      const server = new MathisonServer({ port: 0 });

      await expect(server.start()).rejects.toThrow();
    });

    it('starts successfully with valid config', async () => {
      const server = new MathisonServer({ port: 0 });

      await server.start();

      const app = server.getApp();
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.bootStatus).toBe('ready');
      expect(body.governance.treaty.version).toBe('1.0');
      expect(body.storage.initialized).toBe(true);

      await server.stop();
    });

    it('bootStatus transitions from booting to ready deterministically', async () => {
      const server = new MathisonServer({ port: 0 });

      // Before start, server is in 'booting' state (implicitly)
      await server.start();

      // After successful start, bootStatus must be 'ready'
      const app = server.getApp();
      const response1 = await app.inject({
        method: 'GET',
        url: '/health'
      });

      const body1 = JSON.parse(response1.body);
      expect(body1.bootStatus).toBe('ready');

      // Second check should also be 'ready' (deterministic)
      const response2 = await app.inject({
        method: 'GET',
        url: '/health'
      });

      const body2 = JSON.parse(response2.body);
      expect(body2.bootStatus).toBe('ready');

      await server.stop();
    });
  });

  describe('P3-B: ActionGate Enforcement', () => {
    let server: MathisonServer;

    beforeEach(async () => {
      server = new MathisonServer({ port: 0 });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('all job operations create receipts via ActionGate', async () => {
      const app = server.getApp();

      // Run job
      const runResponse = await app.inject({
        method: 'POST',
        url: '/jobs/run',
        payload: {
          jobType: 'test',
          inputs: { foo: 'bar' }
        }
      });

      expect(runResponse.statusCode).toBe(200);
      const runBody = JSON.parse(runResponse.body);
      expect(runBody.job_id).toBeDefined();
      expect(runBody.status).toBe('completed');

      // Check receipts were created via canonical route
      const receiptsResponse = await app.inject({
        method: 'GET',
        url: `/jobs/logs?job_id=${runBody.job_id}`
      });

      expect(receiptsResponse.statusCode).toBe(200);
      const receiptsBody = JSON.parse(receiptsResponse.body);
      expect(receiptsBody.count).toBeGreaterThan(0);

      // Verify receipts have required fields
      for (const receipt of receiptsBody.receipts) {
        expect(receipt.timestamp).toBeDefined();
        expect(receipt.job_id).toBe(runBody.job_id);
        expect(receipt.stage).toBeDefined();
        expect(receipt.action).toBeDefined();
        expect(receipt.store_backend).toBe('FILE');
      }
    });

    it('GET /jobs/logs returns empty array for non-existent job', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/jobs/logs?job_id=non-existent-job-id'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.job_id).toBe('non-existent-job-id');
      expect(body.count).toBe(0);
      expect(body.receipts).toEqual([]);
    });
  });

  describe('P3-C: Job API (run → status → resume)', () => {
    let server: MathisonServer;

    beforeEach(async () => {
      server = new MathisonServer({ port: 0 });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('POST /jobs/run creates and completes job', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'POST',
        url: '/jobs/run',
        payload: {
          jobType: 'test-job',
          inputs: { test: 'data' }
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.job_id).toBeDefined();
      expect(body.status).toBe('completed');
      expect(body.resumable).toBe(false);
      expect(body.outputs).toBeDefined();
      expect(body.decision).toBe('ALLOW');
    });

    it('GET /jobs/status?job_id=... returns job status', async () => {
      const app = server.getApp();

      // Create job
      const runResponse = await app.inject({
        method: 'POST',
        url: '/jobs/run',
        payload: { jobType: 'test' }
      });

      const { job_id } = JSON.parse(runResponse.body);

      // Get status via canonical route
      const statusResponse = await app.inject({
        method: 'GET',
        url: `/jobs/status?job_id=${job_id}`
      });

      expect(statusResponse.statusCode).toBe(200);
      const body = JSON.parse(statusResponse.body);

      expect(body.job_id).toBe(job_id);
      expect(body.status).toBe('completed');
      expect(body.resumable).toBe(false);
    });

    it('GET /jobs/status?job_id=... returns 404 for non-existent job', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/jobs/status?job_id=nonexistent-job'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Job not found');
    });

    it('POST /jobs/resume with { job_id } is idempotent for completed job', async () => {
      const app = server.getApp();

      // Create job
      const runResponse = await app.inject({
        method: 'POST',
        url: '/jobs/run',
        payload: { jobType: 'test', inputs: { x: 1 } }
      });

      const { job_id } = JSON.parse(runResponse.body);

      // Resume completed job (should be idempotent) via canonical route
      const resume1 = await app.inject({
        method: 'POST',
        url: '/jobs/resume',
        payload: { job_id }
      });

      const resume2 = await app.inject({
        method: 'POST',
        url: '/jobs/resume',
        payload: { job_id }
      });

      expect(resume1.statusCode).toBe(200);
      expect(resume2.statusCode).toBe(200);

      const body1 = JSON.parse(resume1.body);
      const body2 = JSON.parse(resume2.body);

      expect(body1.status).toBe('completed');
      expect(body2.status).toBe('completed');
      expect(body1.outputs).toEqual(body2.outputs);
    });

    it('run → status → resume workflow works end-to-end', async () => {
      const app = server.getApp();

      // 1. Run job (jobId will be auto-generated)
      const runResponse = await app.inject({
        method: 'POST',
        url: '/jobs/run',
        payload: {
          jobType: 'test',
          inputs: { value: 42 }
        }
      });

      expect(runResponse.statusCode).toBe(200);
      const runBody = JSON.parse(runResponse.body);
      const jobId = runBody.job_id;
      expect(jobId).toBeDefined();
      expect(runBody.status).toBe('completed');

      // 2. Check status via canonical route
      const statusResponse = await app.inject({
        method: 'GET',
        url: `/jobs/status?job_id=${jobId}`
      });

      expect(statusResponse.statusCode).toBe(200);
      const statusBody = JSON.parse(statusResponse.body);
      expect(statusBody.status).toBe('completed');

      // 3. Resume via canonical route (should be no-op for completed job)
      const resumeResponse = await app.inject({
        method: 'POST',
        url: '/jobs/resume',
        payload: { job_id: jobId }
      });

      expect(resumeResponse.statusCode).toBe(200);
      const resumeBody = JSON.parse(resumeResponse.body);
      expect(resumeBody.status).toBe('completed');
      expect(resumeBody.resumable).toBe(false);
    });
  });

  describe('P3: Governance Pipeline Enforcement', () => {
    let server: MathisonServer;

    beforeEach(async () => {
      server = new MathisonServer({ port: 0 });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    it('unknown routes return 404 with reason_code and fail-closed message', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/unknown/route'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('ROUTE_NOT_FOUND');
      expect(body.message).toContain('fail-closed');
      expect(body.details).toBeDefined();
      expect(body.details.url).toBe('/unknown/route');
      expect(body.details.method).toBe('GET');
    });

    it('all responses pass through governance pipeline', async () => {
      const app = server.getApp();

      // Health check goes through pipeline
      const healthResponse = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(healthResponse.statusCode).toBe(200);

      // Job run goes through pipeline
      const jobResponse = await app.inject({
        method: 'POST',
        url: '/jobs/run',
        payload: { jobType: 'test' }
      });

      expect(jobResponse.statusCode).toBe(200);

      // Both should have been gated (no exceptions thrown = passed governance)
    });
  });
});
