/**
 * Phase 0.5: StorageAdapter Conformance Tests
 *
 * Tests verify:
 * 1. FILE vs SQLITE equivalence (write/read cycle)
 * 2. Crash/restart simulation (write, close, re-init, read)
 * 3. Invalid backend fails CLOSED
 * 4. Lifecycle management (init/close idempotency, error states)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  StorageAdapter,
  FileStorageAdapter,
  SqliteStorageAdapter,
  makeStorageAdapterFromEnv
} from '../storage-adapter';
import { JobCheckpoint } from '../checkpoint_store';
import { Receipt } from '../receipt_store';
import { GraphNode, GraphEdge } from '../graph_store';
import { StoreMisconfiguredError } from '../types';

describe('StorageAdapter Conformance Suite', () => {
  let tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-adapter-test-'));
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

  describe('FILE vs SQLITE Equivalence', () => {
    async function testWriteReadCycle(adapter: StorageAdapter, backend: string) {
      await adapter.init();

      // Verify backend
      expect(adapter.getBackend()).toBe(backend);

      const checkpointStore = adapter.getCheckpointStore();
      const receiptStore = adapter.getReceiptStore();
      const graphStore = adapter.getGraphStore();

      // Write checkpoint
      const checkpoint: JobCheckpoint = {
        job_id: 'job-001',
        job_type: 'test',
        status: 'running',
        current_stage: 'stage1',
        completed_stages: [],
        content_hash: 'hash-123'
      };
      await checkpointStore.create(checkpoint);

      // Write receipt
      const receipt: Receipt = {
        timestamp: new Date().toISOString(),
        job_id: 'job-001',
        stage: 'stage1',
        action: 'start',
        policy_id: 'policy-1',
        store_backend: backend === 'FILE' ? 'FILE' : 'SQLITE'
      };
      await receiptStore.append(receipt);

      // Write graph node
      const node: GraphNode = {
        id: 'node-001',
        type: 'test',
        data: { value: 42 }
      };
      await graphStore.writeNode(node);

      // Write graph edge
      const edge: GraphEdge = {
        id: 'edge-001',
        source: 'node-001',
        target: 'node-002',
        type: 'test-edge'
      };
      await graphStore.writeEdge(edge);

      // Read back and verify
      const loadedCheckpoint = await checkpointStore.load('job-001');
      expect(loadedCheckpoint).not.toBeNull();
      expect(loadedCheckpoint?.job_id).toBe('job-001');
      expect(loadedCheckpoint?.status).toBe('running');
      expect(loadedCheckpoint?.content_hash).toBe('hash-123');

      const receipts = await receiptStore.readByJob('job-001');
      expect(receipts).toHaveLength(1);
      expect(receipts[0].action).toBe('start');

      const loadedNode = await graphStore.readNode('node-001');
      expect(loadedNode).not.toBeNull();
      expect(loadedNode?.type).toBe('test');
      expect(loadedNode?.data.value).toBe(42);

      const loadedEdge = await graphStore.readEdge('edge-001');
      expect(loadedEdge).not.toBeNull();
      expect(loadedEdge?.type).toBe('test-edge');

      await adapter.close();
    }

    it('FILE backend: write/read cycle', async () => {
      const tempDir = makeTempDir();
      const adapter = new FileStorageAdapter(tempDir);
      await testWriteReadCycle(adapter, 'FILE');
    });

    it('SQLITE backend: write/read cycle', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 'test.db');
      const adapter = new SqliteStorageAdapter(dbPath);
      await testWriteReadCycle(adapter, 'SQLITE');
    });
  });

  describe('Crash/Restart Simulation', () => {
    it('FILE: write, close, re-init, read', async () => {
      const tempDir = makeTempDir();

      // First session: write data
      const adapter1 = new FileStorageAdapter(tempDir);
      await adapter1.init();

      const checkpoint: JobCheckpoint = {
        job_id: 'job-restart-001',
        job_type: 'test',
        status: 'running',
        current_stage: 'stage1',
        completed_stages: []
      };
      await adapter1.getCheckpointStore().create(checkpoint);

      const node: GraphNode = {
        id: 'node-restart-001',
        type: 'test',
        data: { value: 100 }
      };
      await adapter1.getGraphStore().writeNode(node);

      await adapter1.close();

      // Simulate crash/restart: create new adapter, re-init
      const adapter2 = new FileStorageAdapter(tempDir);
      await adapter2.init();

      // Verify data persisted
      const loadedCheckpoint = await adapter2.getCheckpointStore().load('job-restart-001');
      expect(loadedCheckpoint).not.toBeNull();
      expect(loadedCheckpoint?.job_id).toBe('job-restart-001');

      const loadedNode = await adapter2.getGraphStore().readNode('node-restart-001');
      expect(loadedNode).not.toBeNull();
      expect(loadedNode?.data.value).toBe(100);

      await adapter2.close();
    });

    it('SQLITE: write, close, re-init, read', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 'restart-test.db');

      // First session: write data
      const adapter1 = new SqliteStorageAdapter(dbPath);
      await adapter1.init();

      const checkpoint: JobCheckpoint = {
        job_id: 'job-restart-sqlite-001',
        job_type: 'test',
        status: 'completed',
        current_stage: null,
        completed_stages: ['stage1', 'stage2']
      };
      await adapter1.getCheckpointStore().create(checkpoint);

      const receipt: Receipt = {
        timestamp: new Date().toISOString(),
        job_id: 'job-restart-sqlite-001',
        stage: 'stage2',
        action: 'complete',
        store_backend: 'SQLITE'
      };
      await adapter1.getReceiptStore().append(receipt);

      await adapter1.close();

      // Simulate crash/restart
      const adapter2 = new SqliteStorageAdapter(dbPath);
      await adapter2.init();

      // Verify data persisted
      const loadedCheckpoint = await adapter2.getCheckpointStore().load('job-restart-sqlite-001');
      expect(loadedCheckpoint).not.toBeNull();
      expect(loadedCheckpoint?.status).toBe('completed');
      expect(loadedCheckpoint?.completed_stages).toEqual(['stage1', 'stage2']);

      const receipts = await adapter2.getReceiptStore().readByJob('job-restart-sqlite-001');
      expect(receipts).toHaveLength(1);
      expect(receipts[0].action).toBe('complete');

      await adapter2.close();
    });
  });

  describe('Invalid Backend (Fail-Closed)', () => {
    it('throws StoreMisconfiguredError for missing MATHISON_STORE_BACKEND', () => {
      expect(() => {
        makeStorageAdapterFromEnv({});
      }).toThrow(StoreMisconfiguredError);
    });

    it('throws StoreMisconfiguredError for invalid backend', () => {
      expect(() => {
        makeStorageAdapterFromEnv({
          MATHISON_STORE_BACKEND: 'INVALID',
          MATHISON_STORE_PATH: '/tmp/test'
        });
      }).toThrow(StoreMisconfiguredError);
    });

    it('throws StoreMisconfiguredError for missing MATHISON_STORE_PATH', () => {
      expect(() => {
        makeStorageAdapterFromEnv({
          MATHISON_STORE_BACKEND: 'FILE'
        });
      }).toThrow(StoreMisconfiguredError);
    });
  });

  describe('Lifecycle Management', () => {
    it('FILE: init is idempotent', async () => {
      const tempDir = makeTempDir();
      const adapter = new FileStorageAdapter(tempDir);

      await adapter.init();
      await adapter.init(); // Second init should be safe

      const node: GraphNode = {
        id: 'node-idempotent',
        type: 'test',
        data: { value: 1 }
      };
      await adapter.getGraphStore().writeNode(node);

      const loaded = await adapter.getGraphStore().readNode('node-idempotent');
      expect(loaded).not.toBeNull();

      await adapter.close();
    });

    it('SQLITE: init is idempotent', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 'idempotent.db');
      const adapter = new SqliteStorageAdapter(dbPath);

      await adapter.init();
      await adapter.init(); // Second init should be safe

      const checkpoint: JobCheckpoint = {
        job_id: 'job-idempotent',
        job_type: 'test',
        status: 'running',
        completed_stages: []
      };
      await adapter.getCheckpointStore().create(checkpoint);

      const loaded = await adapter.getCheckpointStore().load('job-idempotent');
      expect(loaded).not.toBeNull();

      await adapter.close();
    });

    it('FILE: close is idempotent', async () => {
      const tempDir = makeTempDir();
      const adapter = new FileStorageAdapter(tempDir);

      await adapter.init();
      await adapter.close();
      await adapter.close(); // Second close should be safe
    });

    it('SQLITE: close is idempotent', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 'close-test.db');
      const adapter = new SqliteStorageAdapter(dbPath);

      await adapter.init();
      await adapter.close();
      await adapter.close(); // Second close should be safe
    });

    it('FILE: throws error when accessing stores before init', async () => {
      const tempDir = makeTempDir();
      const adapter = new FileStorageAdapter(tempDir);

      expect(() => {
        adapter.getCheckpointStore();
      }).toThrow('not initialized');

      expect(() => {
        adapter.getReceiptStore();
      }).toThrow('not initialized');

      expect(() => {
        adapter.getGraphStore();
      }).toThrow('not initialized');
    });

    it('SQLITE: throws error when accessing stores before init', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 'uninit.db');
      const adapter = new SqliteStorageAdapter(dbPath);

      expect(() => {
        adapter.getCheckpointStore();
      }).toThrow('not initialized');
    });

    it('FILE: throws error when accessing stores after close', async () => {
      const tempDir = makeTempDir();
      const adapter = new FileStorageAdapter(tempDir);

      await adapter.init();
      await adapter.close();

      expect(() => {
        adapter.getCheckpointStore();
      }).toThrow('closed');
    });

    it('SQLITE: throws error when accessing stores after close', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 'closed.db');
      const adapter = new SqliteStorageAdapter(dbPath);

      await adapter.init();
      await adapter.close();

      expect(() => {
        adapter.getCheckpointStore();
      }).toThrow('closed');
    });

    it('FILE: throws error when re-initializing after close', async () => {
      const tempDir = makeTempDir();
      const adapter = new FileStorageAdapter(tempDir);

      await adapter.init();
      await adapter.close();

      await expect(adapter.init()).rejects.toThrow('closed');
    });

    it('SQLITE: throws error when re-initializing after close', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 're-init.db');
      const adapter = new SqliteStorageAdapter(dbPath);

      await adapter.init();
      await adapter.close();

      await expect(adapter.init()).rejects.toThrow('closed');
    });
  });

  describe('Factory Function', () => {
    it('creates FILE adapter from env', async () => {
      const tempDir = makeTempDir();
      const adapter = makeStorageAdapterFromEnv({
        MATHISON_STORE_BACKEND: 'FILE',
        MATHISON_STORE_PATH: tempDir
      });

      expect(adapter.getBackend()).toBe('FILE');
      expect(adapter).toBeInstanceOf(FileStorageAdapter);

      await adapter.init();

      const node: GraphNode = {
        id: 'node-factory-file',
        type: 'test',
        data: { value: 999 }
      };
      await adapter.getGraphStore().writeNode(node);

      const loaded = await adapter.getGraphStore().readNode('node-factory-file');
      expect(loaded?.data.value).toBe(999);

      await adapter.close();
    });

    it('creates SQLITE adapter from env', async () => {
      const tempDir = makeTempDir();
      const dbPath = path.join(tempDir, 'factory.db');
      const adapter = makeStorageAdapterFromEnv({
        MATHISON_STORE_BACKEND: 'SQLITE',
        MATHISON_STORE_PATH: dbPath
      });

      expect(adapter.getBackend()).toBe('SQLITE');
      expect(adapter).toBeInstanceOf(SqliteStorageAdapter);

      await adapter.init();

      const checkpoint: JobCheckpoint = {
        job_id: 'job-factory-sqlite',
        job_type: 'test',
        status: 'completed',
        completed_stages: []
      };
      await adapter.getCheckpointStore().create(checkpoint);

      const loaded = await adapter.getCheckpointStore().load('job-factory-sqlite');
      expect(loaded?.status).toBe('completed');

      await adapter.close();
    });
  });
});
