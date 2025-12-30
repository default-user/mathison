import { CheckpointStore } from './checkpoint_store';
import { ReceiptStore } from './receipt_store';
import { GraphStore } from './graph_store';
import { loadStoreConfigFromEnv } from './types';
import { FileCheckpointStore, FileReceiptStore, FileGraphStore } from './backends/file';
import { SQLiteCheckpointStore, SQLiteReceiptStore, SQLiteGraphStore } from './backends/sqlite';

export interface Stores {
  checkpointStore: CheckpointStore;
  receiptStore: ReceiptStore;
  graphStore: GraphStore;
}

/**
 * Factory function to create stores based on environment configuration.
 * Reads MATHISON_STORE_BACKEND and MATHISON_STORE_PATH.
 * Fail-closed: throws StoreMisconfiguredError if config invalid/missing.
 */
export function makeStoresFromEnv(env = process.env): Stores {
  const config = loadStoreConfigFromEnv(env);

  let checkpointStore: CheckpointStore;
  let receiptStore: ReceiptStore;
  let graphStore: GraphStore;

  if (config.backend === 'FILE') {
    checkpointStore = new FileCheckpointStore(config.path);
    receiptStore = new FileReceiptStore(config.path);
    graphStore = new FileGraphStore(config.path);
  } else if (config.backend === 'SQLITE') {
    checkpointStore = new SQLiteCheckpointStore(config.path);
    receiptStore = new SQLiteReceiptStore(config.path);
    graphStore = new SQLiteGraphStore(config.path);
  } else {
    // TypeScript exhaustiveness check (should never reach here)
    const _exhaustive: never = config.backend;
    throw new Error(`Unexpected backend: ${_exhaustive}`);
  }

  return { checkpointStore, receiptStore, graphStore };
}
