/**
 * Mathison v2.1 PostgreSQL Memory Store
 *
 * PostgreSQL + pgvector implementation of the MemoryStore interface.
 *
 * INVARIANT: All queries are parameterized (SQL injection safe).
 * INVARIANT: Namespace boundaries enforced at query layer.
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  MemoryStore,
  GovernanceTags,
  Thread,
  ThreadState,
  CreateThreadInput,
  ThreadFilters,
  Commitment,
  CreateCommitmentInput,
  Event,
  LogEventInput,
  EventFilters,
  ThreadSummary,
  Embedding,
  CreateEmbeddingInput,
  EmbeddingQueryResult,
  Document,
  CreateDocumentInput,
  Message,
  CreateMessageInput,
  PostgresStoreConfig,
} from './types';

/**
 * PostgreSQL implementation of MemoryStore.
 */
export class PostgresMemoryStore implements MemoryStore {
  private pool: Pool;
  private config: PostgresStoreConfig;
  private initialized: boolean = false;

  constructor(config: PostgresStoreConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      connectionString: config.connectionString,
    });
  }

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    // Run migrations
    await this.runMigrations();
    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.initialized = false;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Migrations
  // -------------------------------------------------------------------------

  private async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Enable extensions
      await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      await client.query('CREATE EXTENSION IF NOT EXISTS "vector"');

      // Namespaces table
      await client.query(`
        CREATE TABLE IF NOT EXISTS namespaces (
          namespace_id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Threads table
      await client.query(`
        CREATE TABLE IF NOT EXISTS threads (
          thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          namespace_id VARCHAR(255) NOT NULL,
          scope TEXT NOT NULL,
          priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 100),
          state VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'waiting', 'blocked', 'done')),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_threads_namespace ON threads(namespace_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_threads_state ON threads(state)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_threads_priority ON threads(priority DESC)');

      // Commitments table
      await client.query(`
        CREATE TABLE IF NOT EXISTS commitments (
          commitment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          thread_id UUID NOT NULL REFERENCES threads(thread_id),
          status VARCHAR(255) NOT NULL,
          due_at TIMESTAMPTZ,
          next_action TEXT NOT NULL,
          blockers TEXT[] DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_commitments_thread ON commitments(thread_id)');

      // Events table (append-only)
      await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          namespace_id VARCHAR(255) NOT NULL,
          thread_id UUID REFERENCES threads(thread_id),
          event_type VARCHAR(255) NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_events_namespace ON events(namespace_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_events_thread ON events(thread_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)');

      // Thread summaries table
      await client.query(`
        CREATE TABLE IF NOT EXISTS thread_summaries (
          thread_id UUID PRIMARY KEY REFERENCES threads(thread_id),
          summary TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Embeddings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS embeddings (
          embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          namespace_id VARCHAR(255) NOT NULL,
          thread_id UUID REFERENCES threads(thread_id),
          content TEXT NOT NULL,
          vector vector(1536),
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_namespace ON embeddings(namespace_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_thread ON embeddings(thread_id)');

      // Documents table
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          namespace_id VARCHAR(255) NOT NULL,
          thread_id UUID REFERENCES threads(thread_id),
          content TEXT NOT NULL,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_documents_namespace ON documents(namespace_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_documents_thread ON documents(thread_id)');

      // Messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          namespace_id VARCHAR(255) NOT NULL,
          thread_id UUID NOT NULL REFERENCES threads(thread_id),
          content TEXT NOT NULL,
          role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_messages_namespace ON messages(namespace_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)');

      // Insert default namespace if not exists
      await client.query(`
        INSERT INTO namespaces (namespace_id, name)
        VALUES ('default', 'Default Namespace')
        ON CONFLICT (namespace_id) DO NOTHING
      `);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Thread Operations
  // -------------------------------------------------------------------------

  async createThread(input: CreateThreadInput, tags: GovernanceTags): Promise<Thread> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);

    const result = await this.pool.query(
      `INSERT INTO threads (namespace_id, scope, priority)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.namespace_id, input.scope, input.priority]
    );

    return this.mapThread(result.rows[0]);
  }

  async getThreads(
    namespace_id: string,
    filters: ThreadFilters,
    tags: GovernanceTags
  ): Promise<Thread[]> {
    this.validateTags(tags);
    this.validateNamespaceAccess(namespace_id, tags);

    if (!namespace_id) {
      throw new Error('namespace_id is required for getThreads');
    }

    let query = 'SELECT * FROM threads WHERE namespace_id = $1';
    const params: unknown[] = [namespace_id];
    let paramIndex = 2;

    if (filters.state) {
      query += ` AND state = $${paramIndex++}`;
      params.push(filters.state);
    }
    if (filters.priority_min !== undefined) {
      query += ` AND priority >= $${paramIndex++}`;
      params.push(filters.priority_min);
    }
    if (filters.priority_max !== undefined) {
      query += ` AND priority <= $${paramIndex++}`;
      params.push(filters.priority_max);
    }
    if (filters.scope) {
      query += ` AND scope ILIKE $${paramIndex++}`;
      params.push(`%${filters.scope}%`);
    }

    query += ' ORDER BY priority DESC, updated_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapThread);
  }

  async getThread(thread_id: string, tags: GovernanceTags): Promise<Thread | null> {
    this.validateTags(tags);

    const result = await this.pool.query(
      'SELECT * FROM threads WHERE thread_id = $1',
      [thread_id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const thread = this.mapThread(result.rows[0]);
    this.validateNamespaceAccess(thread.namespace_id, tags);
    return thread;
  }

  async updateThreadState(
    thread_id: string,
    state: ThreadState,
    tags: GovernanceTags
  ): Promise<Thread> {
    this.validateTags(tags);

    // First get the thread to validate namespace access
    const existing = await this.getThread(thread_id, tags);
    if (!existing) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const result = await this.pool.query(
      `UPDATE threads SET state = $1, updated_at = NOW()
       WHERE thread_id = $2
       RETURNING *`,
      [state, thread_id]
    );

    return this.mapThread(result.rows[0]);
  }

  // -------------------------------------------------------------------------
  // Commitment Operations
  // -------------------------------------------------------------------------

  async addCommitment(
    input: CreateCommitmentInput,
    tags: GovernanceTags
  ): Promise<Commitment> {
    this.validateTags(tags);

    // Validate thread access
    const thread = await this.getThread(input.thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${input.thread_id}`);
    }

    const result = await this.pool.query(
      `INSERT INTO commitments (thread_id, next_action, status, due_at, blockers)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.thread_id,
        input.next_action,
        input.status,
        input.due_at || null,
        input.blockers || [],
      ]
    );

    return this.mapCommitment(result.rows[0]);
  }

  async getCommitments(thread_id: string, tags: GovernanceTags): Promise<Commitment[]> {
    this.validateTags(tags);

    // Validate thread access
    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const result = await this.pool.query(
      'SELECT * FROM commitments WHERE thread_id = $1 ORDER BY created_at DESC',
      [thread_id]
    );

    return result.rows.map(this.mapCommitment);
  }

  async updateCommitmentStatus(
    commitment_id: string,
    status: string,
    tags: GovernanceTags
  ): Promise<Commitment> {
    this.validateTags(tags);

    // Get commitment to validate access
    const existing = await this.pool.query(
      'SELECT * FROM commitments WHERE commitment_id = $1',
      [commitment_id]
    );
    if (existing.rows.length === 0) {
      throw new Error(`Commitment not found: ${commitment_id}`);
    }

    // Validate thread access
    await this.getThread(existing.rows[0].thread_id, tags);

    const result = await this.pool.query(
      `UPDATE commitments SET status = $1, updated_at = NOW()
       WHERE commitment_id = $2
       RETURNING *`,
      [status, commitment_id]
    );

    return this.mapCommitment(result.rows[0]);
  }

  // -------------------------------------------------------------------------
  // Event Operations
  // -------------------------------------------------------------------------

  async logEvent(input: LogEventInput, tags: GovernanceTags): Promise<Event> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);

    const result = await this.pool.query(
      `INSERT INTO events (namespace_id, thread_id, event_type, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.namespace_id, input.thread_id || null, input.event_type, input.payload]
    );

    return this.mapEvent(result.rows[0]);
  }

  async getEvents(
    namespace_id: string,
    filters: EventFilters,
    tags: GovernanceTags
  ): Promise<Event[]> {
    this.validateTags(tags);
    this.validateNamespaceAccess(namespace_id, tags);

    if (!namespace_id) {
      throw new Error('namespace_id is required for getEvents');
    }

    let query = 'SELECT * FROM events WHERE namespace_id = $1';
    const params: unknown[] = [namespace_id];
    let paramIndex = 2;

    if (filters.thread_id) {
      query += ` AND thread_id = $${paramIndex++}`;
      params.push(filters.thread_id);
    }
    if (filters.event_type) {
      query += ` AND event_type = $${paramIndex++}`;
      params.push(filters.event_type);
    }
    if (filters.since) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.since);
    }
    if (filters.until) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.until);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapEvent);
  }

  // -------------------------------------------------------------------------
  // Summary Operations
  // -------------------------------------------------------------------------

  async updateThreadSummary(
    thread_id: string,
    summary: string,
    tags: GovernanceTags
  ): Promise<ThreadSummary> {
    this.validateTags(tags);

    // Validate thread access
    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const result = await this.pool.query(
      `INSERT INTO thread_summaries (thread_id, summary, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (thread_id) DO UPDATE SET summary = $2, updated_at = NOW()
       RETURNING *`,
      [thread_id, summary]
    );

    return this.mapThreadSummary(result.rows[0]);
  }

  async getThreadSummary(
    thread_id: string,
    tags: GovernanceTags
  ): Promise<ThreadSummary | null> {
    this.validateTags(tags);

    // Validate thread access
    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const result = await this.pool.query(
      'SELECT * FROM thread_summaries WHERE thread_id = $1',
      [thread_id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapThreadSummary(result.rows[0]);
  }

  // -------------------------------------------------------------------------
  // Embedding Operations
  // -------------------------------------------------------------------------

  async addEmbedding(
    input: CreateEmbeddingInput,
    tags: GovernanceTags
  ): Promise<Embedding> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);

    const result = await this.pool.query(
      `INSERT INTO embeddings (namespace_id, thread_id, content, vector)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.namespace_id,
        input.thread_id || null,
        input.content,
        `[${input.vector.join(',')}]`,
      ]
    );

    return this.mapEmbedding(result.rows[0]);
  }

  async queryByEmbedding(
    namespace_id: string,
    vector: number[],
    limit: number,
    tags: GovernanceTags
  ): Promise<EmbeddingQueryResult[]> {
    this.validateTags(tags);
    this.validateNamespaceAccess(namespace_id, tags);

    if (!namespace_id) {
      throw new Error('namespace_id is required for queryByEmbedding');
    }

    const result = await this.pool.query(
      `SELECT *, 1 - (vector <=> $2) as similarity
       FROM embeddings
       WHERE namespace_id = $1
       ORDER BY vector <=> $2
       LIMIT $3`,
      [namespace_id, `[${vector.join(',')}]`, limit]
    );

    return result.rows.map((row) => ({
      embedding: this.mapEmbedding(row),
      similarity: parseFloat(row.similarity),
    }));
  }

  // -------------------------------------------------------------------------
  // Document Operations
  // -------------------------------------------------------------------------

  async createDocument(
    input: CreateDocumentInput,
    tags: GovernanceTags
  ): Promise<Document> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);

    const result = await this.pool.query(
      `INSERT INTO documents (namespace_id, thread_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        input.namespace_id,
        input.thread_id || null,
        input.content,
        input.metadata || {},
      ]
    );

    return this.mapDocument(result.rows[0]);
  }

  async getDocument(
    document_id: string,
    tags: GovernanceTags
  ): Promise<Document | null> {
    this.validateTags(tags);

    const result = await this.pool.query(
      'SELECT * FROM documents WHERE document_id = $1',
      [document_id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const doc = this.mapDocument(result.rows[0]);
    this.validateNamespaceAccess(doc.namespace_id, tags);
    return doc;
  }

  async getDocuments(
    namespace_id: string,
    tags: GovernanceTags
  ): Promise<Document[]> {
    this.validateTags(tags);
    this.validateNamespaceAccess(namespace_id, tags);

    const result = await this.pool.query(
      'SELECT * FROM documents WHERE namespace_id = $1 ORDER BY created_at DESC',
      [namespace_id]
    );

    return result.rows.map(this.mapDocument);
  }

  // -------------------------------------------------------------------------
  // Message Operations
  // -------------------------------------------------------------------------

  async addMessage(
    input: CreateMessageInput,
    tags: GovernanceTags
  ): Promise<Message> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);

    // Validate thread access
    const thread = await this.getThread(input.thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${input.thread_id}`);
    }

    const result = await this.pool.query(
      `INSERT INTO messages (namespace_id, thread_id, content, role, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.namespace_id,
        input.thread_id,
        input.content,
        input.role,
        input.metadata || {},
      ]
    );

    return this.mapMessage(result.rows[0]);
  }

  async getMessages(thread_id: string, tags: GovernanceTags): Promise<Message[]> {
    this.validateTags(tags);

    // Validate thread access
    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const result = await this.pool.query(
      'SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC',
      [thread_id]
    );

    return result.rows.map(this.mapMessage);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private validateTags(tags: GovernanceTags): void {
    if (!tags.principal_id) {
      throw new Error('principal_id is required in governance tags');
    }
    if (!tags.oi_id) {
      throw new Error('oi_id is required in governance tags');
    }
    if (!tags.purpose) {
      throw new Error('purpose is required in governance tags');
    }
  }

  private validateNamespaceAccess(namespace_id: string, tags: GovernanceTags): void {
    // Enforce namespace boundaries - oi_id must match namespace
    if (tags.oi_id !== namespace_id && tags.oi_id !== '*') {
      throw new Error(
        `Namespace access denied: oi_id ${tags.oi_id} cannot access namespace ${namespace_id}`
      );
    }
  }

  private mapThread(row: any): Thread {
    return {
      thread_id: row.thread_id,
      namespace_id: row.namespace_id,
      scope: row.scope,
      priority: row.priority,
      state: row.state,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapCommitment(row: any): Commitment {
    return {
      commitment_id: row.commitment_id,
      thread_id: row.thread_id,
      status: row.status,
      due_at: row.due_at ? new Date(row.due_at) : null,
      next_action: row.next_action,
      blockers: row.blockers || [],
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapEvent(row: any): Event {
    return {
      event_id: row.event_id,
      namespace_id: row.namespace_id,
      thread_id: row.thread_id,
      event_type: row.event_type,
      payload: row.payload,
      created_at: new Date(row.created_at),
    };
  }

  private mapThreadSummary(row: any): ThreadSummary {
    return {
      thread_id: row.thread_id,
      summary: row.summary,
      updated_at: new Date(row.updated_at),
    };
  }

  private mapEmbedding(row: any): Embedding {
    return {
      embedding_id: row.embedding_id,
      namespace_id: row.namespace_id,
      thread_id: row.thread_id,
      content: row.content,
      vector: row.vector ? this.parseVector(row.vector) : [],
      created_at: new Date(row.created_at),
    };
  }

  private mapDocument(row: any): Document {
    return {
      document_id: row.document_id,
      namespace_id: row.namespace_id,
      thread_id: row.thread_id,
      content: row.content,
      metadata: row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapMessage(row: any): Message {
    return {
      message_id: row.message_id,
      namespace_id: row.namespace_id,
      thread_id: row.thread_id,
      content: row.content,
      role: row.role,
      metadata: row.metadata || {},
      created_at: new Date(row.created_at),
    };
  }

  private parseVector(vector: string | number[]): number[] {
    if (Array.isArray(vector)) {
      return vector;
    }
    // Parse PostgreSQL vector format "[1,2,3]"
    return JSON.parse(vector.replace(/^\[/, '[').replace(/\]$/, ']'));
  }
}
