# Mathison Roadmap

## Current Version: v2.2.0

### v2.0 → v2.1 (Released)

**Focus**: Foundation architecture with governed pipeline

- Unified governed pipeline (CIF ingress → CDI action → handler → CDI output → CIF egress)
- Fail-closed governance with capsule verification
- Namespace isolation (no hive mind)
- Capability-gated adapter gateway
- Memory store with SQLite and PostgreSQL backends
- HTTP server with pipeline integration

### v2.1 → v2.2 (Current Release)

**Focus**: Model Bus - governed access to external AI APIs

**New Package**: `@mathison/model-bus`

| Feature | Description |
|---------|-------------|
| Model Router | Routes requests to adapters with capability enforcement |
| OpenAI Adapter | Chat Completions API (gpt-4, gpt-3.5, o1, o3) |
| Anthropic Adapter | Messages API (claude-3, claude-2, claude-opus, claude-sonnet) |
| Local Adapter | Mock adapter for testing (no network) |
| HTTP Client | Single point for all vendor API calls |
| No-Bypass Test | CI test prevents vendor calls outside model-bus |

**New Intent**: `ai.chat`

- Reads thread context from governed memory store
- Assembles safe context with CIF sanitization
- Uses CDI-minted capability token (`model_invocation`)
- Calls vendor via Model Bus adapter
- Writes assistant message back to thread
- Logs provenance event with usage and timing

**HTTP Route**: `POST /threads/:thread_id/ai/chat`

**Required Capabilities**: `model_invocation`, `memory_read`, `memory_write`

**Documentation Added**:
- [Model Bus Specification](specs/v2.2-model-bus.md)
- [Provenance and Logging](specs/v2.2-provenance-and-logging.md)
- [No-Bypass Enforcement](specs/v2.2-no-bypass-enforcement.md)

### v2.2 → v2.3 (Planned)

**Focus**: Tool execution and streaming

Planned features:
- Tool invocation through governed handlers
- Streaming responses for long-running model calls
- Function calling support for OpenAI/Anthropic
- Enhanced rate limiting and circuit breakers

### v2.3 → v3.0 (Future)

**Focus**: Multi-tenant and federation

Planned features:
- Multi-tenant deployment support
- Cross-OI federation with explicit envelopes
- Enhanced observability and metrics
- Production hardening

## Non-Goals

The following are explicitly not planned:

1. **Direct SDK Usage**: Vendor SDKs will never be imported outside `@mathison/model-bus`
2. **Bypass Paths**: All model calls must go through governed handlers
3. **Hive Mind**: Cross-namespace access without explicit envelopes
4. **Runtime Imports from /version-one**: Archive only, no runtime dependencies
