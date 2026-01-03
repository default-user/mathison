# ADR 0001: Storage Backends (FILE + SQLITE)

**Date:** 2025-12-29
**Status:** Accepted
**Last Updated:** 2026-01-03

---

## Who This Is For

- Developers implementing storage features
- Operators choosing backend configuration
- Architects reviewing storage decisions

## Why This Exists

Documents the architectural decision for dual-backend storage with FILE and SQLITE options.

---

## Decision

Mathison uses a **dual-backend storage architecture** with FILE and SQLITE backends, selected at runtime via environment configuration.

## Context

Requirements:
1. Persistent job checkpoints for resumability
2. Append-only event receipts for audit trails
3. Backend swappability for deployment environments
4. Fail-closed configuration (Tiriti Rule 10)

## Architecture

### Storage Interfaces

```typescript
interface CheckpointStore {
  init(): Promise<void>;
  create(cp: JobCheckpoint): Promise<void>;
  load(jobId: string): Promise<JobCheckpoint | null>;
  save(cp: JobCheckpoint): Promise<void>;
}

interface ReceiptStore {
  init(): Promise<void>;
  append(r: Receipt): Promise<void>;
  readByJob(jobId: string): Promise<Receipt[]>;
}
```

### Backend Selection

```bash
MATHISON_STORE_BACKEND=FILE|SQLITE
MATHISON_STORE_PATH=<path>
```

### FILE Backend
- Location: `{path}/checkpoints/{jobId}.json`
- Use case: Development, human-readable

### SQLITE Backend
- Tables: `checkpoints`, `receipts`
- WAL mode enabled
- Use case: Production, structured queries

## Equivalence Guarantee

Both backends provide behavioral equivalence, proven by conformance suite.

## Consequences

### Positive
- ✅ Backend swappability
- ✅ Fail-closed configuration
- ✅ Append-only receipts

### Negative
- ⚠️ Two backends to maintain

---

## How to Verify

```bash
# Run conformance tests
pnpm --filter mathison-storage test
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Storage package | `packages/mathison-storage/` |
| Conformance tests | `packages/mathison-storage/src/__tests__/store_conformance.test.ts` |
| Factory | `packages/mathison-storage/src/factory.ts` |
