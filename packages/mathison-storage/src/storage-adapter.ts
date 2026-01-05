/**
 * Phase 0.5: First-Class StorageAdapter Interface
 *
 * Provides lifecycle management and unified access to storage backends.
 */

import { CheckpointStore } from './checkpoint_store';
import { ReceiptStore } from './receipt_store';
import { GraphStore } from './graph_store';
import { StoreBackend, loadStoreConfigFromEnv } from './types';
import { FileCheckpointStore, FileReceiptStore, FileGraphStore } from './backends/file';
import { SQLiteCheckpointStore, SQLiteReceiptStore, SQLiteGraphStore } from './backends/sqlite';

/**
 * StorageAdapter provides a unified interface for storage lifecycle management.
 */
export interface StorageAdapter {
  /**
   * Initialize all stores (must be called before use)
   */
  init(): Promise<void>;

  /**
   * Close all stores and release resources
   */
  close(): Promise<void>;

  /**
   * Get the backend type
   */
  getBackend(): StoreBackend;

  /**
   * Get the checkpoint store
   */
  getCheckpointStore(): CheckpointStore;

  /**
   * Get the receipt store
   */
  getReceiptStore(): ReceiptStore;

  /**
   * Get the graph store
   */
  getGraphStore(): GraphStore;
}

/**
 * FileStorageAdapter - File-based storage backend
 */
export class FileStorageAdapter implements StorageAdapter {
  private checkpointStore: FileCheckpointStore;
  private receiptStore: FileReceiptStore;
  private graphStore: FileGraphStore;
  private initialized = false;
  private closed = false;

  constructor(path: string) {
    this.checkpointStore = new FileCheckpointStore(path);
    this.receiptStore = new FileReceiptStore(path);
    this.graphStore = new FileGraphStore(path);
  }

  async init(): Promise<void> {
    if (this.closed) {
      throw new Error('Cannot init: adapter has been closed');
    }
    if (this.initialized) {
      return; // Idempotent
    }

    await this.checkpointStore.init();
    await this.receiptStore.init();
    await this.graphStore.initialize();
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return; // Idempotent
    }

    await this.graphStore.shutdown();
    this.closed = true;
    this.initialized = false;
  }

  getBackend(): StoreBackend {
    return 'FILE';
  }

  getCheckpointStore(): CheckpointStore {
    this.assertInitialized();
    return this.checkpointStore;
  }

  getReceiptStore(): ReceiptStore {
    this.assertInitialized();
    return this.receiptStore;
  }

  getGraphStore(): GraphStore {
    this.assertInitialized();
    return this.graphStore;
  }

  private assertInitialized(): void {
    if (this.closed) {
      throw new Error('StorageAdapter has been closed');
    }
    if (!this.initialized) {
      throw new Error('StorageAdapter not initialized - call init() first');
    }
  }
}

/**
 * SqliteStorageAdapter - SQLite-based storage backend
 */
export class SqliteStorageAdapter implements StorageAdapter {
  private checkpointStore: SQLiteCheckpointStore;
  private receiptStore: SQLiteReceiptStore;
  private graphStore: SQLiteGraphStore;
  private initialized = false;
  private closed = false;

  constructor(path: string) {
    this.checkpointStore = new SQLiteCheckpointStore(path);
    this.receiptStore = new SQLiteReceiptStore(path);
    this.graphStore = new SQLiteGraphStore(path);
  }

  async init(): Promise<void> {
    if (this.closed) {
      throw new Error('Cannot init: adapter has been closed');
    }
    if (this.initialized) {
      return; // Idempotent
    }

    await this.checkpointStore.init();
    await this.receiptStore.init();
    await this.graphStore.initialize();
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.closed) {
      return; // Idempotent
    }

    await this.graphStore.shutdown();
    this.closed = true;
    this.initialized = false;
  }

  getBackend(): StoreBackend {
    return 'SQLITE';
  }

  getCheckpointStore(): CheckpointStore {
    this.assertInitialized();
    return this.checkpointStore;
  }

  getReceiptStore(): ReceiptStore {
    this.assertInitialized();
    return this.receiptStore;
  }

  getGraphStore(): GraphStore {
    this.assertInitialized();
    return this.graphStore;
  }

  private assertInitialized(): void {
    if (this.closed) {
      throw new Error('StorageAdapter has been closed');
    }
    if (!this.initialized) {
      throw new Error('StorageAdapter not initialized - call init() first');
    }
  }
}

/**
 * Factory function to create a StorageAdapter from environment configuration.
 * Fail-closed: throws StoreMisconfiguredError if config invalid/missing.
 *
 * P0.2: After storage sealing (post-boot), requires governance capability token
 * to prevent direct storage access that bypasses governance.
 *
 * @param env Environment variables (default: process.env)
 * @param governanceToken Governance capability token (required after sealing)
 * @throws Error if storage is sealed and token is invalid
 */
export function makeStorageAdapterFromEnv(
  env = process.env,
  governanceToken?: symbol
): StorageAdapter {
  // P0.2: Check governance capability before creating adapter
  const { assertGovernanceCapability } = require('./storage-seal');
  assertGovernanceCapability(governanceToken);

  const config = loadStoreConfigFromEnv(env);

  if (config.backend === 'FILE') {
    return new FileStorageAdapter(config.path);
  } else if (config.backend === 'SQLITE') {
    return new SqliteStorageAdapter(config.path);
  } else {
    // TypeScript exhaustiveness check (should never reach here)
    const _exhaustive: never = config.backend;
    throw new Error(`Unexpected backend: ${_exhaustive}`);
  }
}
