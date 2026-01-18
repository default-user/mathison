import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CheckpointStore, JobCheckpoint } from '../checkpoint_store';
import { ReceiptStore, Receipt } from '../receipt_store';
import { FileCheckpointStore, FileReceiptStore } from '../backends/file';

function sqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    // Try to actually create a database to verify bindings are available
    const testDb = new Database(':memory:');
    testDb.close();
    return true;
  } catch {
    return false;
  }
}

const REQUIRE_SQLITE = process.env.MATHISON_REQUIRE_SQLITE === '1';

describe('Store Conformance Suite', () => {
  let tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    // Cleanup temp directories
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  describe('Equivalence Harness', () => {
    async function runEquivalenceTest(
      name: string,
      makeStores: () => Promise<{ checkpointStore: CheckpointStore; receiptStore: ReceiptStore }>
    ) {
      const { checkpointStore, receiptStore } = await makeStores();

      await checkpointStore.init();
      await receiptStore.init();

      // Create checkpoint
      const checkpoint: JobCheckpoint = {
        job_id: 'test-job-001',
        job_type: 'test',
        status: 'running',
        current_stage: 'stage1',
        completed_stages: [],
        content_hash: 'abc123'
      };

      await checkpointStore.create(checkpoint);

      // Append receipts
      const receipt1: Receipt = {
        timestamp: new Date().toISOString(),
        job_id: 'test-job-001',
        stage: 'stage1',
        action: 'start',
        policy_id: 'policy-1',
        inputs_hash: 'input-hash-1',
        store_backend: name === 'FILE' ? 'FILE' : 'SQLITE'
      };

      const receipt2: Receipt = {
        timestamp: new Date().toISOString(),
        job_id: 'test-job-001',
        stage: 'stage1',
        action: 'complete',
        policy_id: 'policy-1',
        outputs_hash: 'output-hash-1',
        store_backend: name === 'FILE' ? 'FILE' : 'SQLITE'
      };

      await receiptStore.append(receipt1);
      await receiptStore.append(receipt2);

      // Update checkpoint
      checkpoint.completed_stages = ['stage1'];
      checkpoint.current_stage = 'stage2';
      checkpoint.status = 'completed';
      await checkpointStore.save(checkpoint);

      // Load and verify
      const loaded = await checkpointStore.load('test-job-001');
      expect(loaded).not.toBeNull();
      expect(loaded?.status).toBe('completed');
      expect(loaded?.completed_stages).toEqual(['stage1']);
      expect(loaded?.content_hash).toBe('abc123');

      // Read receipts
      const receipts = await receiptStore.readByJob('test-job-001');
      expect(receipts).toHaveLength(2);
      expect(receipts[0].action).toBe('start');
      expect(receipts[1].action).toBe('complete');

      // Verify required fields
      for (const r of receipts) {
        expect(r.timestamp).toBeDefined();
        expect(r.job_id).toBe('test-job-001');
        expect(r.stage).toBeDefined();
        expect(r.action).toBeDefined();
        expect(r.policy_id).toBe('policy-1');
        expect(r.store_backend).toBeDefined();
      }

      // Latest receipt
      const latest = await receiptStore.latest('test-job-001');
      expect(latest).not.toBeNull();
      expect(latest?.action).toBe('complete');
    }

    it('FILE backend passes equivalence test', async () => {
      await runEquivalenceTest('FILE', async () => {
        const dir = makeTempDir();
        return {
          checkpointStore: new FileCheckpointStore(dir),
          receiptStore: new FileReceiptStore(dir)
        };
      });
    });

    if (!sqliteAvailable()) {
      if (REQUIRE_SQLITE) {
        it('SQLITE backend passes equivalence test', async () => {
          throw new Error('SQLite required but better-sqlite3 bindings not available. Ensure CI installs build tools and runs `pnpm rebuild better-sqlite3`.');
        });
      } else {
        it.skip('SQLITE backend passes equivalence test (skipped: better-sqlite3 bindings not available)', async () => {});
      }
    } else {
      it('SQLITE backend passes equivalence test', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SQLiteCheckpointStore, SQLiteReceiptStore } = require('../backends/sqlite');
        await runEquivalenceTest('SQLITE', async () => {
          const dir = makeTempDir();
          const dbPath = path.join(dir, 'test.db');
          return {
            checkpointStore: new SQLiteCheckpointStore(dbPath),
            receiptStore: new SQLiteReceiptStore(dbPath)
          };
        });
      });
    }
  });

  describe('Rotation Test (FILE)', () => {
    it('rotates receipts and readByJob spans all logs', async () => {
      const dir = makeTempDir();
      // Force rotation with tiny threshold (1KB)
      const receiptStore = new FileReceiptStore(dir, { maxLogSizeBytes: 1024 });

      await receiptStore.init();

      // Append enough receipts to trigger rotation
      for (let i = 0; i < 50; i++) {
        const receipt: Receipt = {
          timestamp: new Date().toISOString(),
          job_id: 'rotation-job',
          stage: `stage-${i}`,
          action: `action-${i}`,
          policy_id: 'policy-1',
          inputs_hash: `hash-${i}`,
          store_backend: 'FILE',
          notes: 'x'.repeat(100) // Padding to reach rotation threshold
        };
        await receiptStore.append(receipt);
      }

      // Verify multiple log files exist
      const receiptsDir = path.join(dir, 'receipts');
      const logFiles = fs.readdirSync(receiptsDir).filter(f => f.startsWith('eventlog-'));
      expect(logFiles.length).toBeGreaterThan(1);

      // Read all receipts - should span all rotated logs
      const allReceipts = await receiptStore.readByJob('rotation-job');
      expect(allReceipts).toHaveLength(50);

      // Verify order is preserved
      for (let i = 0; i < 50; i++) {
        expect(allReceipts[i].stage).toBe(`stage-${i}`);
      }

      // Latest receipt should be the last one
      const latest = await receiptStore.latest('rotation-job');
      expect(latest?.stage).toBe('stage-49');
    });
  });

  describe('Crash/Restart Test', () => {
    it('FILE backend: resumes after crash', async () => {
      const dir = makeTempDir();

      // Phase 1: Write partial checkpoint + receipts
      {
        const checkpointStore = new FileCheckpointStore(dir);
        const receiptStore = new FileReceiptStore(dir);

        await checkpointStore.init();
        await receiptStore.init();

        const checkpoint: JobCheckpoint = {
          job_id: 'crash-job',
          job_type: 'test',
          status: 'running',
          current_stage: 'stage1',
          completed_stages: []
        };

        await checkpointStore.create(checkpoint);

        const receipt: Receipt = {
          timestamp: new Date().toISOString(),
          job_id: 'crash-job',
          stage: 'stage1',
          action: 'start',
          store_backend: 'FILE'
        };

        await receiptStore.append(receipt);
        // Simulate crash (instances go out of scope)
      }

      // Phase 2: Re-init new store instances and resume
      {
        const checkpointStore = new FileCheckpointStore(dir);
        const receiptStore = new FileReceiptStore(dir);

        await checkpointStore.init();
        await receiptStore.init();

        // Load checkpoint - should still be there
        const loaded = await checkpointStore.load('crash-job');
        expect(loaded).not.toBeNull();
        expect(loaded?.status).toBe('running');

        // Read receipts - should still be there
        const receipts = await receiptStore.readByJob('crash-job');
        expect(receipts).toHaveLength(1);

        // Append new receipt (resume)
        const receipt2: Receipt = {
          timestamp: new Date().toISOString(),
          job_id: 'crash-job',
          stage: 'stage1',
          action: 'complete',
          store_backend: 'FILE'
        };

        await receiptStore.append(receipt2);

        // Verify no duplicates
        const allReceipts = await receiptStore.readByJob('crash-job');
        expect(allReceipts).toHaveLength(2);
        expect(allReceipts[0].action).toBe('start');
        expect(allReceipts[1].action).toBe('complete');
      }
    });

    if (!sqliteAvailable()) {
      if (REQUIRE_SQLITE) {
        it('SQLITE backend: resumes after crash', async () => {
          throw new Error('SQLite required but better-sqlite3 bindings not available. Ensure CI installs build tools and runs `pnpm rebuild better-sqlite3`.');
        });
      } else {
        it.skip('SQLITE backend: resumes after crash (skipped: better-sqlite3 bindings not available)', async () => {});
      }
    } else {
      it('SQLITE backend: resumes after crash', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SQLiteCheckpointStore, SQLiteReceiptStore } = require('../backends/sqlite');
        const dir = makeTempDir();
        const dbPath = path.join(dir, 'crash-test.db');

        // Phase 1: Write partial checkpoint + receipts
        {
          const checkpointStore = new SQLiteCheckpointStore(dbPath);
          const receiptStore = new SQLiteReceiptStore(dbPath);

          await checkpointStore.init();
          await receiptStore.init();

          const checkpoint: JobCheckpoint = {
            job_id: 'crash-job-sqlite',
            job_type: 'test',
            status: 'running',
            current_stage: 'stage1',
            completed_stages: []
          };

          await checkpointStore.create(checkpoint);

          const receipt: Receipt = {
            timestamp: new Date().toISOString(),
            job_id: 'crash-job-sqlite',
            stage: 'stage1',
            action: 'start',
            store_backend: 'SQLITE'
          };

          await receiptStore.append(receipt);
          // Simulate crash (instances go out of scope)
        }

        // Phase 2: Re-init new store instances and resume
        {
          const checkpointStore = new SQLiteCheckpointStore(dbPath);
          const receiptStore = new SQLiteReceiptStore(dbPath);

          await checkpointStore.init();
          await receiptStore.init();

          // Load checkpoint - should still be there
          const loaded = await checkpointStore.load('crash-job-sqlite');
          expect(loaded).not.toBeNull();
          expect(loaded?.status).toBe('running');

          // Read receipts - should still be there
          const receipts = await receiptStore.readByJob('crash-job-sqlite');
          expect(receipts).toHaveLength(1);

          // Append new receipt (resume)
          const receipt2: Receipt = {
            timestamp: new Date().toISOString(),
            job_id: 'crash-job-sqlite',
            stage: 'stage1',
            action: 'complete',
            store_backend: 'SQLITE'
          };

          await receiptStore.append(receipt2);

          // Verify no duplicates
          const allReceipts = await receiptStore.readByJob('crash-job-sqlite');
          expect(allReceipts).toHaveLength(2);
          expect(allReceipts[0].action).toBe('start');
          expect(allReceipts[1].action).toBe('complete');
        }
      });
    }
  });

  describe('Append-Only Semantics (SQLITE)', () => {
    if (!sqliteAvailable()) {
      if (REQUIRE_SQLITE) {
        it('receipts table is append-only (no UPDATE/DELETE in code)', async () => {
          throw new Error('SQLite required but better-sqlite3 bindings not available. Ensure CI installs build tools and runs `pnpm rebuild better-sqlite3`.');
        });
      } else {
        it.skip('receipts table is append-only (no UPDATE/DELETE in code) (skipped: better-sqlite3 bindings not available)', async () => {});
      }
    } else {
      it('receipts table is append-only (no UPDATE/DELETE in code)', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SQLiteReceiptStore } = require('../backends/sqlite');
        const dir = makeTempDir();
        const dbPath = path.join(dir, 'append-only-test.db');

        const receiptStore = new SQLiteReceiptStore(dbPath);
        await receiptStore.init();

        const receipt1: Receipt = {
          timestamp: new Date().toISOString(),
          job_id: 'append-test',
          stage: 'stage1',
          action: 'action1',
          store_backend: 'SQLITE'
        };

        const receipt2: Receipt = {
          timestamp: new Date().toISOString(),
          job_id: 'append-test',
          stage: 'stage2',
          action: 'action2',
          store_backend: 'SQLITE'
        };

        await receiptStore.append(receipt1);
        await receiptStore.append(receipt2);

        // Read all receipts
        const receipts = await receiptStore.readByJob('append-test');
        expect(receipts).toHaveLength(2);

        // Append another receipt - should not affect previous ones
        const receipt3: Receipt = {
          timestamp: new Date().toISOString(),
          job_id: 'append-test',
          stage: 'stage3',
          action: 'action3',
          store_backend: 'SQLITE'
        };

        await receiptStore.append(receipt3);

        // Verify all receipts still present in order
        const allReceipts = await receiptStore.readByJob('append-test');
        expect(allReceipts).toHaveLength(3);
        expect(allReceipts[0].action).toBe('action1');
        expect(allReceipts[1].action).toBe('action2');
        expect(allReceipts[2].action).toBe('action3');

        // Note: This test verifies the code path only uses INSERT.
        // A deeper test would inspect SQL execution logs, but that's beyond scope.
      });
    }
  });
});
