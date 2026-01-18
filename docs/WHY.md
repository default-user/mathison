# WHY: Design Rationale and Tradeoffs

This document explains key design decisions in Mathison v2.

## Why a Clean v2 Rewrite?

**Decision**: Clean rewrite at repo root, archive v1 in `version-one/`.

**Rationale**:
- v1 accumulated technical debt during rapid iteration
- Clean separation allows fresh start without breaking v1 references
- Archive preserves institutional knowledge without maintenance burden
- v2 can iterate on proven concepts from v1 without legacy constraints

**Tradeoff**: Migration effort for existing deployments, but v1 had no external deployments yet.

## Why TypeScript?

**Decision**: TypeScript for v2 implementation.

**Rationale**:
- v1 was TypeScript-based, team familiarity
- Strong typing catches errors at compile time
- Rich ecosystem for server, DB, gRPC
- Excellent tooling and IDE support

**Tradeoff**: Runtime overhead vs Go, but developer velocity and type safety win for this use case.

## Why PostgreSQL + pgvector?

**Decision**: PostgreSQL as primary datastore, pgvector for embeddings.

**Rationale**:
- Single database for structured + vector data reduces operational complexity
- pgvector is mature, performant, and PostgreSQL-native
- Transactions across tables and vectors
- Proven at scale

**Alternatives considered**:
- Separate vector DB (Pinecone, Weaviate): Added operational complexity
- Pure key-value store: No transactions or relational queries

**Tradeoff**: Vector search not as fast as specialized DBs, but operational simplicity wins.

## Why Fail Closed by Default?

**Decision**: System refuses to start or act if config/policy/crypto material is missing or invalid.

**Rationale**:
- Security by default prevents accidental privilege escalation
- Explicit configuration forces conscious decisions
- Clear errors at boot prevent silent failures in production

**Tradeoff**: More setup friction, but prevents catastrophic security bugs.

## Why Namespace Isolation at DB Level?

**Decision**: Require `namespace_id` in every query, enforce at database layer.

**Rationale**:
- Application-level enforcement can be bypassed via bugs
- Database-level enforcement is harder to bypass
- Forces conscious design of all queries

**Tradeoff**: More verbose queries, but security and isolation guarantees.

## Why Append-Only Event Log?

**Decision**: All state changes recorded as immutable events.

**Rationale**:
- Auditability: reconstruct what happened
- Debugging: replay events to reproduce bugs
- Compliance: immutable record for governance
- Enables future event sourcing patterns

**Tradeoff**: Storage growth, but critical for transparency.

## Why CIF/CDI Middleware?

**Decision**: All requests pass through CIF (validation) and CDI (decision gating).

**Rationale**:
- Centralized enforcement prevents bypass
- Explicit decision points for governance
- Auditable decisions logged per request

**Tradeoff**: Performance overhead, but security and auditability win.

## Why Scheduler Logs Decisions?

**Decision**: Scheduler logs every selection decision as an event.

**Rationale**:
- Debuggability: understand why a thread was or wasn't selected
- Auditability: track scheduler behavior over time
- Enables future scheduler improvements via analysis

**Tradeoff**: More events logged, but debugging gains justify cost.

## Why Separate Artifacts Storage?

**Decision**: Artifact metadata in Postgres, blobs in filesystem (or S3).

**Rationale**:
- Large blobs bloat database backups
- Filesystem/S3 is cheaper for blob storage
- Content addressing via hash prevents duplication

**Tradeoff**: Two systems to manage, but cost and performance wins justify it.

## Why Optional Backends Behind Flags?

**Decision**: NATS, Valkey, OpenSearch, Apache AGE are optional and disabled by default.

**Rationale**:
- Reduce required infrastructure for local dev
- Production deployments can enable as needed
- Keep core system simple, extend only when needed

**Tradeoff**: Feature detection complexity, but reduced operational burden for small deployments.

## Why Minimal Viable Scaffold?

**Decision**: v2 is a working scaffold, not a complete reimplementation of v1 features.

**Rationale**:
- Prove architecture and patterns first
- Iterate based on real usage
- Avoid over-engineering speculative features

**Tradeoff**: Less feature parity with v1 initially, but faster iteration and learning.

## Why Commitment Ledger?

**Decision**: Explicit commitment tracking per thread with status and blockers.

**Rationale**:
- Makes obligations visible and trackable
- Enables better scheduling (prioritize blocked threads differently)
- Provides structure for reflection and distillation

**Tradeoff**: More tables and queries, but visibility gains justify cost.

## Why Working Brief (Kai-style)?

**Decision**: Maintain current thread summary plus historical snapshots.

**Rationale**:
- Distillation reduces token usage for context-heavy threads
- Snapshots enable time-travel debugging
- Reflection job provides extension point for future summarization

**Tradeoff**: Summarization quality depends on reflection implementation, scaffolded as TODO.

## Summary

v2 prioritizes **security, auditability, and operational simplicity** over performance and feature completeness. Tradeoffs favor explicitness and fail-closed defaults to prevent silent failures and security bugs.
