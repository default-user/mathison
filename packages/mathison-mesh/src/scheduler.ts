// WHY: Scheduler selects next runnable thread with logged decisions

import { Thread, MemoryStore } from '@mathison/memory';

/**
 * WHY: Select highest priority runnable thread, tie-break by oldest updated_at
 */
export async function selectNextThread(
  store: MemoryStore,
  namespace_id?: string
): Promise<Thread | null> {
  // Get all threads (optionally filtered by namespace)
  const threads = namespace_id 
    ? await store.getThreads(namespace_id)
    : []; // TODO: Get all threads across namespaces if no namespace specified

  // Filter to runnable (state = 'open')
  const runnable = threads.filter(t => t.state === 'open');

  if (runnable.length === 0) {
    return null;
  }

  // Sort by priority (descending), then updated_at (ascending)
  runnable.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return a.updated_at.getTime() - b.updated_at.getTime(); // Older first
  });

  const selected = runnable[0];

  // TODO: Log scheduler decision as event
  // await store.logEvent({
  //   namespace_id: selected.namespace_id,
  //   thread_id: selected.thread_id,
  //   event_type: 'scheduler_selected',
  //   payload: { reason: 'highest_priority' }
  // });

  return selected;
}
