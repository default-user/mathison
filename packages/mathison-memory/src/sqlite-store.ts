/**
 * Mathison v2.1 SQLite Memory Store
 *
 * SQLite implementation of the MemoryStore interface for local/offline use.
 *
 * INVARIANT: All queries are parameterized (SQL injection safe).
 * INVARIANT: Namespace boundaries enforced at query layer.
 */

import Database from 'better-sqlite3';
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
  SqliteStoreConfig,
} from './types';

/**
 * SQLite implementation of MemoryStore.
 * Suitable for local development and offline use.
 * Note: Vector similarity search is basic (no HNSW index).
 */
export class SqliteMemoryStore implements MemoryStore {
  private db: Database.Database | null = null;
  private config: SqliteStoreConfig;
  private initialized: boolean = false;

  constructor(config: SqliteStoreConfig) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  async initialize(): Promise<void> {
    this.db = new Database(this.config.path);

    // Enable WAL mode for better concurrent performance
    if (this.config.enableWal !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    // Run migrations
    await this.runMigrations();
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.db) return false;
    try {
      const result = this.db.prepare('SELECT 1').get();
      return result !== undefined;
    } catch {
      return false;
    }
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  // -------------------------------------------------------------------------
  // Migrations
  // -------------------------------------------------------------------------

  private async runMigrations(): Promise<void> {
    const db = this.getDb();

    // Namespaces table
    db.exec(`
      CREATE TABLE IF NOT EXISTS namespaces (
        namespace_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Threads table
    db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        thread_id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        priority INTEGER NOT NULL CHECK (priority >= 0 AND priority <= 100),
        state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'waiting', 'blocked', 'done')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_threads_namespace ON threads(namespace_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_threads_state ON threads(state)');

    // Commitments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS commitments (
        commitment_id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES threads(thread_id),
        status TEXT NOT NULL,
        due_at TEXT,
        next_action TEXT NOT NULL,
        blockers TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_commitments_thread ON commitments(thread_id)');

    // Events table
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        thread_id TEXT REFERENCES threads(thread_id),
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_namespace ON events(namespace_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_events_thread ON events(thread_id)');

    // Thread summaries table
    db.exec(`
      CREATE TABLE IF NOT EXISTS thread_summaries (
        thread_id TEXT PRIMARY KEY REFERENCES threads(thread_id),
        summary TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Embeddings table (vectors stored as JSON)
    db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        embedding_id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        thread_id TEXT REFERENCES threads(thread_id),
        content TEXT NOT NULL,
        vector TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_embeddings_namespace ON embeddings(namespace_id)');

    // Documents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        thread_id TEXT REFERENCES threads(thread_id),
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_documents_namespace ON documents(namespace_id)');

    // Messages table
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        thread_id TEXT NOT NULL REFERENCES threads(thread_id),
        content TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_namespace ON messages(namespace_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)');

    // Insert default namespace
    db.prepare(`
      INSERT OR IGNORE INTO namespaces (namespace_id, name)
      VALUES (?, ?)
    `).run('default', 'Default Namespace');
  }

  // -------------------------------------------------------------------------
  // Thread Operations
  // -------------------------------------------------------------------------

  async createThread(input: CreateThreadInput, tags: GovernanceTags): Promise<Thread> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);

    const db = this.getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO threads (thread_id, namespace_id, scope, priority, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?)
    `).run(id, input.namespace_id, input.scope, input.priority, now, now);

    return {
      thread_id: id,
      namespace_id: input.namespace_id,
      scope: input.scope,
      priority: input.priority,
      state: 'open',
      created_at: new Date(now),
      updated_at: new Date(now),
    };
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

    const db = this.getDb();
    let query = 'SELECT * FROM threads WHERE namespace_id = ?';
    const params: unknown[] = [namespace_id];

    if (filters.state) {
      query += ' AND state = ?';
      params.push(filters.state);
    }
    if (filters.priority_min !== undefined) {
      query += ' AND priority >= ?';
      params.push(filters.priority_min);
    }
    if (filters.priority_max !== undefined) {
      query += ' AND priority <= ?';
      params.push(filters.priority_max);
    }
    if (filters.scope) {
      query += ' AND scope LIKE ?';
      params.push(`%${filters.scope}%`);
    }

    query += ' ORDER BY priority DESC, updated_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(this.mapThread);
  }

  async getThread(thread_id: string, tags: GovernanceTags): Promise<Thread | null> {
    this.validateTags(tags);

    const db = this.getDb();
    const row = db.prepare('SELECT * FROM threads WHERE thread_id = ?').get(thread_id) as any;

    if (!row) {
      return null;
    }

    const thread = this.mapThread(row);
    this.validateNamespaceAccess(thread.namespace_id, tags);
    return thread;
  }

  async updateThreadState(
    thread_id: string,
    state: ThreadState,
    tags: GovernanceTags
  ): Promise<Thread> {
    this.validateTags(tags);

    const existing = await this.getThread(thread_id, tags);
    if (!existing) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const db = this.getDb();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE threads SET state = ?, updated_at = ?
      WHERE thread_id = ?
    `).run(state, now, thread_id);

    return { ...existing, state, updated_at: new Date(now) };
  }

  // -------------------------------------------------------------------------
  // Commitment Operations
  // -------------------------------------------------------------------------

  async addCommitment(
    input: CreateCommitmentInput,
    tags: GovernanceTags
  ): Promise<Commitment> {
    this.validateTags(tags);

    const thread = await this.getThread(input.thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${input.thread_id}`);
    }

    const db = this.getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO commitments (commitment_id, thread_id, next_action, status, due_at, blockers, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.thread_id,
      input.next_action,
      input.status,
      input.due_at?.toISOString() || null,
      JSON.stringify(input.blockers || []),
      now,
      now
    );

    return {
      commitment_id: id,
      thread_id: input.thread_id,
      next_action: input.next_action,
      status: input.status,
      due_at: input.due_at || null,
      blockers: input.blockers || [],
      created_at: new Date(now),
      updated_at: new Date(now),
    };
  }

  async getCommitments(thread_id: string, tags: GovernanceTags): Promise<Commitment[]> {
    this.validateTags(tags);

    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const db = this.getDb();
    const rows = db.prepare(
      'SELECT * FROM commitments WHERE thread_id = ? ORDER BY created_at DESC'
    ).all(thread_id) as any[];

    return rows.map(this.mapCommitment);
  }

  async updateCommitmentStatus(
    commitment_id: string,
    status: string,
    tags: GovernanceTags
  ): Promise<Commitment> {
    this.validateTags(tags);

    const db = this.getDb();
    const existing = db.prepare(
      'SELECT * FROM commitments WHERE commitment_id = ?'
    ).get(commitment_id) as any;

    if (!existing) {
      throw new Error(`Commitment not found: ${commitment_id}`);
    }

    await this.getThread(existing.thread_id, tags);

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE commitments SET status = ?, updated_at = ?
      WHERE commitment_id = ?
    `).run(status, now, commitment_id);

    return { ...this.mapCommitment(existing), status, updated_at: new Date(now) };
  }

  // -------------------------------------------------------------------------
  // Event Operations
  // -------------------------------------------------------------------------

  async logEvent(input: LogEventInput, tags: GovernanceTags): Promise<Event> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);

    const db = this.getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO events (event_id, namespace_id, thread_id, event_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.namespace_id, input.thread_id || null, input.event_type, JSON.stringify(input.payload), now);

    return {
      event_id: id,
      namespace_id: input.namespace_id,
      thread_id: input.thread_id || null,
      event_type: input.event_type,
      payload: input.payload,
      created_at: new Date(now),
    };
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

    const db = this.getDb();
    let query = 'SELECT * FROM events WHERE namespace_id = ?';
    const params: unknown[] = [namespace_id];

    if (filters.thread_id) {
      query += ' AND thread_id = ?';
      params.push(filters.thread_id);
    }
    if (filters.event_type) {
      query += ' AND event_type = ?';
      params.push(filters.event_type);
    }
    if (filters.since) {
      query += ' AND created_at >= ?';
      params.push(filters.since.toISOString());
    }
    if (filters.until) {
      query += ' AND created_at <= ?';
      params.push(filters.until.toISOString());
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(this.mapEvent);
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

    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const db = this.getDb();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO thread_summaries (thread_id, summary, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT (thread_id) DO UPDATE SET summary = ?, updated_at = ?
    `).run(thread_id, summary, now, summary, now);

    return {
      thread_id,
      summary,
      updated_at: new Date(now),
    };
  }

  async getThreadSummary(
    thread_id: string,
    tags: GovernanceTags
  ): Promise<ThreadSummary | null> {
    this.validateTags(tags);

    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const db = this.getDb();
    const row = db.prepare(
      'SELECT * FROM thread_summaries WHERE thread_id = ?'
    ).get(thread_id) as any;

    if (!row) {
      return null;
    }

    return this.mapThreadSummary(row);
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

    const db = this.getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO embeddings (embedding_id, namespace_id, thread_id, content, vector, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.namespace_id, input.thread_id || null, input.content, JSON.stringify(input.vector), now);

    return {
      embedding_id: id,
      namespace_id: input.namespace_id,
      thread_id: input.thread_id || null,
      content: input.content,
      vector: input.vector,
      created_at: new Date(now),
    };
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

    const db = this.getDb();

    // Get all embeddings for namespace (SQLite doesn't have native vector support)
    const rows = db.prepare(
      'SELECT * FROM embeddings WHERE namespace_id = ?'
    ).all(namespace_id) as any[];

    // Calculate cosine similarity in JavaScript
    const results: EmbeddingQueryResult[] = rows
      .map((row) => {
        const embedding = this.mapEmbedding(row);
        const similarity = this.cosineSimilarity(vector, embedding.vector);
        return { embedding, similarity };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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

    const db = this.getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO documents (document_id, namespace_id, thread_id, content, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.namespace_id,
      input.thread_id || null,
      input.content,
      JSON.stringify(input.metadata || {}),
      now,
      now
    );

    return {
      document_id: id,
      namespace_id: input.namespace_id,
      thread_id: input.thread_id || null,
      content: input.content,
      metadata: input.metadata || {},
      created_at: new Date(now),
      updated_at: new Date(now),
    };
  }

  async getDocument(
    document_id: string,
    tags: GovernanceTags
  ): Promise<Document | null> {
    this.validateTags(tags);

    const db = this.getDb();
    const row = db.prepare('SELECT * FROM documents WHERE document_id = ?').get(document_id) as any;

    if (!row) {
      return null;
    }

    const doc = this.mapDocument(row);
    this.validateNamespaceAccess(doc.namespace_id, tags);
    return doc;
  }

  async getDocuments(
    namespace_id: string,
    tags: GovernanceTags
  ): Promise<Document[]> {
    this.validateTags(tags);
    this.validateNamespaceAccess(namespace_id, tags);

    const db = this.getDb();
    const rows = db.prepare(
      'SELECT * FROM documents WHERE namespace_id = ? ORDER BY created_at DESC'
    ).all(namespace_id) as any[];

    return rows.map(this.mapDocument);
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

    const thread = await this.getThread(input.thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${input.thread_id}`);
    }

    const db = this.getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (message_id, namespace_id, thread_id, content, role, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.namespace_id,
      input.thread_id,
      input.content,
      input.role,
      JSON.stringify(input.metadata || {}),
      now
    );

    return {
      message_id: id,
      namespace_id: input.namespace_id,
      thread_id: input.thread_id,
      content: input.content,
      role: input.role,
      metadata: input.metadata || {},
      created_at: new Date(now),
    };
  }

  async getMessages(thread_id: string, tags: GovernanceTags): Promise<Message[]> {
    this.validateTags(tags);

    const thread = await this.getThread(thread_id, tags);
    if (!thread) {
      throw new Error(`Thread not found: ${thread_id}`);
    }

    const db = this.getDb();
    const rows = db.prepare(
      'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC'
    ).all(thread_id) as any[];

    return rows.map(this.mapMessage);
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
      blockers: JSON.parse(row.blockers || '[]'),
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
      payload: JSON.parse(row.payload),
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
      vector: JSON.parse(row.vector),
      created_at: new Date(row.created_at),
    };
  }

  private mapDocument(row: any): Document {
    return {
      document_id: row.document_id,
      namespace_id: row.namespace_id,
      thread_id: row.thread_id,
      content: row.content,
      metadata: JSON.parse(row.metadata || '{}'),
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
      metadata: JSON.parse(row.metadata || '{}'),
      created_at: new Date(row.created_at),
    };
  }
}
