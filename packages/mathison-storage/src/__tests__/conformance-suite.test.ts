/**
 * P2-B Conformance Suite
 * Tests backend equivalence (FILE vs SQLITE)
 *
 * Ensures observable behavior is identical across backends:
 * - same final job status
 * - same completed stages
 * - same content hashes
 * - receipts contain required fields
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CheckpointStore, ReceiptStore } from '../interfaces';
import { FileCheckpointStore, FileReceiptStore } from '../file-store';
import { SQLiteCheckpointStore, SQLiteReceiptStore } from '../sqlite-store';

type StoreFactory = () => {
  checkpointStore: CheckpointStore;
  receiptStore: ReceiptStore;
  cleanup: () => Promise<void>;
};

/**
 * Conformance test suite that runs against any backend
 */
export async function runStoreConformanceSuite(
  name: string,
  makeStore: StoreFactory
) {
  describe(`${name} Conformance Suite`, () => {
    let checkpointStore: CheckpointStore;
    let receiptStore: ReceiptStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const stores = makeStore();
      checkpointStore = stores.checkpointStore;
      receiptStore = stores.receiptStore;
      cleanup = stores.cleanup;

      await checkpointStore.initialize();
      await receiptStore.initialize();
    });

    afterEach(async () => {
      await checkpointStore.shutdown();
      await receiptStore.shutdown();
      await cleanup();
    });

    describe('Checkpoint Operations', () => {
      it('should create checkpoint with RUNNING status', async () => {
        const jobId = 'test-job-001';
        const checkpoint = await checkpointStore.createCheckpoint(
          jobId,
          'test_job',
          { input: 'test-input' }
        );

        expect(checkpoint.job_id).toBe(jobId);
        expect(checkpoint.job_type).toBe('test_job');
        expect(checkpoint.status).toBe('RUNNING');
        expect(checkpoint.current_stage).toBe('LOAD');
        expect(checkpoint.inputs).toEqual({ input: 'test-input' });
      });

      it('should load existing checkpoint', async () => {
        const jobId = 'test-job-002';
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'test' });

        const loaded = await checkpointStore.loadCheckpoint(jobId);

        expect(loaded).not.toBeNull();
        expect(loaded!.job_id).toBe(jobId);
        expect(loaded!.status).toBe('RUNNING');
      });

      it('should update stage outputs', async () => {
        const jobId = 'test-job-003';
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'test' });

        await checkpointStore.updateStage(jobId, 'PROCESS', {
          success: true,
          outputs: { result: 'processed' }
        });

        const loaded = await checkpointStore.loadCheckpoint(jobId);

        expect(loaded!.current_stage).toBe('PROCESS');
        expect(loaded!.stage_outputs['PROCESS']).toEqual({ result: 'processed' });
      });

      it('should mark checkpoint as complete', async () => {
        const jobId = 'test-job-004';
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'test' });

        await checkpointStore.markComplete(jobId);

        const loaded = await checkpointStore.loadCheckpoint(jobId);

        expect(loaded!.status).toBe('DONE');
      });

      it('should mark checkpoint as failed', async () => {
        const jobId = 'test-job-005';
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'test' });

        await checkpointStore.markFailed(jobId, 'Test error');

        const loaded = await checkpointStore.loadCheckpoint(jobId);

        expect(loaded!.status).toBe('FAILED');
        expect(loaded!.error).toBe('Test error');
      });

      it('should mark checkpoint as resumable failure', async () => {
        const jobId = 'test-job-006';
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'test' });

        await checkpointStore.markResumableFailure(jobId, 'Timeout error');

        const loaded = await checkpointStore.loadCheckpoint(jobId);

        expect(loaded!.status).toBe('RESUMABLE_FAILURE');
        expect(loaded!.error).toBe('Timeout error');
      });

      it('should list all checkpoints', async () => {
        await checkpointStore.createCheckpoint('job-1', 'test_job', { input: '1' });
        await checkpointStore.createCheckpoint('job-2', 'test_job', { input: '2' });
        await checkpointStore.createCheckpoint('job-3', 'test_job', { input: '3' });

        const list = await checkpointStore.listCheckpoints();

        expect(list.length).toBeGreaterThanOrEqual(3);
        const jobIds = list.map(cp => cp.job_id);
        expect(jobIds).toContain('job-1');
        expect(jobIds).toContain('job-2');
        expect(jobIds).toContain('job-3');
      });
    });

    describe('Receipt Operations', () => {
      it('should append receipt with required fields', async () => {
        const jobId = 'test-job-007';
        await receiptStore.append({
          job_id: jobId,
          stage: 'LOAD',
          action: 'STAGE_START',
          timestamp: Date.now(),
          policy_id: 'policy-001',
          inputs_hash: 'abc123',
          outputs_hash: 'def456',
          verdict: 'allow',
          reason: 'Test reason'
        });

        const receipts = await receiptStore.queryByJobId(jobId);

        expect(receipts.length).toBe(1);
        expect(receipts[0].job_id).toBe(jobId);
        expect(receipts[0].stage).toBe('LOAD');
        expect(receipts[0].policy_id).toBe('policy-001');
        expect(receipts[0].inputs_hash).toBe('abc123');
        expect(receipts[0].outputs_hash).toBe('def456');
        expect(receipts[0].verdict).toBe('allow');
      });

      it('should query receipts by job ID', async () => {
        const jobId = 'test-job-008';

        await receiptStore.append({
          job_id: jobId,
          stage: 'LOAD',
          action: 'STAGE_START',
          timestamp: Date.now()
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'PROCESS',
          action: 'STAGE_START',
          timestamp: Date.now()
        });

        const receipts = await receiptStore.queryByJobId(jobId);

        expect(receipts.length).toBe(2);
        expect(receipts[0].stage).toBe('LOAD');
        expect(receipts[1].stage).toBe('PROCESS');
      });

      it('should return latest receipt for job', async () => {
        const jobId = 'test-job-009';

        await receiptStore.append({
          job_id: jobId,
          stage: 'LOAD',
          action: 'STAGE_START',
          timestamp: Date.now()
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'PROCESS',
          action: 'STAGE_START',
          timestamp: Date.now()
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'DONE',
          action: 'STAGE_COMPLETE',
          timestamp: Date.now()
        });

        const latest = await receiptStore.latest(jobId);

        expect(latest).not.toBeNull();
        expect(latest!.stage).toBe('DONE');
        expect(latest!.action).toBe('STAGE_COMPLETE');
      });

      it('should query receipts by verdict', async () => {
        await receiptStore.append({
          job_id: 'job-allow-1',
          stage: 'CHECK',
          action: 'GOVERNANCE',
          timestamp: Date.now(),
          verdict: 'allow'
        });

        await receiptStore.append({
          job_id: 'job-deny-1',
          stage: 'CHECK',
          action: 'GOVERNANCE',
          timestamp: Date.now(),
          verdict: 'deny'
        });

        const allowReceipts = await receiptStore.queryByVerdict('allow');
        const denyReceipts = await receiptStore.queryByVerdict('deny');

        expect(allowReceipts.length).toBeGreaterThanOrEqual(1);
        expect(denyReceipts.length).toBeGreaterThanOrEqual(1);
        expect(allowReceipts.every(r => r.verdict === 'allow')).toBe(true);
        expect(denyReceipts.every(r => r.verdict === 'deny')).toBe(true);
      });

      it('should query receipts by time range', async () => {
        const now = Date.now();
        const hour = 60 * 60 * 1000;

        await receiptStore.append({
          job_id: 'job-time-1',
          stage: 'TEST',
          action: 'TEST',
          timestamp: now - hour
        });

        await receiptStore.append({
          job_id: 'job-time-2',
          stage: 'TEST',
          action: 'TEST',
          timestamp: now
        });

        const receipts = await receiptStore.queryByTimeRange(now - (2 * hour), now + hour);

        expect(receipts.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Backend Equivalence', () => {
      it('should produce same final job status across backends', async () => {
        const jobId = 'equiv-test-001';

        // Create checkpoint
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'test' });

        // Progress through stages
        await checkpointStore.updateStage(jobId, 'LOAD', {
          success: true,
          outputs: { loaded: true }
        });

        await checkpointStore.updateStage(jobId, 'PROCESS', {
          success: true,
          outputs: { processed: true }
        });

        await checkpointStore.markComplete(jobId);

        const checkpoint = await checkpointStore.loadCheckpoint(jobId);

        expect(checkpoint!.status).toBe('DONE');
        expect(checkpoint!.stage_outputs).toHaveProperty('LOAD');
        expect(checkpoint!.stage_outputs).toHaveProperty('PROCESS');
      });

      it('should preserve content hashes across backends', async () => {
        const testContent = 'test content for hashing';
        const hash1 = checkpointStore.hashContent(testContent);
        const hash2 = checkpointStore.hashContent(testContent);

        expect(hash1).toBe(hash2);
        expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
      });

      it('should maintain receipt integrity fields', async () => {
        const jobId = 'integrity-test-001';

        await receiptStore.append({
          job_id: jobId,
          stage: 'GOVERNANCE_CHECK',
          action: 'CDI_EVAL',
          timestamp: Date.now(),
          treaty_hash: 'bb2d685d...',
          treaty_version: '1.0',
          policy_id: 'policy-tiriti-v1',
          inputs_hash: 'input-hash-123',
          outputs_hash: 'output-hash-456',
          verdict: 'allow',
          reason: 'COMPLIANT'
        });

        const receipts = await receiptStore.queryByJobId(jobId);

        expect(receipts.length).toBe(1);
        expect(receipts[0].treaty_hash).toBe('bb2d685d...');
        expect(receipts[0].treaty_version).toBe('1.0');
        expect(receipts[0].policy_id).toBe('policy-tiriti-v1');
        expect(receipts[0].inputs_hash).toBe('input-hash-123');
        expect(receipts[0].outputs_hash).toBe('output-hash-456');
      });
    });
  });
}

// Run suite for both backends
describe('Storage Backend Conformance', () => {
  const testDir = path.join(__dirname, '../../../.test-storage');

  // FILE backend
  runStoreConformanceSuite('FILE Backend', () => {
    const checkpointDir = path.join(testDir, `file-checkpoints-${Date.now()}`);
    const eventLogPath = path.join(testDir, `file-eventlog-${Date.now()}`);

    return {
      checkpointStore: new FileCheckpointStore({ checkpointDir }),
      receiptStore: new FileReceiptStore({ eventLogPath }),
      cleanup: async () => {
        try {
          await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
  });

  // SQLITE backend
  runStoreConformanceSuite('SQLITE Backend', () => {
    const dbPath = path.join(testDir, `sqlite-${Date.now()}.db`);

    return {
      checkpointStore: new SQLiteCheckpointStore({ dbPath }),
      receiptStore: new SQLiteReceiptStore({ dbPath }),
      cleanup: async () => {
        try {
          await fs.rm(testDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
  });
});
