# ADR 0001: Storage Backends (FILE + SQLITE)

**Date:** 2025-12-29
**Status:** Accepted
**Context:** P2-B milestone

## Decision

Mathison uses a **dual-backend storage architecture** with FILE and SQLITE backends, selected at runtime via environment configuration. All persistence goes through abstract `CheckpointStore` and `ReceiptStore` interfaces.

## Context

The Mathison OI system requires:
1. **Persistent job checkpoints** for resumability across crashes
2. **Append-only event receipts** for governance audit trails
3. **Backend swappability** to support different deployment environments
4. **Fail-closed configuration** aligned with Tiriti o te Kai Rule 10

## Constraints (from Tiriti o te Kai)

- **Fail-closed** (Rule 10): Invalid/missing config must refuse to start
- **Honest limits** (Rule 8): No false persistence claims
- **No hive** (Rule 7): No covert cross-instance state sharing
- **Bounded memory** (Section 12): Clear persistence semantics

## Architecture

### Storage Interfaces

```typescript
interface CheckpointStore {
  init(): Promise<void>;
  create(cp: JobCheckpoint): Promise<void>;
  load(jobId: string): Promise<JobCheckpoint | null>;
  save(cp: JobCheckpoint): Promise<void>;
  list(opts?: { limit?: number }): Promise<JobCheckpoint[]>;
}

interface ReceiptStore {
  init(): Promise<void>;
  append(r: Receipt): Promise<void>;
  readByJob(jobId: string, opts?: { limit?: number }): Promise<Receipt[]>;
  latest(jobId: string): Promise<Receipt | null>;
}
```

### Backend Selection (Fail-Closed)

Environment variables (required):
- `MATHISON_STORE_BACKEND=FILE|SQLITE`
- `MATHISON_STORE_PATH=<path>`

Invalid/missing values throw `StoreMisconfiguredError` (code: `STORE_MISCONFIGURED`).

### FILE Backend

**Checkpoints:**
- Location: `{MATHISON_STORE_PATH}/checkpoints/{jobId}.json`
- Format: JSON per job
- Semantics: Last-write-wins (UPSERT via overwrite)

**Receipts:**
- Location: `{MATHISON_STORE_PATH}/receipts/eventlog-{NNNN}.jsonl`
- Format: JSONL (one receipt per line)
- Rotation: Size-based (default 10MB threshold)
- Append-only: New lines only, no modification
- Read: Spans all rotated logs in lexicographic order

**Use case:** Development, single-instance deployments, human-readable audit logs

### SQLITE Backend

**Checkpoints:**
- Table: `checkpoints(job_id PRIMARY KEY, checkpoint_json, updated_at, content_hash)`
- Semantics: UPSERT via `INSERT ... ON CONFLICT DO UPDATE`
- Index: `updated_at` for list operations

**Receipts:**
- Table: `receipts(id INTEGER PK AUTOINCREMENT, job_id, ts, receipt_json, receipt_hash, prev_hash)`
- Semantics: INSERT-ONLY (no UPDATE/DELETE in code)
- Hash-chain: `prev_hash` links to previous receipt's `receipt_hash`
- Integrity: SHA256 hash of `receipt_json`
- Indexes: `job_id`, `ts`

**WAL Mode:** Enabled for better concurrency (`PRAGMA journal_mode = WAL`)

**Use case:** Production, multi-process deployments, structured queries

## Equivalence Guarantee

Both backends provide **behavioral equivalence**:
- Same checkpoint CRUD semantics
- Same receipt append/read semantics
- Same ordering guarantees (insertion order preserved)
- Same crash/restart resilience (no data loss, no duplicates)

**Proven by conformance suite** (`packages/mathison-storage/src/__tests__/store_conformance.test.ts`):
1. Equivalence harness: Same operations → same observable results
2. Rotation test (FILE): Multi-log reads are transparent
3. Crash/restart test (both): Resume without duplicates
4. Append-only test (SQLITE): Verifies INSERT-ONLY code path

## DI Wiring

Factory function provides single entry point:

```typescript
function makeStoresFromEnv(env = process.env): {
  checkpointStore: CheckpointStore;
  receiptStore: ReceiptStore;
}
```

Consumers depend only on interfaces, never on concrete backends.

## Receipt Metadata

All receipts include:
- `store_backend: "FILE" | "SQLITE"` (for P2-B traceability)
- `timestamp: string` (ISO 8601)
- `job_id`, `stage`, `action` (required)
- `policy_id`, `inputs_hash`, `outputs_hash` (governance)

SQLITE backend adds:
- `receipt_hash: string` (SHA256 of receipt JSON)
- `prev_hash: string | null` (previous receipt's hash, for chain integrity)

## Constraints

1. **No direct filesystem access outside FileStore implementation**
   - All `.mathison/*` path logic encapsulated in `FileStore` classes
   - Prevents accidental bypass of backend abstraction

2. **No direct receipt appends outside ReceiptStore**
   - All `fs.appendFile` for receipts goes through `ReceiptStore.append()`
   - Enforces append-only semantics and rotation logic

3. **SQLITE receipts table is append-only**
   - Code contains only `INSERT` operations
   - No `UPDATE` or `DELETE` allowed
   - Enables tamper-evident audit trails

4. **Fail-closed config validation**
   - Missing/invalid `MATHISON_STORE_BACKEND` → throws
   - Missing `MATHISON_STORE_PATH` → throws
   - No silent fallback to defaults

## Alternatives Considered

### MongoDB/PostgreSQL graph stores
- **Rejected:** Over-engineered for current checkpoint/receipt needs
- **Deferred:** May revisit for hypergraph memory layer (separate concern)

### Single-backend approach (FILE-only or SQLITE-only)
- **Rejected:** Limits deployment flexibility
- FILE-only: Poor for multi-process production
- SQLITE-only: Poor for debugging/human audit

### Silent config defaults (e.g., default to FILE)
- **Rejected:** Violates fail-closed principle (Tiriti Rule 10)
- Risk: Silent misconfiguration in production

## Consequences

### Positive

- ✅ Backend swappability without code changes
- ✅ Development uses FILE (human-readable)
- ✅ Production uses SQLITE (structured, concurrent)
- ✅ Conformance suite prevents regression
- ✅ Fail-closed config prevents silent misconfiguration
- ✅ Append-only receipts enable audit integrity

### Negative

- ⚠️ Two backends to maintain (but conformance suite mitigates)
- ⚠️ SQLITE native build complexity (better-sqlite3 requires node-gyp)
- ⚠️ Hash-chain in SQLITE adds slight overhead (negligible for audit use case)

### Neutral

- Backend choice is deployment-time decision (not compile-time)
- Receipt format is backend-agnostic JSON (portable)

## Implementation

**Package:** `packages/mathison-storage`
**Files:**
- `src/types.ts` - Config types, error classes
- `src/checkpoint_store.ts` - CheckpointStore interface
- `src/receipt_store.ts` - ReceiptStore interface
- `src/factory.ts` - DI factory
- `src/backends/file/` - FILE backend implementation
- `src/backends/sqlite/` - SQLITE backend implementation
- `src/__tests__/store_conformance.test.ts` - Conformance suite

**Test Results:**
```
PASS src/__tests__/store_conformance.test.ts
  ✓ FILE backend passes equivalence test
  ✓ SQLITE backend passes equivalence test
  ✓ rotates receipts and readByJob spans all logs (FILE)
  ✓ FILE backend: resumes after crash
  ✓ SQLITE backend: resumes after crash
  ✓ receipts table is append-only (SQLITE)

Test Suites: 1 passed
Tests:       6 passed
```

## Future Work

1. **CI enforcement:** Run conformance suite on every PR (both backends)
2. **Receipt hash-chain verification:** Add traversal/validation utilities
3. **Rotation policy configurability:** Allow custom thresholds per deployment
4. **PostgreSQL backend:** If multi-tenant or distributed requirements emerge
5. **Encryption at rest:** If required by governance policy extensions

## References

- Tiriti o te Kai v1.0 (`docs/tiriti.md`)
- P2-B Definition of Done (original directive)
- Conformance test suite (`packages/mathison-storage/src/__tests__/store_conformance.test.ts`)
