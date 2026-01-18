# @mathison/memory

Thread management, event log, commitments, and semantic recall for Mathison v2.

## Purpose

WHY: Partitioned, append-only event log provides auditability and enables reconstruction without cross-namespace leakage.

Responsibilities:
- Manage threads and commitments
- Store append-only event log
- Provide semantic recall via pgvector embeddings
- Enforce namespace isolation at DB query level

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```typescript
import { 
  createThread, 
  getThreads, 
  addCommitment, 
  logEvent, 
  queryByEmbedding 
} from '@mathison/memory';

// Create thread
const thread = await createThread({
  namespace_id: 'ns-1',
  scope: 'user-request',
  priority: 1,
});

// Add commitment
const commitment = await addCommitment(thread.thread_id, {
  next_action: 'Complete task X',
  status: 'pending',
});

// Log event
await logEvent({
  namespace_id: 'ns-1',
  thread_id: thread.thread_id,
  event_type: 'message_received',
  payload: { message: 'Hello' },
});

// Query by embedding
const results = await queryByEmbedding('ns-1', embedding, 10);
```

## How to Run

```bash
# Run tests (requires Postgres)
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## WHY

**Why namespace_id required in all queries?**
Prevents accidental cross-namespace leakage. Enforcement at DB level is harder to bypass than application level.

**Why append-only event log?**
Auditability, debugging, compliance. Immutable record enables reconstruction and analysis.

**Why pgvector?**
Single database for structured + vector data reduces operational complexity vs separate vector DB.

## See Also

- [Architecture](../../docs/ARCHITECTURE.md)
- [OI Definition](../../docs/OI_DEFINITION.md)
