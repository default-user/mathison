/**
 * Storage Backend Configuration
 * P2-B: Backend selection with fail-closed validation
 */

import { CheckpointStore, ReceiptStore } from './interfaces';
import { FileCheckpointStore, FileReceiptStore } from './file-store';
import { SQLiteCheckpointStore, SQLiteReceiptStore } from './sqlite-store';

export type StorageBackend = 'FILE' | 'SQLITE';

export interface StorageConfig {
  backend: StorageBackend;
  path: string;
}

export class StorageConfigError extends Error {
  code: string;

  constructor(message: string, code: string = 'STORE_MISCONFIGURED') {
    super(message);
    this.name = 'StorageConfigError';
    this.code = code;
  }
}

/**
 * Load storage configuration from environment variables
 * Fail-closed: throws StorageConfigError if invalid/missing
 */
export function loadStorageConfig(): StorageConfig {
  const backend = process.env.MATHISON_STORE_BACKEND;
  const path = process.env.MATHISON_STORE_PATH;

  // Fail closed: backend is required
  if (!backend) {
    throw new StorageConfigError(
      'MATHISON_STORE_BACKEND environment variable is required. Valid values: FILE, SQLITE',
      'STORE_MISCONFIGURED'
    );
  }

  // Fail closed: path is required
  if (!path) {
    throw new StorageConfigError(
      'MATHISON_STORE_PATH environment variable is required',
      'STORE_MISCONFIGURED'
    );
  }

  // Fail closed: backend must be valid
  if (backend !== 'FILE' && backend !== 'SQLITE') {
    throw new StorageConfigError(
      `Invalid MATHISON_STORE_BACKEND: ${backend}. Valid values: FILE, SQLITE`,
      'STORE_MISCONFIGURED'
    );
  }

  return {
    backend: backend as StorageBackend,
    path
  };
}

/**
 * Create checkpoint store based on configuration
 */
export function createCheckpointStore(config: StorageConfig): CheckpointStore {
  switch (config.backend) {
    case 'FILE':
      return new FileCheckpointStore({ checkpointDir: config.path });
    case 'SQLITE':
      return new SQLiteCheckpointStore({ dbPath: config.path });
  }
}

/**
 * Create receipt store based on configuration
 */
export function createReceiptStore(config: StorageConfig): ReceiptStore {
  switch (config.backend) {
    case 'FILE':
      return new FileReceiptStore({ eventLogPath: config.path });
    case 'SQLITE':
      return new SQLiteReceiptStore({ dbPath: config.path });
  }
}

/**
 * Log storage configuration once at startup
 */
export function logStorageConfig(config: StorageConfig): void {
  console.log(`📦 Storage Backend: ${config.backend}`);
  console.log(`📂 Storage Path: ${config.path}`);
}
