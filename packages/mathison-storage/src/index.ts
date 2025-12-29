/**
 * Mathison Storage Adapters
 *
 * P2 storage abstraction layer:
 * - CheckpointStore: durable job state
 * - ReceiptStore: append-only governance event log
 * - MemoryStore: graph storage (P2-C)
 *
 * Backends:
 * - FileStore: JSON + JSONL (current implementation)
 * - SQLiteStore: coming in P2-B
 */

export * from './interfaces';
export * from './file-store';
