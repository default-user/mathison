# Changelog

All notable changes to Mathison will be documented in this file.

## [2.1.0] - 2026-01-18

### Added

#### Unified Governed Pipeline
- New `@mathison/pipeline` package implementing single execution path
- All requests flow through: CIF ingress → CDI action check → handler → CDI output check → CIF egress
- `PipelineExecutor` class with stage-based execution
- `HandlerRegistry` for intent-to-handler mapping (no direct handler calls)
- HTTP, gRPC, CLI, and worker integrations via `PipelineRouter`, `createGrpcInterceptor`, `CliPipelineExecutor`, `WorkerPipelineExecutor`

#### Fail-Closed Governance
- `GovernanceCapsuleLoader` with signed capsule verification
- Cache TTL management with configurable expiration
- Degrade ladder implementation:
  - Full degradation: only read-only allowed
  - Partial degradation: low-risk allowed, high-risk denied
  - None: all operations allowed
- Deterministic resolver: same inputs → same decisions

#### Memory Store Interface
- New unified `MemoryStore` interface in `@mathison/memory`
- All operations require `GovernanceTags` (principal_id, oi_id, purpose, origin_labels)
- Namespace boundaries enforced at query layer
- `PostgresMemoryStore`: PostgreSQL + pgvector implementation with migrations
- `SqliteMemoryStore`: SQLite implementation for local/offline use
- Factory function for environment-based store selection

#### Adapter Conformance
- New `@mathison/adapters` package with conformance contract
- `AdapterGateway` for capability-gated model/tool access
- `ModelAdapter` and `ToolAdapter` interfaces
- Conformance checker with violation detection
- Invocation logging for audit trail

#### Invariant Tests
- Pipeline enforcement tests proving stage order
- Fail-closed tests for missing/invalid/stale/expired capsules
- No-hive-mind tests for namespace isolation
- Adapter bypass tests for capability enforcement

### Changed

- Repository restructured: v2 codebase archived to `/version-one/`
- All packages updated to version 2.1.0
- CI workflow updated with invariant test jobs

### Security

- Strict namespace isolation (no cross-OI access without envelope)
- Capability tokens required for all adapter invocations
- Taint detection for XSS and SQL injection patterns
- Automatic redaction of sensitive patterns (emails, SSN)

### Breaking Changes

- No runtime imports from `/version-one/` allowed
- All memory operations now require `GovernanceTags`
- Handlers cannot be called directly, must go through pipeline
- Model/tool adapters require capability tokens

## [2.0.0] - Previous Release

See `/version-one/` for v2.0.0 codebase (archived, read-only reference).

### Features (v2.0.0)
- CIF/CDI middleware for HTTP
- PostgreSQL storage with pgvector
- Namespace-based partitioning
- Thread and commitment management
- Append-only event log
