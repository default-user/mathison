# Mathison v2.2 Architecture

## Overview

Mathison v2.2 implements a governed Organized Intelligence (OI) system with strict invariants:

1. **Single Pipeline**: All requests flow through one governed pipeline
2. **Fail-Closed**: Missing/invalid governance material = deny
3. **Namespace Isolation**: Per-OI boundaries with no hive mind
4. **Capability-Gated Adapters**: Model/tool calls require tokens
5. **Model Bus (v2.2)**: Governed handler is the ONLY path to vendor AI APIs

## Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTRYPOINTS                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                    │
│  │   HTTP   │  │   gRPC   │  │   CLI    │  │  Worker  │                    │
│  │ /api/v2.1│  │ service  │  │ commands │  │   jobs   │                    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                    │
│       │             │             │             │                           │
│       └─────────────┴─────────────┴─────────────┘                           │
│                              │                                               │
│                              ▼                                               │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED GOVERNED PIPELINE                                │
│                                                                             │
│  ┌─────────────────┐                                                       │
│  │ 1. Context      │  Extract: principal_id, oi_id, intent, capabilities   │
│  │    Normalization│  Validate: trace_id, origin labels, metadata          │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │ 2. CIF Ingress  │  Validate: schema, size limits, taint rules           │
│  │    Validation   │  Check: payload structure, string lengths             │
│  └────────┬────────┘  Detect: XSS, SQL injection patterns                  │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │ 3. CDI Action   │  Check: capsule status, degradation level             │
│  │    Check        │  Verify: permissions, cross-namespace rules           │
│  └────────┬────────┘  Issue: capability tokens for allowed ops             │
│           │                                                                 │
│           ▼  (only if allowed)                                             │
│  ┌─────────────────┐                                                       │
│  │ 4. Handler      │  Execute: registered handler with capability tokens   │
│  │    Execution    │  Access: memory store, adapters (via gateway)         │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │ 5. CDI Output   │  Validate: token expiry, cross-namespace leakage      │
│  │    Check        │  Apply: redaction rules, content filtering            │
│  └────────┬────────┘                                                       │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐                                                       │
│  │ 6. CIF Egress   │  Package: response with audit metadata                │
│  │    Validation   │  Validate: output size, format                        │
│  └────────┬────────┘                                                       │
│           │                                                                 │
└───────────┼─────────────────────────────────────────────────────────────────┘
            │
            ▼
     Response to Client

```

## Package Structure

### @mathison/pipeline

The core pipeline package provides:

- `PipelineExecutor`: Executes requests through the governed stages
- `HandlerRegistry`: Registers handlers for intents (no direct calls)
- `PipelineRouter`: HTTP integration that enforces pipeline
- `CliPipelineExecutor`: CLI integration
- `WorkerPipelineExecutor`: Worker/job integration

### @mathison/governance

Governance management:

- `GovernanceCapsuleLoader`: Loads and verifies signed capsules
- `GovernanceProviderImpl`: Implements CIF/CDI for pipeline
- `CdiActionChecker`: Checks action permissions
- `CdiOutputChecker`: Validates output, applies redactions
- Degrade ladder: full → partial → none

### @mathison/memory

Memory store interface:

- `MemoryStore`: Unified interface for all operations
- `PostgresMemoryStore`: PostgreSQL + pgvector implementation
- `SqliteMemoryStore`: SQLite implementation for local/offline
- All operations require `GovernanceTags`

### @mathison/adapters

Adapter conformance:

- `AdapterGateway`: Capability-gated adapter access
- `ModelAdapter`: Interface for model providers
- `ToolAdapter`: Interface for tool providers
- Conformance tests to enforce contract

### @mathison/model-bus (v2.2)

Governed model invocation:

- `ModelRouter`: Routes requests to adapters with capability enforcement
- `OpenAIAdapter`: OpenAI Chat Completions API
- `AnthropicAdapter`: Anthropic Messages API
- `LocalAdapter`: Mock adapter for testing
- Single HTTP client for all vendor calls (no SDK imports)
- Provenance logging for every invocation

**INVARIANT**: No vendor SDK imports or API calls outside this package. See [No-Bypass Enforcement](specs/v2.2-no-bypass-enforcement.md).

## Data Model

### Threads

Unit of work with state machine:

```
open → waiting → blocked → done
       ↑______|__________|
```

### Commitments

Tracked obligations within threads:

- `next_action`: What needs to happen
- `status`: Current state
- `due_at`: Optional deadline
- `blockers`: Dependencies

### Events

Append-only log for auditability:

- `event_type`: Classification
- `payload`: Event data (JSON)
- `namespace_id`: Partition key

### Embeddings

Vector storage for semantic recall:

- 1536-dimensional vectors (OpenAI ada-002 compatible)
- Namespace-scoped queries
- Cosine similarity search

## Security Model

### Capability Tokens

Short-lived tokens issued by CDI:

```typescript
interface CapabilityToken {
  token_id: string;
  capability: string;       // What this token authorizes
  oi_id: string;           // Namespace scope
  principal_id: string;    // Who this was issued to
  expires_at: Date;        // Expiration (typically 5 min)
  constraints: object;     // Usage constraints
}
```

### Namespace Isolation

All queries enforce namespace boundaries:

```typescript
// Every operation requires tags
interface GovernanceTags {
  principal_id: string;    // Who is making the request
  oi_id: string;          // OI namespace (must match query namespace)
  purpose: string;        // Why this operation is happening
  origin_labels: string[]; // Taint labels
}
```

### Degrade Ladder

When capsule is unavailable/stale:

| Degradation | Read-only | Low-risk | Medium-risk | High-risk |
|-------------|-----------|----------|-------------|-----------|
| None        | ✓         | ✓        | ✓           | ✓         |
| Partial     | ✓         | ✓        | ✗           | ✗         |
| Full        | ✓         | ✗        | ✗           | ✗         |

## Database Schema

### PostgreSQL (Server)

```sql
-- Core tables
namespaces (namespace_id, name, created_at)
threads (thread_id, namespace_id, scope, priority, state, created_at, updated_at)
commitments (commitment_id, thread_id, status, due_at, next_action, blockers)
events (event_id, namespace_id, thread_id, event_type, payload, created_at)
thread_summaries (thread_id, summary, updated_at)
embeddings (embedding_id, namespace_id, thread_id, content, vector)
documents (document_id, namespace_id, thread_id, content, metadata)
messages (message_id, namespace_id, thread_id, content, role, metadata)

-- Indexes
idx_threads_namespace ON threads(namespace_id)
idx_threads_state ON threads(state)
idx_events_namespace ON events(namespace_id)
idx_embeddings_namespace ON embeddings(namespace_id)
```

### SQLite (Local)

Same schema as PostgreSQL, with:
- JSON serialization for arrays/objects
- JavaScript-based cosine similarity for embeddings
- WAL mode for concurrent access

## Configuration

### Authority Configuration

```json
{
  "version": "1.0",
  "principal": {
    "id": "principal-default",
    "name": "Default Principal",
    "type": "personal"
  },
  "default_permissions": {
    "allow_thread_creation": true,
    "allow_namespace_creation": true,
    "allow_cross_namespace_transfer": false,
    "allow_model_invocation": true,
    "allow_tool_invocation": true
  }
}
```

### Governance Capsule

```json
{
  "version": "1.0",
  "capsule_id": "...",
  "issued_at": "...",
  "expires_at": "...",
  "treaty": {
    "constraints": {
      "max_token_budget": 100000,
      "allowed_model_families": ["openai", "anthropic"],
      "allowed_tool_categories": ["file", "web"]
    }
  },
  "genome": {
    "capabilities": {
      "memory_read": true,
      "memory_write": true,
      "model_invocation": true,
      "cross_namespace_envelope": false
    }
  },
  "posture": {
    "mode": "development",
    "strict_validation": true
  },
  "signature": "..."
}
```

## Extending the System

### Adding a New Handler

```typescript
registry.register({
  id: 'my_custom_handler',
  intent: 'my.custom.action',
  risk_class: 'low_risk',
  required_capabilities: ['memory_write'],
  handler: async (ctx, payload, capabilities) => {
    // Handler receives capability tokens
    // Use memory store with governance tags
    const tags = buildGovernanceTags(ctx);
    return await store.createThread(payload, tags);
  },
});
```

### Adding a New Adapter

```typescript
class MyModelAdapter implements ModelAdapter {
  id = 'my-adapter';
  supported_families = ['my-family'];

  supports(model_id: string): boolean {
    return model_id.startsWith('my-');
  }

  async invoke(request: ModelInvocationRequest) {
    // Validate capability token (defense in depth)
    if (!request.capability_token) {
      throw new Error('Token required');
    }
    // ... invoke model
  }
}

gateway.registerModelAdapter(new MyModelAdapter());
```

### Adding a New Store Backend

Implement the `MemoryStore` interface:

```typescript
class MyCustomStore implements MemoryStore {
  async initialize(): Promise<void> { /* ... */ }
  async createThread(input, tags): Promise<Thread> {
    this.validateTags(tags);
    this.validateNamespaceAccess(input.namespace_id, tags);
    // ... implement
  }
  // ... all other methods
}
```
