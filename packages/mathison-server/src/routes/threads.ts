// WHY: Thread API endpoints

import { Router, Request, Response } from 'express';
import { PostgresStore } from '@mathison/memory';
import { cdiPreActionMiddleware } from '../middleware/cdi';

const router = Router();

// TODO: Initialize store from config
let store: PostgresStore | null = null;

export function setStore(s: PostgresStore) {
  store = s;
}

/**
 * WHY: Create thread
 */
router.post('/threads', cdiPreActionMiddleware('create_thread'), async (req: Request, res: Response) => {
  try {
    if (!store) throw new Error('Store not initialized');
    
    const { namespace_id, scope, priority } = req.body;
    
    if (!namespace_id || !scope || priority === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: namespace_id, scope, priority',
      });
    }

    const thread = await store.createThread({ namespace_id, scope, priority });
    
    res.status(201).json(thread);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * WHY: List threads (requires namespace_id)
 */
router.get('/threads', async (req: Request, res: Response) => {
  try {
    if (!store) throw new Error('Store not initialized');
    
    const namespace_id = req.query.namespace_id as string;
    
    if (!namespace_id) {
      return res.status(400).json({
        error: 'namespace_id query parameter required',
      });
    }

    const threads = await store.getThreads(namespace_id);
    
    res.json({ threads });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * WHY: Add commitment to thread
 */
router.post('/threads/:id/commitments', cdiPreActionMiddleware('add_commitment'), async (req: Request, res: Response) => {
  try {
    if (!store) throw new Error('Store not initialized');
    
    const thread_id = req.params.id;
    const { next_action, status, due_at, blockers } = req.body;
    
    if (!next_action || !status) {
      return res.status(400).json({
        error: 'Missing required fields: next_action, status',
      });
    }

    const commitment = await store.addCommitment(thread_id, {
      next_action,
      status,
      due_at: due_at ? new Date(due_at) : undefined,
      blockers: blockers || [],
    });
    
    res.status(201).json(commitment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * WHY: List commitments for thread
 */
router.get('/threads/:id/commitments', async (req: Request, res: Response) => {
  try {
    if (!store) throw new Error('Store not initialized');
    
    const thread_id = req.params.id;
    const commitments = await store.getCommitments(thread_id);
    
    res.json({ commitments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * WHY: Store message as event
 */
router.post('/threads/:id/messages', async (req: Request, res: Response) => {
  try {
    if (!store) throw new Error('Store not initialized');
    
    const thread_id = req.params.id;
    const { message, namespace_id } = req.body;
    
    if (!message || !namespace_id) {
      return res.status(400).json({
        error: 'Missing required fields: message, namespace_id',
      });
    }

    const event = await store.logEvent({
      namespace_id,
      thread_id,
      event_type: 'message_received',
      payload: { message },
    });
    
    res.status(201).json(event);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * WHY: Trigger reflection job (stub)
 */
router.post('/threads/:id/reflect', async (req: Request, res: Response) => {
  try {
    // TODO: Implement reflection job
    res.json({
      message: 'Reflection job triggered (stub)',
      thread_id: req.params.id,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
