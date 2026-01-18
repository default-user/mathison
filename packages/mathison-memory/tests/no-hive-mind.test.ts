/**
 * Mathison v2.1 No-Hive-Mind Tests
 *
 * INVARIANT: Strict per-OI namespaces and identity boundaries.
 * INVARIANT: Cross-OI exchange only via explicit envelope mechanism.
 * INVARIANT: No raw shared stores.
 *
 * Note: These tests require PostgreSQL (CI) or SQLite (local with native bindings).
 * If no database is available, tests will be skipped.
 */

import { MemoryStore, GovernanceTags, PostgresMemoryStore, PostgresStoreConfig } from '../src';

// Use PostgreSQL in CI environment
const usePostgres = !!process.env.POSTGRES_HOST;

// Track database availability
let dbAvailable = true;

async function createTestStore(): Promise<MemoryStore> {
  if (usePostgres) {
    const config: PostgresStoreConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'mathison_test',
      user: process.env.POSTGRES_USER || 'mathison',
      password: process.env.POSTGRES_PASSWORD || 'mathison_test_password',
    };
    const store = new PostgresMemoryStore(config);
    await store.initialize();
    return store;
  }

  // Fallback to SQLite for local testing
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const { SqliteMemoryStore } = await import('../src/sqlite-store');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-test-'));
  const store = new SqliteMemoryStore({ path: path.join(tempDir, 'test.db') });
  await store.initialize();
  return store;
}

// Pre-flight check for database availability
beforeAll(async () => {
  try {
    const testStore = await createTestStore();
    await testStore.close();
    dbAvailable = true;
  } catch (_error) {
    console.warn('Database not available, no-hive-mind tests will be skipped');
    dbAvailable = false;
  }
});

describe('No-Hive-Mind Invariants', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    if (!dbAvailable) return;
    store = await createTestStore();
  });

  afterEach(async () => {
    if (!dbAvailable || !store) return;
    try {
      await store.close();
    } catch (_e) {
      // Ignore close errors
    }
  });

  describe('INVARIANT: Namespace boundaries enforced at query layer', () => {
    it('should deny cross-namespace thread access', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      // Create thread in namespace-a
      const tagsA: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-a',
        purpose: 'test',
        origin_labels: [],
      };

      const thread = await store.createThread(
        {
          namespace_id: 'namespace-a',
          scope: 'test',
          priority: 50,
        },
        tagsA
      );

      // Try to access from namespace-b
      const tagsB: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-b',
        purpose: 'test',
        origin_labels: [],
      };

      await expect(store.getThread(thread.thread_id, tagsB)).rejects.toThrow(
        'Namespace access denied'
      );
    });

    it('should deny cross-namespace thread listing', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      // Create threads in namespace-a
      const tagsA: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-a',
        purpose: 'test',
        origin_labels: [],
      };

      await store.createThread(
        { namespace_id: 'namespace-a', scope: 'test1', priority: 50 },
        tagsA
      );
      await store.createThread(
        { namespace_id: 'namespace-a', scope: 'test2', priority: 50 },
        tagsA
      );

      // Try to list from namespace-b
      const tagsB: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-b',
        purpose: 'test',
        origin_labels: [],
      };

      await expect(store.getThreads('namespace-a', {}, tagsB)).rejects.toThrow(
        'Namespace access denied'
      );
    });

    it('should deny cross-namespace event access', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const tagsA: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-a',
        purpose: 'test',
        origin_labels: [],
      };

      await store.logEvent(
        {
          namespace_id: 'namespace-a',
          event_type: 'test_event',
          payload: { data: 'secret' },
        },
        tagsA
      );

      const tagsB: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-b',
        purpose: 'test',
        origin_labels: [],
      };

      await expect(store.getEvents('namespace-a', {}, tagsB)).rejects.toThrow(
        'Namespace access denied'
      );
    });

    it('should deny cross-namespace embedding query', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const tagsA: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-a',
        purpose: 'test',
        origin_labels: [],
      };

      await store.addEmbedding(
        {
          namespace_id: 'namespace-a',
          content: 'secret content',
          vector: new Array(1536).fill(0.1),
        },
        tagsA
      );

      const tagsB: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-b',
        purpose: 'test',
        origin_labels: [],
      };

      await expect(
        store.queryByEmbedding('namespace-a', new Array(1536).fill(0.1), 10, tagsB)
      ).rejects.toThrow('Namespace access denied');
    });
  });

  describe('INVARIANT: All operations require governance tags', () => {
    it('should reject operations with missing principal_id', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const badTags: GovernanceTags = {
        principal_id: '', // Missing
        oi_id: 'namespace-a',
        purpose: 'test',
        origin_labels: [],
      };

      await expect(
        store.createThread({ namespace_id: 'namespace-a', scope: 'test', priority: 50 }, badTags)
      ).rejects.toThrow('principal_id is required');
    });

    it('should reject operations with missing oi_id', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const badTags: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: '', // Missing
        purpose: 'test',
        origin_labels: [],
      };

      await expect(
        store.createThread({ namespace_id: 'namespace-a', scope: 'test', priority: 50 }, badTags)
      ).rejects.toThrow('oi_id is required');
    });

    it('should reject operations with missing purpose', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const badTags: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-a',
        purpose: '', // Missing
        origin_labels: [],
      };

      await expect(
        store.createThread({ namespace_id: 'namespace-a', scope: 'test', priority: 50 }, badTags)
      ).rejects.toThrow('purpose is required');
    });
  });

  describe('INVARIANT: Namespace_id required for bulk queries', () => {
    it('should require namespace_id for getThreads', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const tags: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: '*', // Wildcard oi_id (admin)
        purpose: 'test',
        origin_labels: [],
      };

      await expect(store.getThreads('', {}, tags)).rejects.toThrow(
        'namespace_id is required'
      );
    });

    it('should require namespace_id for getEvents', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const tags: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: '*',
        purpose: 'test',
        origin_labels: [],
      };

      await expect(store.getEvents('', {}, tags)).rejects.toThrow(
        'namespace_id is required'
      );
    });

    it('should require namespace_id for queryByEmbedding', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const tags: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: '*',
        purpose: 'test',
        origin_labels: [],
      };

      await expect(
        store.queryByEmbedding('', new Array(1536).fill(0.1), 10, tags)
      ).rejects.toThrow('namespace_id is required');
    });
  });

  describe('INVARIANT: Same namespace access is allowed', () => {
    it('should allow access when oi_id matches namespace_id', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      const tags: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-a',
        purpose: 'test',
        origin_labels: [],
      };

      // Create should work
      const thread = await store.createThread(
        { namespace_id: 'namespace-a', scope: 'test', priority: 50 },
        tags
      );
      expect(thread.thread_id).toBeDefined();

      // Get should work
      const retrieved = await store.getThread(thread.thread_id, tags);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.namespace_id).toBe('namespace-a');

      // List should work
      const threads = await store.getThreads('namespace-a', {}, tags);
      expect(threads.length).toBeGreaterThan(0);
    });

    it('should allow wildcard oi_id (*) for admin operations', async () => {
      if (!dbAvailable) {
        console.log('Skipped: Database not available');
        return;
      }

      // First create as regular user
      const userTags: GovernanceTags = {
        principal_id: 'user-1',
        oi_id: 'namespace-a',
        purpose: 'test',
        origin_labels: [],
      };

      const thread = await store.createThread(
        { namespace_id: 'namespace-a', scope: 'test', priority: 50 },
        userTags
      );

      // Admin can access any namespace
      const adminTags: GovernanceTags = {
        principal_id: 'admin',
        oi_id: '*', // Wildcard
        purpose: 'admin-audit',
        origin_labels: ['admin'],
      };

      const retrieved = await store.getThread(thread.thread_id, adminTags);
      expect(retrieved).not.toBeNull();
    });
  });
});
