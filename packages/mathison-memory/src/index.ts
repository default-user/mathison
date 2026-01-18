/**
 * Mathison v2.1 Memory
 *
 * Unified memory store interface with PostgreSQL and SQLite implementations.
 * All operations require governance tags and enforce namespace boundaries.
 */

// Types
export * from './types';

// PostgreSQL implementation
export { PostgresMemoryStore } from './postgres-store';

// SQLite implementation
export { SqliteMemoryStore } from './sqlite-store';

// Factory function
import { MemoryStore, MemoryStoreConfig } from './types';
import { PostgresMemoryStore } from './postgres-store';
import { SqliteMemoryStore } from './sqlite-store';

/**
 * Create a memory store based on configuration
 */
export function createMemoryStore(config: MemoryStoreConfig): MemoryStore {
  switch (config.type) {
    case 'postgres':
      return new PostgresMemoryStore(config.config);
    case 'sqlite':
      return new SqliteMemoryStore(config.config);
    default:
      throw new Error(`Unknown store type: ${(config as any).type}`);
  }
}
