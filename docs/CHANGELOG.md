# Changelog

All notable changes to Mathison will be documented in this file.

## [2.2.0] - 2026-01-18

### Added

#### Model Bus (`@mathison/model-bus`)
- New package for governed model invocation through adapters
- `ModelRouter`: Routes requests to adapters with capability enforcement
- `OpenAIAdapter`: OpenAI Chat Completions API (gpt-4, gpt-3.5, o1, o3)
- `AnthropicAdapter`: Anthropic Messages API (claude-3, claude-2)
- `LocalAdapter`: Mock adapter for testing (no network calls)
- Single internal HTTP client for all vendor API calls
- Provenance data in every response (provider, model_id, usage, latency, trace_id)

#### ai.chat Intent
- New governed handler for AI model calls
- HTTP route: `POST /threads/:thread_id/ai/chat`
- Required capabilities: `model_invocation`, `memory_read`, `memory_write`
- Reads thread context for conversation history (last 20 messages)
- Uses CDI-minted capability token for model access
- Writes assistant message back to thread with metadata
- Logs provenance event with usage, latency, and correlation IDs

#### CIF Schemas for ai.chat
- `AiChatRequestSchema`: Validates request payload
- `AiChatResponseSchema`: Validates response format
- `AiChatParametersSchema`: Validates model parameters
- `isValidModelId`: Validates model_id against allowed patterns
- `ALLOWED_MODEL_PATTERNS`: Regex patterns for allowed model IDs

#### No-Bypass Enforcement
- CI invariant test: `no-vendor-bypass.test.ts`
- Scans all packages for vendor SDK imports
- Fails if `openai`, `@anthropic-ai/sdk`, or vendor endpoints found outside model-bus
- Documents the no-bypass security rule

#### Documentation
- `docs/specs/v2.2-model-bus.md`: Model Bus architecture and usage
- `docs/specs/v2.2-provenance-and-logging.md`: Provenance event structure
- `docs/specs/v2.2-no-bypass-enforcement.md`: No-bypass rule and CI test
- `docs/roadmap.md`: Version roadmap and delta

### Changed
- All package versions bumped to 2.2.0
- Server version updated to 2.2.0
- Server now initializes ModelRouter and AdapterGateway
- API mount point added at `/api/v2.2` (v2.1 still available for backwards compat)
- Updated `docs/ARCHITECTURE.md` with model-bus section

### Security
- All vendor API calls require CDI-issued `model_invocation` capability token
- Model invocation provenance logged for auditing and cost tracking
- No direct vendor SDK access possible outside governed handlers
- Capability token namespace must match request namespace

---

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
