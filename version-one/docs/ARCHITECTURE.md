# Mathison v2 Architecture

## System Overview

Mathison is composed of specialized organs, each with clear responsibilities and interfaces.

```
┌─────────────────────────────────────────────────┐
│              HTTP/gRPC Server                   │
│         (CIF Ingress / CDI Gates)              │
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌───▼────────┐ ┌──▼──────────┐
│ Governance   │ │  Memory    │ │  Mesh       │
│              │ │            │ │             │
│ - Authority  │ │ - Threads  │ │ - Scheduler │
│ - CIF/CDI    │ │ - Events   │ │             │
│ - Policies   │ │ - Recall   │ │             │
└──────────────┘ └────────────┘ └─────────────┘
                      │
                ┌─────▼──────┐
                │ Artifacts  │
                │            │
                │ - Blobs    │
                │ - Metadata │
                └────────────┘
                      │
              ┌───────▼────────┐
              │   PostgreSQL   │
              │  + pgvector    │
              └────────────────┘
```

## Organs

### Governance (packages/mathison-governance)

WHY: Explicit authority prevents privilege escalation and ensures all actions are traceable to principals.

Responsibilities:
- Load and validate authority configuration
- Enforce CIF (input validation)
- Enforce CDI (decision gating)
- Track capability tokens

Interfaces:
- `loadAuthorityConfig(path: string): AuthorityConfig`
- `getCurrentPrincipal(): Principal`
- `checkCDI(action: string, context: any): CDIDecision`
- `validateCIF(input: any, schema: Schema): ValidatedInput`

Invariants:
- Config must be valid at boot or system fails
- All governed actions pass through CDI
- CIF validates all external input

### Memory (packages/mathison-memory)

WHY: Partitioned, append-only event log provides auditability and enables reconstruction without risking cross-namespace leakage.

Responsibilities:
- Manage threads and commitments
- Store append-only event log
- Provide semantic recall via embeddings
- Enforce namespace isolation

Interfaces:
- `createThread(namespace_id, scope, priority): Thread`
- `getThreads(namespace_id, filters): Thread[]`
- `addCommitment(thread_id, commitment): Commitment`
- `logEvent(event): void`
- `queryByEmbedding(namespace_id, vector, limit): SearchResult[]`

Invariants:
- All queries require namespace_id
- Events are append-only
- Cross-namespace queries are denied

### Artifacts (packages/mathison-artifacts)

WHY: Separating large blobs from structured data keeps the database fast and allows flexible storage backends.

Responsibilities:
- Store large binary objects
- Track artifact metadata in Postgres
- Content-address artifacts by hash

Interfaces:
- `putArtifact(namespace_id, thread_id?, data): ArtifactMetadata`
- `getArtifactMetadata(artifact_id): ArtifactMetadata`
- `listArtifactsByThread(thread_id): ArtifactMetadata[]`

Storage:
- Default: filesystem
- Production: S3-compatible (TODO)

Invariants:
- Artifacts are tagged with namespace_id
- Metadata stored in Postgres, blobs stored externally
- Content hash verified on retrieval

### Mesh (packages/mathison-mesh)

WHY: Explicit scheduler with logged decisions makes thread selection auditable and debuggable.

Responsibilities:
- Select next runnable thread
- Log scheduler decisions

Interfaces:
- `selectNextThread(namespace_id?): Thread | null`

Algorithm:
1. Filter to runnable (state = open, not blocked)
2. Sort by priority descending, then updated_at ascending
3. Return top or null

Invariants:
- Decisions logged to event log
- No direct state modification
- Respects namespace boundaries if provided

### Server (packages/mathison-server)

WHY: Centralized API layer with CIF/CDI middleware ensures all requests are validated and governed.

Responsibilities:
- Expose HTTP API
- Apply CIF ingress validation
- Apply CDI decision gates
- Structured logging with request_id

Endpoints:
- `GET /health` - Health check
- `POST /threads` - Create thread
- `GET /threads` - List threads
- `POST /threads/:id/commitments` - Add commitment
- `GET /threads/:id/commitments` - List commitments
- `POST /threads/:id/messages` - Store message as event
- `POST /threads/:id/reflect` - Trigger reflection job

Middleware stack (per request):
1. Request ID generation
2. CIF validation
3. CDI pre-action check
4. Handler
5. CDI post-action check
6. CIF egress redaction
7. Structured logging

Invariants:
- All endpoints pass through CIF/CDI
- All requests logged with request_id
- Errors logged with full context

## Data Flow

### Inbound Message

```
Client
  → HTTP POST /threads/:id/messages
  → CIF validation (schema, sanitize)
  → CDI pre-check (allow/deny/confirm)
  → Store event in event log
  → CDI post-check (verify no leakage)
  → Response
```

### Thread Scheduling

```
Scheduler.selectNextThread()
  → Query runnable threads in namespace
  → Sort by priority, updated_at
  → Log scheduler decision as event
  → Return thread or null
```

### Semantic Recall

```
Client
  → Query with text
  → Convert to embedding (external call)
  → Query embeddings table with namespace_id
  → Filter results by namespace
  → Return matches
```

## Storage Schema

### Tables

- **namespaces**: namespace registry
- **threads**: thread state and metadata
- **commitments**: commitment ledger
- **events**: append-only event log
- **thread_summaries_current**: current working briefs
- **thread_summaries_snapshots**: historical snapshots
- **embeddings**: vector store for semantic recall
- **artifacts_metadata**: artifact registry

See `packages/mathison-server/src/migrations/` for schema definitions.

## WHY

See [WHY.md](./WHY.md) for design rationale.
