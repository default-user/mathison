import { CheckpointStore } from './checkpoint_store';
import { ReceiptStore } from './receipt_store';
import { loadStoreConfigFromEnv } from './types';
import { FileCheckpointStore, FileReceiptStore } from './backends/file';
import { SQLiteCheckpointStore, SQLiteReceiptStore } from './backends/sqlite';

export interface Stores {
  checkpointStore: CheckpointStore;
  receiptStore: ReceiptStore;
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

  if (config.backend === 'FILE') {
    checkpointStore = new FileCheckpointStore(config.path);
    receiptStore = new FileReceiptStore(config.path);
  } else if (config.backend === 'SQLITE') {
    checkpointStore = new SQLiteCheckpointStore(config.path);
    receiptStore = new SQLiteReceiptStore(config.path);
  } else {
    // TypeScript exhaustiveness check (should never reach here)
    const _exhaustive: never = config.backend;
    throw new Error(`Unexpected backend: ${_exhaustive}`);
  }

  return { checkpointStore, receiptStore };
}
