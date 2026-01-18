/**
 * WHY: index.ts - Memory module public API and factory
 * -----------------------------------------------------------------------------
 * - Barrel export for memory types and store implementations; factory for store creation
 * - Needed to abstract storage backend selection; consistent interface for PostgreSQL/SQLite
 * - Enforces: all memory access through MemoryStore interface; governance tags required
 * - Tradeoff: Runtime store selection vs compile-time type safety for specific backends
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
