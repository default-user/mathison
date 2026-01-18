// WHY: Test scheduler selection logic

import { selectNextThread } from '../src/scheduler';

describe('Scheduler', () => {
  test('should select highest priority thread', async () => {
    const mockStore = {
      async getThreads(namespace_id: string) {
        return [
          { thread_id: '1', priority: 1, state: 'open', updated_at: new Date('2024-01-01') },
          { thread_id: '2', priority: 3, state: 'open', updated_at: new Date('2024-01-02') },
          { thread_id: '3', priority: 2, state: 'open', updated_at: new Date('2024-01-03') },
        ] as any;
      }
    } as any;

    const selected = await selectNextThread(mockStore, 'ns-1');
    expect(selected?.thread_id).toBe('2'); // Priority 3 is highest
  });

  test('should tie-break by oldest updated_at', async () => {
    const mockStore = {
      async getThreads(namespace_id: string) {
        return [
          { thread_id: '1', priority: 2, state: 'open', updated_at: new Date('2024-01-03') },
          { thread_id: '2', priority: 2, state: 'open', updated_at: new Date('2024-01-01') },
          { thread_id: '3', priority: 2, state: 'open', updated_at: new Date('2024-01-02') },
        ] as any;
      }
    } as any;

    const selected = await selectNextThread(mockStore, 'ns-1');
    expect(selected?.thread_id).toBe('2'); // Oldest updated_at
  });

  test('should return null if no runnable threads', async () => {
    const mockStore = {
      async getThreads(namespace_id: string) {
        return [
          { thread_id: '1', priority: 1, state: 'done', updated_at: new Date() },
        ] as any;
      }
    } as any;

    const selected = await selectNextThread(mockStore, 'ns-1');
    expect(selected).toBeNull();
  });
});
