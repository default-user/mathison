/**
 * Mathison Storage Adapters
 *
 * P2 storage abstraction layer:
 * - CheckpointStore: durable job state
 * - ReceiptStore: append-only governance event log
 * - MemoryStore: graph storage (P2-C)
 *
 * Backends:
 * - FileStore: JSON + JSONL (simple, local)
 * - SQLiteStore: SQLite with WAL + hash chaining (recommended default)
 */

export * from './interfaces';
export * from './file-store';
export * from './sqlite-store';
export * from './config';
