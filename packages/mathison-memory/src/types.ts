// WHY: Explicit types for memory model ensure type safety and clear invariants

export type ThreadState = 'open' | 'waiting' | 'blocked' | 'done';

export interface Thread {
  thread_id: string;
  namespace_id: string;
  scope: string;
  priority: number;
  state: ThreadState;
  created_at: Date;
  updated_at: Date;
}

export interface CreateThreadInput {
  namespace_id: string;
  scope: string;
  priority: number;
}

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

export interface CreateCommitmentInput {
  next_action: string;
  status: string;
  due_at?: Date;
  blockers?: string[];
}

export interface Event {
  event_id: string;
  namespace_id: string;
  thread_id: string | null;
  event_type: string;
  payload: any;
  created_at: Date;
}

export interface CreateEventInput {
  namespace_id: string;
  thread_id?: string;
  event_type: string;
  payload: any;
}

export interface ThreadSummary {
  thread_id: string;
  summary: string;
  updated_at: Date;
}

export interface Embedding {
  embedding_id: string;
  namespace_id: string;
  thread_id: string | null;
  content: string;
  vector: number[];
  created_at: Date;
}

export interface SearchResult {
  embedding_id: string;
  content: string;
  distance: number;
}

// WHY: MemoryStore interface allows swapping implementations
export interface MemoryStore {
  // Threads
  createThread(input: CreateThreadInput): Promise<Thread>;
  getThreads(namespace_id: string, filters?: any): Promise<Thread[]>;
  getThread(thread_id: string): Promise<Thread | null>;
  updateThreadState(thread_id: string, state: ThreadState): Promise<void>;

  // Commitments
  addCommitment(thread_id: string, input: CreateCommitmentInput): Promise<Commitment>;
  getCommitments(thread_id: string): Promise<Commitment[]>;

  // Events
  logEvent(input: CreateEventInput): Promise<Event>;
  getEvents(namespace_id: string, filters?: any): Promise<Event[]>;

  // Embeddings
  addEmbedding(namespace_id: string, thread_id: string | null, content: string, vector: number[]): Promise<Embedding>;
  queryByEmbedding(namespace_id: string, vector: number[], limit: number): Promise<SearchResult[]>;

  // Summaries
  updateThreadSummary(thread_id: string, summary: string): Promise<void>;
  getThreadSummary(thread_id: string): Promise<ThreadSummary | null>;
}
