# Mathison v2 Documentation

Welcome to Mathison v2, a structured OI (Organized Intelligence) implementation.

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- Docker and Docker Compose (for dev environment)

### Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Start dev services: `make dev-up`
4. Run migrations: `make migrate`
5. Start server: `make server`

The server will be available at `http://localhost:3000`.

### Running Tests

```bash
make test
```

## Core Concepts

An **OI** is a structured, governed, thread tending system that maintains partitioned state and commitments across concurrent threads under an explicit authority model.

Key components:

- **Threads**: Units of work with state and commitments
- **Namespaces**: Partition boundaries for data isolation
- **Authority Model**: Explicit principal and delegation rules
- **Event Log**: Append-only log of all system events
- **Commitments**: Tracked obligations per thread

See [OI_DEFINITION.md](./OI_DEFINITION.md) for detailed definitions and invariants.

## Architecture

Mathison is organized into organs with clear responsibilities:

- **Governance**: Authority, CIF/CDI boundaries
- **Memory**: Threads, events, semantic recall
- **Artifacts**: Blob storage
- **Mesh**: Scheduling and orchestration
- **Server**: HTTP API layer

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed component documentation.

## Development

See individual package READMEs:

- [mathison-server](../packages/mathison-server/README.md)
- [mathison-governance](../packages/mathison-governance/README.md)
- [mathison-memory](../packages/mathison-memory/README.md)
- [mathison-mesh](../packages/mathison-mesh/README.md)
- [mathison-artifacts](../packages/mathison-artifacts/README.md)
- [mathison-cli](../packages/mathison-cli/README.md)

## WHY

For design rationale and tradeoffs, see [WHY.md](./WHY.md).

## TODO

See [TODO.md](./TODO.md) for repository-wide tasks.
