/**
 * Mathison v2.1 Memory Types
 *
 * Types for the unified memory store interface.
 * All memory operations MUST be namespaced and carry governance tags.
 *
 * INVARIANT: No direct DB calls - all operations go through MemoryStore interface.
 * INVARIANT: Namespace boundaries enforced at query layer.
 */

// ============================================================================
// Governance Tags (required for all operations)
// ============================================================================

/**
 * Governance tags required for all memory operations.
 * These ensure traceability and namespace enforcement.
 */
export interface GovernanceTags {
  /** Principal making the request */
  principal_id: string;
  /** OI namespace for this operation */
  oi_id: string;
  /** Purpose of the operation */
  purpose: string;
  /** Origin/taint labels */
  origin_labels: string[];
}

// ============================================================================
// Core Data Types
// ============================================================================

/**
 * Thread - unit of work in an OI
 */
export interface Thread {
  thread_id: string;
  namespace_id: string;
  scope: string;
  priority: number;
  state: ThreadState;
  created_at: Date;
  updated_at: Date;
}

export type ThreadState = 'open' | 'waiting' | 'blocked' | 'done';

/**
 * Input for creating a thread
 */
export interface CreateThreadInput {
  namespace_id: string;
  scope: string;
  priority: number;
}

/**
 * Filters for querying threads
 */
export interface ThreadFilters {
  state?: ThreadState;
  priority_min?: number;
  priority_max?: number;
  scope?: string;
}

// ============================================================================
// Commitment Types
// ============================================================================

/**
 * Commitment - tracked obligation within a thread
 */
export interface Commitment {
  commitment_id: string;
  thread_id: string;
  status: string;
  due_at: Date | null;
  next_action: string;
  blockers: string[];
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a commitment
 */
export interface CreateCommitmentInput {
  thread_id: string;
  next_action: string;
  status: string;
  due_at?: Date;
  blockers?: string[];
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event - append-only log entry
 */
export interface Event {
  event_id: string;
  namespace_id: string;
  thread_id: string | null;
  event_type: string;
  payload: unknown;
  created_at: Date;
}

/**
 * Input for logging an event
 */
export interface LogEventInput {
  namespace_id: string;
  thread_id?: string;
  event_type: string;
  payload: unknown;
}

/**
 * Filters for querying events
 */
export interface EventFilters {
  thread_id?: string;
  event_type?: string;
  since?: Date;
  until?: Date;
}

// ============================================================================
// Summary Types
// ============================================================================

/**
 * Thread summary - working brief for a thread
 */
export interface ThreadSummary {
  thread_id: string;
  summary: string;
  updated_at: Date;
}

// ============================================================================
// Embedding Types
// ============================================================================

/**
 * Embedding - vector for semantic recall
 */
export interface Embedding {
  embedding_id: string;
  namespace_id: string;
  thread_id: string | null;
  content: string;
  vector: number[];
  created_at: Date;
}

/**
 * Input for creating an embedding
 */
export interface CreateEmbeddingInput {
  namespace_id: string;
  thread_id?: string;
  content: string;
  vector: number[];
}

/**
 * Result from embedding query
 */
export interface EmbeddingQueryResult {
  embedding: Embedding;
  similarity: number;
}

// ============================================================================
// Document Types
// ============================================================================

/**
 * Document - stored content with metadata
 */
export interface Document {
  document_id: string;
  namespace_id: string;
  thread_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Input for creating a document
 */
export interface CreateDocumentInput {
  namespace_id: string;
  thread_id?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message - communication within a thread
 */
export interface Message {
  message_id: string;
  namespace_id: string;
  thread_id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  metadata: Record<string, unknown>;
  created_at: Date;
}

/**
 * Input for creating a message
 */
export interface CreateMessageInput {
  namespace_id: string;
  thread_id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Memory Store Interface
// ============================================================================

/**
 * Unified memory store interface.
 *
 * INVARIANT: All implementations must enforce namespace boundaries.
 * INVARIANT: All operations require GovernanceTags.
 */
export interface MemoryStore {
  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  /** Initialize the store (connect, run migrations) */
  initialize(): Promise<void>;

  /** Close the store connection */
  close(): Promise<void>;

  /** Check if store is healthy */
  healthCheck(): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Thread Operations
  // -------------------------------------------------------------------------

  /** Create a new thread */
  createThread(input: CreateThreadInput, tags: GovernanceTags): Promise<Thread>;

  /** Get threads for a namespace */
  getThreads(
    namespace_id: string,
    filters: ThreadFilters,
    tags: GovernanceTags
  ): Promise<Thread[]>;

  /** Get a specific thread */
  getThread(thread_id: string, tags: GovernanceTags): Promise<Thread | null>;

  /** Update thread state */
  updateThreadState(
    thread_id: string,
    state: ThreadState,
    tags: GovernanceTags
  ): Promise<Thread>;

  // -------------------------------------------------------------------------
  // Commitment Operations
  // -------------------------------------------------------------------------

  /** Add a commitment to a thread */
  addCommitment(input: CreateCommitmentInput, tags: GovernanceTags): Promise<Commitment>;

  /** Get commitments for a thread */
  getCommitments(thread_id: string, tags: GovernanceTags): Promise<Commitment[]>;

  /** Update commitment status */
  updateCommitmentStatus(
    commitment_id: string,
    status: string,
    tags: GovernanceTags
  ): Promise<Commitment>;

  // -------------------------------------------------------------------------
  // Event Operations (append-only)
  // -------------------------------------------------------------------------

  /** Log an event */
  logEvent(input: LogEventInput, tags: GovernanceTags): Promise<Event>;

  /** Get events for a namespace */
  getEvents(
    namespace_id: string,
    filters: EventFilters,
    tags: GovernanceTags
  ): Promise<Event[]>;

  // -------------------------------------------------------------------------
  // Summary Operations
  // -------------------------------------------------------------------------

  /** Update thread summary */
  updateThreadSummary(
    thread_id: string,
    summary: string,
    tags: GovernanceTags
  ): Promise<ThreadSummary>;

  /** Get thread summary */
  getThreadSummary(thread_id: string, tags: GovernanceTags): Promise<ThreadSummary | null>;

  // -------------------------------------------------------------------------
  // Embedding Operations
  // -------------------------------------------------------------------------

  /** Add an embedding */
  addEmbedding(input: CreateEmbeddingInput, tags: GovernanceTags): Promise<Embedding>;

  /** Query embeddings by vector similarity */
  queryByEmbedding(
    namespace_id: string,
    vector: number[],
    limit: number,
    tags: GovernanceTags
  ): Promise<EmbeddingQueryResult[]>;

  // -------------------------------------------------------------------------
  // Document Operations
  // -------------------------------------------------------------------------

  /** Create a document */
  createDocument(input: CreateDocumentInput, tags: GovernanceTags): Promise<Document>;

  /** Get document by ID */
  getDocument(document_id: string, tags: GovernanceTags): Promise<Document | null>;

  /** Get documents for a namespace */
  getDocuments(namespace_id: string, tags: GovernanceTags): Promise<Document[]>;

  // -------------------------------------------------------------------------
  // Message Operations
  // -------------------------------------------------------------------------

  /** Add a message to a thread */
  addMessage(input: CreateMessageInput, tags: GovernanceTags): Promise<Message>;

  /** Get messages for a thread */
  getMessages(thread_id: string, tags: GovernanceTags): Promise<Message[]>;
}

// ============================================================================
// Store Configuration
// ============================================================================

/**
 * PostgreSQL store configuration
 */
export interface PostgresStoreConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionString?: string;
}

/**
 * SQLite store configuration
 */
export interface SqliteStoreConfig {
  path: string;
  enableWal?: boolean;
}

/**
 * Memory store configuration (union)
 */
export type MemoryStoreConfig =
  | { type: 'postgres'; config: PostgresStoreConfig }
  | { type: 'sqlite'; config: SqliteStoreConfig };
