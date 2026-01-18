# Version One Archive

This directory contains the complete v1.x codebase of Mathison, preserved as read-only reference material.

**Status**: Archived as of 2026-01-18

**Purpose**: Historical reference only. The active v2.0.0 codebase lives at the repository root.

**Contents**: Complete v1 implementation including:
- Server, governance, memory, mesh packages
- Documentation and architectural decisions
- Build tooling and configuration
- Tests and fixtures

**Important**: This archive is frozen. All new development happens in v2 at repo root.

## v1 Entry Points

- `packages/mathison-server/` - HTTP/gRPC server
- `packages/mathison-governance/` - Authority and policy
- `packages/mathison-memory/` - Event log and persistence
- `packages/mathison-mesh/` - Scheduler and orchestration
- `docs/` - Original documentation

## Migration Note

v2 is a clean rewrite that does not import from this archive. See root `docs/WHY.md` for design rationale.
