/**
 * SQLiteStore Tests
 *
 * P2-B verification:
 * - WAL mode + busy_timeout operational
 * - Hash-chained receipts for tamper-evidence
 * - Kill/restart → resume works
 * - Integrity checks pass
 */

import * as fs from 'fs';
import * as path from 'path';
import { SQLiteCheckpointStore, SQLiteReceiptStore } from '../sqlite-store';

describe('SQLiteStore', () => {
  const testDbPath = '.mathison-test-sqlite/test.db';
  const testDir = path.dirname(testDbPath);

  beforeEach(() => {
    // Clean test database
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('SQLiteCheckpointStore', () => {
    it('should initialize with WAL mode', async () => {
      const store = new SQLiteCheckpointStore({ dbPath: testDbPath });
      await store.initialize();

      // Verify WAL files exist
      expect(fs.existsSync(testDbPath)).toBe(true);
      expect(fs.existsSync(testDbPath + '-wal')).toBe(true);

      await store.shutdown();
    });

    it('should create and load checkpoints', async () => {
      const store = new SQLiteCheckpointStore({ dbPath: testDbPath });
      await store.initialize();

      const checkpoint = await store.createCheckpoint('job-1', 'test-job', { input: 'test' });

      expect(checkpoint.job_id).toBe('job-1');
      expect(checkpoint.status).toBe('RUNNING');

      const loaded = await store.loadCheckpoint('job-1');
      expect(loaded).not.toBeNull();
      expect(loaded!.job_id).toBe('job-1');
      expect(loaded!.inputs).toEqual({ input: 'test' });

      await store.shutdown();
    });

    it('should update stage outputs', async () => {
      const store = new SQLiteCheckpointStore({ dbPath: testDbPath });
      await store.initialize();

      await store.createCheckpoint('job-2', 'test-job', { input: 'test' });
      await store.updateStage('job-2', 'LOAD', { success: true, outputs: { loaded: true } });

      const checkpoint = await store.loadCheckpoint('job-2');
      expect(checkpoint!.current_stage).toBe('LOAD');
      expect(checkpoint!.stage_outputs['LOAD']).toEqual({ loaded: true });

      await store.shutdown();
    });

    it('should mark resumable failure', async () => {
      const store = new SQLiteCheckpointStore({ dbPath: testDbPath });
      await store.initialize();

      await store.createCheckpoint('job-3', 'test-job', { input: 'test' });
      await store.markResumableFailure('job-3', 'Test failure');

      const checkpoint = await store.loadCheckpoint('job-3');
      expect(checkpoint!.status).toBe('RESUMABLE_FAILURE');
      expect(checkpoint!.error).toBe('Test failure');

      await store.shutdown();
    });

    it('should list all checkpoints', async () => {
      const store = new SQLiteCheckpointStore({ dbPath: testDbPath });
      await store.initialize();

      await store.createCheckpoint('job-1', 'test-job', { input: 'test1' });
      await store.createCheckpoint('job-2', 'test-job', { input: 'test2' });

      const checkpoints = await store.listCheckpoints();
      expect(checkpoints.length).toBe(2);
      expect(checkpoints.map(c => c.job_id)).toContain('job-1');
      expect(checkpoints.map(c => c.job_id)).toContain('job-2');

      await store.shutdown();
    });

    it('should survive kill/restart (persistence)', async () => {
      // Create checkpoint
      let store = new SQLiteCheckpointStore({ dbPath: testDbPath });
      await store.initialize();
      await store.createCheckpoint('job-persist', 'test-job', { input: 'persisted' });
      await store.shutdown();

      // Simulate restart (new instance)
      store = new SQLiteCheckpointStore({ dbPath: testDbPath });
      await store.initialize();

      const checkpoint = await store.loadCheckpoint('job-persist');
      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.job_id).toBe('job-persist');
      expect(checkpoint!.inputs).toEqual({ input: 'persisted' });

      await store.shutdown();
    });
  });

  describe('SQLiteReceiptStore', () => {
    it('should initialize with WAL mode', async () => {
      const store = new SQLiteReceiptStore({ dbPath: testDbPath });
      await store.initialize();

      expect(fs.existsSync(testDbPath)).toBe(true);
      expect(fs.existsSync(testDbPath + '-wal')).toBe(true);

      await store.shutdown();
    });

    it('should append receipts with hash chaining', async () => {
      const store = new SQLiteReceiptStore({ dbPath: testDbPath });
      await store.initialize();

      await store.append({
        job_id: 'job-1',
        stage: 'LOAD',
        action: 'START',
        timestamp: Date.now()
      });

      await store.append({
        job_id: 'job-1',
        stage: 'LOAD',
        action: 'COMPLETE',
        timestamp: Date.now()
      });

      const receipts = await store.queryByJobId('job-1');
      expect(receipts.length).toBe(2);

      await store.shutdown();
    });

    it('should verify chain integrity (no tampering)', async () => {
      const store = new SQLiteReceiptStore({ dbPath: testDbPath });
      await store.initialize();

      // Append several receipts
      for (let i = 0; i < 5; i++) {
        await store.append({
          job_id: 'job-chain',
          stage: 'STAGE',
          action: `ACTION_${i}`,
          timestamp: Date.now() + i
        });
      }

      // Verify integrity
      const integrity = await store.verifyChainIntegrity();
      expect(integrity.valid).toBe(true);
      expect(integrity.brokenAt).toBeUndefined();

      await store.shutdown();
    });

    it('should query receipts by verdict', async () => {
      const store = new SQLiteReceiptStore({ dbPath: testDbPath });
      await store.initialize();

      await store.append({
        job_id: 'job-1',
        stage: 'CDI',
        action: 'CHECK',
        timestamp: Date.now(),
        verdict: 'allow'
      });

      await store.append({
        job_id: 'job-2',
        stage: 'CDI',
        action: 'CHECK',
        timestamp: Date.now(),
        verdict: 'deny'
      });

      const allowed = await store.queryByVerdict('allow');
      const denied = await store.queryByVerdict('deny');

      expect(allowed.length).toBe(1);
      expect(denied.length).toBe(1);
      expect(allowed[0].verdict).toBe('allow');
      expect(denied[0].verdict).toBe('deny');

      await store.shutdown();
    });

    it('should query receipts by time range', async () => {
      const store = new SQLiteReceiptStore({ dbPath: testDbPath });
      await store.initialize();

      const now = Date.now();

      await store.append({
        job_id: 'job-1',
        stage: 'STAGE',
        action: 'ACTION',
        timestamp: now - 1000
      });

      await store.append({
        job_id: 'job-2',
        stage: 'STAGE',
        action: 'ACTION',
        timestamp: now
      });

      await store.append({
        job_id: 'job-3',
        stage: 'STAGE',
        action: 'ACTION',
        timestamp: now + 1000
      });

      const receipts = await store.queryByTimeRange(now - 500, now + 500);
      expect(receipts.length).toBe(1);
      expect(receipts[0].job_id).toBe('job-2');

      await store.shutdown();
    });

    it('should survive kill/restart (persistence)', async () => {
      // Create receipts
      let store = new SQLiteReceiptStore({ dbPath: testDbPath });
      await store.initialize();

      await store.append({
        job_id: 'job-persist',
        stage: 'LOAD',
        action: 'START',
        timestamp: Date.now()
      });

      await store.shutdown();

      // Simulate restart
      store = new SQLiteReceiptStore({ dbPath: testDbPath });
      await store.initialize();

      const receipts = await store.queryByJobId('job-persist');
      expect(receipts.length).toBe(1);
      expect(receipts[0].job_id).toBe('job-persist');

      await store.shutdown();
    });
  });

  describe('Integration: Checkpoints + Receipts', () => {
    it('should share same database file', async () => {
      const checkpointStore = new SQLiteCheckpointStore({ dbPath: testDbPath });
      const receiptStore = new SQLiteReceiptStore({ dbPath: testDbPath });

      await checkpointStore.initialize();
      await receiptStore.initialize();

      await checkpointStore.createCheckpoint('job-integrated', 'test-job', { input: 'test' });
      await receiptStore.append({
        job_id: 'job-integrated',
        stage: 'INIT',
        action: 'START',
        timestamp: Date.now()
      });

      const checkpoint = await checkpointStore.loadCheckpoint('job-integrated');
      const receipts = await receiptStore.queryByJobId('job-integrated');

      expect(checkpoint).not.toBeNull();
      expect(receipts.length).toBe(1);

      await checkpointStore.shutdown();
      await receiptStore.shutdown();

      // Verify single database file
      expect(fs.existsSync(testDbPath)).toBe(true);
    });
  });
});
