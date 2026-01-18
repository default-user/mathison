// WHY: PostgresStore implements MemoryStore with namespace enforcement

import { Pool, PoolClient } from 'pg';
import {
  MemoryStore,
  Thread,
  CreateThreadInput,
  Commitment,
  CreateCommitmentInput,
  Event,
  CreateEventInput,
  Embedding,
  SearchResult,
  ThreadSummary,
  ThreadState,
} from './types';

/**
 * WHY: PostgreSQL implementation with namespace isolation enforced at query level
 */
export class PostgresStore implements MemoryStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async createThread(input: CreateThreadInput): Promise<Thread> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO threads (namespace_id, scope, priority, state, created_at, updated_at)
         VALUES ($1, $2, $3, 'open', NOW(), NOW())
         RETURNING thread_id, namespace_id, scope, priority, state, created_at, updated_at`,
        [input.namespace_id, input.scope, input.priority]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getThreads(namespace_id: string, filters?: any): Promise<Thread[]> {
    // WHY: Require namespace_id, deny queries without it
    if (!namespace_id) {
      throw new Error('namespace_id required for getThreads');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT thread_id, namespace_id, scope, priority, state, created_at, updated_at
         FROM threads
         WHERE namespace_id = $1
         ORDER BY updated_at DESC`,
        [namespace_id]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getThread(thread_id: string): Promise<Thread | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT thread_id, namespace_id, scope, priority, state, created_at, updated_at
         FROM threads
         WHERE thread_id = $1`,
        [thread_id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async updateThreadState(thread_id: string, state: ThreadState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE threads SET state = $1, updated_at = NOW() WHERE thread_id = $2`,
        [state, thread_id]
      );
    } finally {
      client.release();
    }
  }

  async addCommitment(thread_id: string, input: CreateCommitmentInput): Promise<Commitment> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO commitments (thread_id, status, due_at, next_action, blockers, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING commitment_id, thread_id, status, due_at, next_action, blockers, created_at, updated_at`,
        [thread_id, input.status, input.due_at || null, input.next_action, input.blockers || []]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getCommitments(thread_id: string): Promise<Commitment[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT commitment_id, thread_id, status, due_at, next_action, blockers, created_at, updated_at
         FROM commitments
         WHERE thread_id = $1
         ORDER BY created_at ASC`,
        [thread_id]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async logEvent(input: CreateEventInput): Promise<Event> {
    // WHY: Events are append-only, never modified
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO events (namespace_id, thread_id, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING event_id, namespace_id, thread_id, event_type, payload, created_at`,
        [input.namespace_id, input.thread_id || null, input.event_type, JSON.stringify(input.payload)]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getEvents(namespace_id: string, filters?: any): Promise<Event[]> {
    // WHY: Require namespace_id, deny queries without it
    if (!namespace_id) {
      throw new Error('namespace_id required for getEvents');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT event_id, namespace_id, thread_id, event_type, payload, created_at
         FROM events
         WHERE namespace_id = $1
         ORDER BY created_at DESC`,
        [namespace_id]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async addEmbedding(
    namespace_id: string,
    thread_id: string | null,
    content: string,
    vector: number[]
  ): Promise<Embedding> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO embeddings (namespace_id, thread_id, content, vector, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING embedding_id, namespace_id, thread_id, content, vector, created_at`,
        [namespace_id, thread_id, content, JSON.stringify(vector)]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async queryByEmbedding(namespace_id: string, vector: number[], limit: number): Promise<SearchResult[]> {
    // WHY: Require namespace_id, deny queries without it
    if (!namespace_id) {
      throw new Error('namespace_id required for queryByEmbedding');
    }

    const client = await this.pool.connect();
    try {
      // TODO: Use pgvector's <-> operator for cosine distance
      // Stub: return empty for now
      return [];
    } finally {
      client.release();
    }
  }

  async updateThreadSummary(thread_id: string, summary: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO thread_summaries_current (thread_id, summary, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (thread_id) DO UPDATE SET summary = $2, updated_at = NOW()`,
        [thread_id, summary]
      );
    } finally {
      client.release();
    }
  }

  async getThreadSummary(thread_id: string): Promise<ThreadSummary | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT thread_id, summary, updated_at
         FROM thread_summaries_current
         WHERE thread_id = $1`,
        [thread_id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
