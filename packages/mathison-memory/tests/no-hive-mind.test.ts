/**
 * Mathison v2.1 No-Hive-Mind Tests
 *
 * INVARIANT: Strict per-OI namespaces and identity boundaries.
 * INVARIANT: Cross-OI exchange only via explicit envelope mechanism.
 * INVARIANT: No raw shared stores.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SqliteMemoryStore, GovernanceTags } from '../src';

describe('No-Hive-Mind Invariants', () => {
  let tempDir: string;
  let store: SqliteMemoryStore;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-test-'));
    store = new SqliteMemoryStore({ path: path.join(tempDir, 'test.db') });
    await store.initialize();
  });

  afterEach(async () => {
    await store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('INVARIANT: Namespace boundaries enforced at query layer', () => {
    it('should deny cross-namespace thread access', async () => {
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
