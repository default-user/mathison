# Mathison v2.0.0

A structured, governed, thread tending system that maintains partitioned state and commitments across concurrent threads under an explicit authority model.

## Quick Start

```bash
# Start dev environment
make dev-up

# Run migrations
make migrate

# Start server
make server

# Run tests
make test
```

## Architecture

Mathison is an OI (Organized Intelligence) implementation with these core organs:

- **Governance**: Explicit authority model, principal management, CIF/CDI boundaries
- **Memory**: Thread management, partitioned state, event log, semantic recall
- **Artifacts**: Large blob storage with content addressing
- **Mesh**: Scheduler and orchestration
- **Server**: HTTP API with CIF/CDI middleware

See `docs/ARCHITECTURE.md` for detailed architecture documentation.

## Documentation

- [Overview](docs/README.md)
- [OI Definition](docs/OI_DEFINITION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design Rationale](docs/WHY.md)
- [Development TODOs](docs/TODO.md)

## Packages

- `packages/mathison-server` - HTTP/gRPC server with CIF/CDI
- `packages/mathison-governance` - Authority and policy enforcement
- `packages/mathison-memory` - Event log, threads, commitments, semantic recall
- `packages/mathison-mesh` - Scheduler and thread orchestration
- `packages/mathison-artifacts` - Blob storage layer
- `packages/mathison-cli` - Command line interface
- `packages/mathison-mobile` - Mobile app stub (optional)

## Development

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck
```

## Production Requirements

- PostgreSQL 15+ with pgvector extension
- Node.js 20+
- (Optional) Valkey/Redis for caching
- (Optional) NATS JetStream for event bus
- (Optional) OpenSearch for full-text search

## License

See LICENSE file.

## v1 Archive

The v1.x codebase is archived in `version-one/` for historical reference. v2 is a clean rewrite.
