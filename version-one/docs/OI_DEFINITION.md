# OI Definition

## Core Definition

An **OI** (Ongoing Intelligence) is a structured, governed, thread tending system that maintains partitioned state and commitments across concurrent threads under an explicit authority model.

## Key Properties

### 1. Thread Model

**Thread**: A unit of work with:
- Unique `thread_id`
- `namespace_id` for partition isolation
- `scope` defining context
- `priority` for scheduling
- `state`: one of `open`, `waiting`, `blocked`, `done`

**Invariants**:
- Every thread belongs to exactly one namespace
- Thread IDs are unique within an OI instance
- State transitions are recorded in the event log
- Threads cannot access data outside their namespace without explicit governance permission

### 2. Namespace Partitioning

**Namespace**: A partition boundary for data isolation.

**Invariants**:
- All stored data is tagged with `namespace_id`
- All queries MUST include `namespace_id`
- Cross-namespace operations are denied by default
- Cross-namespace transfers require explicit governance rule signed by the principal

**Enforcement**: Partition enforcement happens at the database query level, not application level.

### 3. Authority Model

**Principal**: The top-level authority in a personal OI.

**Authority Config**: Defines:
- Principal identity
- Admin roles (if any)
- Delegation scopes
- Default permissions

**Invariants**:
- Authority config is loaded at boot and validated
- Missing or invalid config causes startup failure (fail closed)
- All governed actions check authority before execution

### 4. Commitment Ledger

**Commitment**: A tracked obligation within a thread.

Fields:
- `commitment_id`: unique identifier
- `thread_id`: owning thread
- `status`: current state
- `due_at`: optional deadline
- `next_action`: what needs to happen
- `blockers`: obstacles preventing completion
- `created_at`, `updated_at`: timestamps

**Invariants**:
- Commitments are immutable once created (updates create new records)
- Status changes are logged as events
- Commitments inherit namespace from their thread

### 5. Event Log

**Event**: An immutable record of system activity.

Required fields:
- `event_id`: unique identifier
- `namespace_id`: partition tag
- `thread_id`: nullable, associated thread if any
- `event_type`: classification (message, tool_call, decision, error, etc.)
- `payload`: JSON data
- `created_at`: timestamp

**Invariants**:
- Event log is append-only
- Events are never modified or deleted
- All state changes produce events
- Event log is the source of truth for reconstruction

### 6. Semantic Recall

**Embedding Store**: Vector search for memory recall using pgvector.

**Invariants**:
- All embeddings are tagged with `namespace_id`
- Queries require `namespace_id` and return results only within that namespace
- Embedding operations are logged as events

### 7. Scheduler

**Scheduler**: Selects next runnable thread.

Algorithm:
1. Filter to runnable threads (state = `open`, not blocked)
2. Sort by priority (highest first)
3. Tie-break by `updated_at` (oldest first)
4. Return top candidate or none if no runnable threads

**Invariants**:
- Scheduler decisions are logged as events
- Scheduler respects namespace isolation
- Scheduler never modifies thread state directly

### 8. CIF and CDI Boundaries

**CIF** (Context Integrity Firewall): Input validation and sanitization.
- Validates schema
- Quarantines invalid input
- Normalizes data

**CDI** (Conscience Decision Interface): Governance checks before and after actions.
- Pre-action: check policy, allow/deny/require confirmation
- Post-action: verify output doesn't violate policy
- Egress: redact cross-namespace leakage

**Invariants**:
- All external input passes through CIF
- All governed actions pass through CDI
- CIF/CDI failures are logged and fail closed

## Failure Modes

The system MUST fail closed in these cases:
- Missing or invalid authority config
- Missing or invalid governance policy
- Missing namespace_id in query
- Invalid adapter configuration
- Missing cryptographic material for secured operations

## Extension Points

- **MemoryStore**: Interface for persistence (default: PostgresStore)
- **EventBus**: Interface for event distribution (default: in-process, optional: NATS)
- **Search**: Optional OpenSearch adapter
- **Graph**: Optional Apache AGE adapter
- **Cache**: Optional Valkey adapter

All optional systems are behind feature flags and disabled by default.
