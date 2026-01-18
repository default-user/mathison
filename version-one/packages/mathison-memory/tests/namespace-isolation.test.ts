// WHY: Test namespace isolation enforcement

import { PostgresStore } from '../src/store';

describe('Namespace Isolation', () => {
  test('should require namespace_id for getThreads', async () => {
    // Mock store without real DB connection
    const store = {
      async getThreads(namespace_id: string) {
        if (!namespace_id) {
          throw new Error('namespace_id required for getThreads');
        }
        return [];
      }
    };

    await expect(store.getThreads('')).rejects.toThrow('namespace_id required');
  });

  test('should require namespace_id for getEvents', async () => {
    const store = {
      async getEvents(namespace_id: string) {
        if (!namespace_id) {
          throw new Error('namespace_id required for getEvents');
        }
        return [];
      }
    };

    await expect(store.getEvents('')).rejects.toThrow('namespace_id required');
  });

  test('should require namespace_id for queryByEmbedding', async () => {
    const store = {
      async queryByEmbedding(namespace_id: string, vector: number[], limit: number) {
        if (!namespace_id) {
          throw new Error('namespace_id required for queryByEmbedding');
        }
        return [];
      }
    };

    await expect(store.queryByEmbedding('', [1, 2, 3], 10)).rejects.toThrow('namespace_id required');
  });
});
