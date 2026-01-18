-- WHY: Initial database schema for Mathison v2

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Namespaces table
CREATE TABLE namespaces (
  namespace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Threads table
CREATE TABLE threads (
  thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  priority INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'waiting', 'blocked', 'done')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (namespace_id) REFERENCES namespaces(namespace_id)
);

CREATE INDEX idx_threads_namespace ON threads(namespace_id);
CREATE INDEX idx_threads_state ON threads(state);
CREATE INDEX idx_threads_priority ON threads(priority DESC);
CREATE INDEX idx_threads_updated_at ON threads(updated_at ASC);

-- Commitments table
CREATE TABLE commitments (
  commitment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  status TEXT NOT NULL,
  due_at TIMESTAMP,
  next_action TEXT NOT NULL,
  blockers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE INDEX idx_commitments_thread ON commitments(thread_id);

-- Events table (append-only)
CREATE TABLE events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id TEXT NOT NULL,
  thread_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (namespace_id) REFERENCES namespaces(namespace_id),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE INDEX idx_events_namespace ON events(namespace_id);
CREATE INDEX idx_events_thread ON events(thread_id);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_type ON events(event_type);

-- Thread summaries (current)
CREATE TABLE thread_summaries_current (
  thread_id UUID PRIMARY KEY,
  summary TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

-- Thread summaries (snapshots)
CREATE TABLE thread_summaries_snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE INDEX idx_snapshots_thread ON thread_summaries_snapshots(thread_id);

-- Embeddings table (pgvector)
CREATE TABLE embeddings (
  embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id TEXT NOT NULL,
  thread_id UUID,
  content TEXT NOT NULL,
  vector vector(1536),  -- OpenAI ada-002 dimension
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (namespace_id) REFERENCES namespaces(namespace_id),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE INDEX idx_embeddings_namespace ON embeddings(namespace_id);
CREATE INDEX idx_embeddings_thread ON embeddings(thread_id);
-- TODO: Create HNSW index for vector search
-- CREATE INDEX idx_embeddings_vector ON embeddings USING hnsw (vector vector_cosine_ops);

-- Artifacts metadata table
CREATE TABLE artifacts_metadata (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id TEXT NOT NULL,
  thread_id UUID,
  content_hash TEXT NOT NULL,
  storage_uri TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY (namespace_id) REFERENCES namespaces(namespace_id),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE INDEX idx_artifacts_namespace ON artifacts_metadata(namespace_id);
CREATE INDEX idx_artifacts_thread ON artifacts_metadata(thread_id);
CREATE INDEX idx_artifacts_hash ON artifacts_metadata(content_hash);

-- Insert default namespace
INSERT INTO namespaces (namespace_id, name) VALUES ('default', 'Default Namespace');
