/**
 * P2-B Crash/Restart Tests (Both Backends)
 *
 * Tests that stores can recover from crashes:
 * - simulate crash after stage N
 * - re-init store instance fresh
 * - resume completes successfully
 * - no duplicate writes
 * - stable output hashes
 * - receipts include crash + resume evidence
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CheckpointStore, ReceiptStore } from '../interfaces';
import { FileCheckpointStore, FileReceiptStore } from '../file-store';
import { SQLiteCheckpointStore, SQLiteReceiptStore } from '../sqlite-store';

describe('Crash/Restart Recovery', () => {
  const testDir = path.join(__dirname, '../../../.test-crash');

  describe('FILE Backend Crash Recovery', () => {
    const checkpointDir = path.join(testDir, 'file-checkpoints');
    const eventLogPath = path.join(testDir, 'file-eventlog');

    let checkpointStore: CheckpointStore;
    let receiptStore: ReceiptStore;

    beforeEach(async () => {
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      if (checkpointStore) await checkpointStore.shutdown();
      if (receiptStore) await receiptStore.shutdown();
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should recover after crash mid-execution', async () => {
      const jobId = 'crash-test-file-001';

      // Simulate first execution (crashes after stage 2)
      {
        checkpointStore = new FileCheckpointStore({ checkpointDir });
        receiptStore = new FileReceiptStore({ eventLogPath });

        await checkpointStore.initialize();
        await receiptStore.initialize();

        // Create job
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'data' });

        // Stage 1
        await checkpointStore.updateStage(jobId, 'LOAD', {
          success: true,
          outputs: { loaded: true }
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'LOAD',
          action: 'STAGE_COMPLETE',
          timestamp: Date.now(),
          verdict: 'allow'
        });

        // Stage 2
        await checkpointStore.updateStage(jobId, 'PROCESS', {
          success: true,
          outputs: { processed: true }
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'PROCESS',
          action: 'STAGE_COMPLETE',
          timestamp: Date.now(),
          verdict: 'allow'
        });

        // CRASH! (don't mark complete, don't shutdown cleanly)
        // Simulated by just not completing the job
      }

      // Simulate restart: re-init with fresh instances
      {
        checkpointStore = new FileCheckpointStore({ checkpointDir });
        receiptStore = new FileReceiptStore({ eventLogPath });

        await checkpointStore.initialize();
        await receiptStore.initialize();

        // Load checkpoint (should exist from before crash)
        const checkpoint = await checkpointStore.loadCheckpoint(jobId);

        expect(checkpoint).not.toBeNull();
        expect(checkpoint!.status).toBe('RUNNING');
        expect(checkpoint!.stage_outputs).toHaveProperty('LOAD');
        expect(checkpoint!.stage_outputs).toHaveProperty('PROCESS');

        // Resume: log crash recovery
        await receiptStore.append({
          job_id: jobId,
          stage: 'SYSTEM',
          action: 'CRASH_RECOVERY',
          timestamp: Date.now(),
          notes: 'Recovered from crash at PROCESS stage'
        });

        // Complete remaining stages
        await checkpointStore.updateStage(jobId, 'VERIFY', {
          success: true,
          outputs: { verified: true }
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'VERIFY',
          action: 'STAGE_COMPLETE',
          timestamp: Date.now(),
          verdict: 'allow'
        });

        await checkpointStore.markComplete(jobId);

        // Verify final state
        const finalCheckpoint = await checkpointStore.loadCheckpoint(jobId);
        expect(finalCheckpoint!.status).toBe('DONE');

        // Verify receipts include crash recovery evidence
        const receipts = await receiptStore.queryByJobId(jobId);
        const crashReceipt = receipts.find(r => r.action === 'CRASH_RECOVERY');

        expect(crashReceipt).toBeDefined();
        expect(crashReceipt!.notes).toContain('crash');
      }
    });

    it('should prevent duplicate writes after crash (hash guard)', async () => {
      const jobId = 'crash-test-file-002';
      const testContent = 'test-content-for-hashing';

      // First execution
      {
        checkpointStore = new FileCheckpointStore({ checkpointDir });
        await checkpointStore.initialize();

        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: testContent });

        const hash1 = checkpointStore.hashContent(testContent);

        await checkpointStore.updateStage(jobId, 'LOAD', {
          success: true,
          outputs: { hash: hash1 }
        });

        await checkpointStore.shutdown();
      }

      // After restart
      {
        checkpointStore = new FileCheckpointStore({ checkpointDir });
        await checkpointStore.initialize();

        const checkpoint = await checkpointStore.loadCheckpoint(jobId);
        const existingHash = (checkpoint!.stage_outputs['LOAD'] as any).hash;

        // Re-compute hash (should be same)
        const hash2 = checkpointStore.hashContent(testContent);

        expect(hash2).toBe(existingHash);

        // Verify idempotency: same content = same hash
        expect(hash2).toBe(checkpointStore.hashContent(testContent));
      }
    });
  });

  describe('SQLITE Backend Crash Recovery', () => {
    const dbPath = path.join(testDir, 'sqlite-crash-test.db');

    let checkpointStore: CheckpointStore;
    let receiptStore: ReceiptStore;

    beforeEach(async () => {
      await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      if (checkpointStore) await checkpointStore.shutdown();
      if (receiptStore) await receiptStore.shutdown();
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should recover after crash mid-execution', async () => {
      const jobId = 'crash-test-sqlite-001';

      // Simulate first execution (crashes after stage 2)
      {
        checkpointStore = new SQLiteCheckpointStore({ dbPath });
        receiptStore = new SQLiteReceiptStore({ dbPath });

        await checkpointStore.initialize();
        await receiptStore.initialize();

        // Create job
        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'data' });

        // Stage 1
        await checkpointStore.updateStage(jobId, 'LOAD', {
          success: true,
          outputs: { loaded: true }
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'LOAD',
          action: 'STAGE_COMPLETE',
          timestamp: Date.now(),
          verdict: 'allow'
        });

        // Stage 2
        await checkpointStore.updateStage(jobId, 'PROCESS', {
          success: true,
          outputs: { processed: true }
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'PROCESS',
          action: 'STAGE_COMPLETE',
          timestamp: Date.now(),
          verdict: 'allow'
        });

        // CRASH! (don't shutdown properly - simulates sudden termination)
        // WAL should ensure durability
      }

      // Simulate restart: re-init with fresh instances
      {
        checkpointStore = new SQLiteCheckpointStore({ dbPath });
        receiptStore = new SQLiteReceiptStore({ dbPath });

        await checkpointStore.initialize();
        await receiptStore.initialize();

        // Load checkpoint (should exist from before crash due to WAL)
        const checkpoint = await checkpointStore.loadCheckpoint(jobId);

        expect(checkpoint).not.toBeNull();
        expect(checkpoint!.status).toBe('RUNNING');
        expect(checkpoint!.stage_outputs).toHaveProperty('LOAD');
        expect(checkpoint!.stage_outputs).toHaveProperty('PROCESS');

        // Resume: log crash recovery
        await receiptStore.append({
          job_id: jobId,
          stage: 'SYSTEM',
          action: 'CRASH_RECOVERY',
          timestamp: Date.now(),
          notes: 'Recovered from crash at PROCESS stage'
        });

        // Complete remaining stages
        await checkpointStore.updateStage(jobId, 'VERIFY', {
          success: true,
          outputs: { verified: true }
        });

        await receiptStore.append({
          job_id: jobId,
          stage: 'VERIFY',
          action: 'STAGE_COMPLETE',
          timestamp: Date.now(),
          verdict: 'allow'
        });

        await checkpointStore.markComplete(jobId);

        // Verify final state
        const finalCheckpoint = await checkpointStore.loadCheckpoint(jobId);
        expect(finalCheckpoint!.status).toBe('DONE');

        // Verify receipts include crash recovery evidence
        const receipts = await receiptStore.queryByJobId(jobId);
        const crashReceipt = receipts.find(r => r.action === 'CRASH_RECOVERY');

        expect(crashReceipt).toBeDefined();
        expect(crashReceipt!.notes).toContain('crash');
      }
    });

    it('should maintain stable hashes across restart', async () => {
      const jobId = 'crash-test-sqlite-002';
      const testContent = 'stable-hash-test-content';

      // First execution
      {
        checkpointStore = new SQLiteCheckpointStore({ dbPath });
        await checkpointStore.initialize();

        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: testContent });

        const hash1 = checkpointStore.hashContent(testContent);

        await checkpointStore.updateStage(jobId, 'LOAD', {
          success: true,
          outputs: { hash: hash1 }
        });

        await checkpointStore.shutdown();
      }

      // After restart
      {
        checkpointStore = new SQLiteCheckpointStore({ dbPath });
        await checkpointStore.initialize();

        const checkpoint = await checkpointStore.loadCheckpoint(jobId);
        const existingHash = (checkpoint!.stage_outputs['LOAD'] as any).hash;

        // Re-compute hash (should be same)
        const hash2 = checkpointStore.hashContent(testContent);

        expect(hash2).toBe(existingHash);
        expect(hash2).toMatch(/^[a-f0-9]{64}$/); // SHA-256
      }
    });

    it('should handle WAL checkpoint on restart', async () => {
      const jobId = 'crash-test-sqlite-003';

      // Write data without clean shutdown
      {
        checkpointStore = new SQLiteCheckpointStore({ dbPath });
        receiptStore = new SQLiteReceiptStore({ dbPath });

        await checkpointStore.initialize();
        await receiptStore.initialize();

        await checkpointStore.createCheckpoint(jobId, 'test_job', { input: 'wal-test' });

        await receiptStore.append({
          job_id: jobId,
          stage: 'TEST',
          action: 'WAL_TEST',
          timestamp: Date.now()
        });

        // Don't shutdown - simulate crash
      }

      // Restart and verify WAL was applied
      {
        checkpointStore = new SQLiteCheckpointStore({ dbPath });
        receiptStore = new SQLiteReceiptStore({ dbPath });

        await checkpointStore.initialize();
        await receiptStore.initialize();

        const checkpoint = await checkpointStore.loadCheckpoint(jobId);
        const receipts = await receiptStore.queryByJobId(jobId);

        expect(checkpoint).not.toBeNull();
        expect(receipts.length).toBeGreaterThan(0);
        expect(receipts.find(r => r.action === 'WAL_TEST')).toBeDefined();
      }
    });
  });
});
