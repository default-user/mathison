# Mathison OI — Governance-First Ongoing Intelligence

**Version:** 0.1.0 (bootstrap phase)
**Governance:** Tiriti o te Kai v1.0

## Overview

Mathison is a governance-first OI (Ongoing Intelligence) system built on treaty-based constraints. It combines:

- **Graph/Hypergraph Memory** — Structured memory for contexts and relationships
- **CDI (Conscience Decision Interface)** — Kernel-level governance enforcement
- **CIF (Context Integrity Firewall)** — Boundary control for safe ingress/egress
- **Treaty-Based Governance** — Human-first, consent-based, fail-closed operation

## Governance Root

All system behavior flows from **Tiriti o te Kai** ([docs/tiriti.md](./docs/tiriti.md)), which establishes:

1. **People first; tools serve** — Human authority and dignity lead
2. **Consent and stop always win** — Immediate de-escalation on request
3. **Speak true; name true; credit** — Truthfulness and attribution
4. **Fail-closed** — When uncertain, refuse or narrow scope
5. **No hive mind** — No identity fusion between OI instances
6. **Honest limits** — No false claims about capabilities

## Architecture

```
┌─────────────────────────────────────────┐
│         Mathison Server                  │
├─────────────────────────────────────────┤
│  CIF (Context Integrity Firewall)       │
│  ├─ Ingress: sanitize, quarantine       │
│  └─ Egress: leakage control             │
├─────────────────────────────────────────┤
│  CDI (Conscience Decision Interface)    │
│  ├─ Treaty parser (tiriti.md)           │
│  ├─ Rule enforcement                    │
│  └─ Fail-closed kernel                  │
├─────────────────────────────────────────┤
│  OI Engine (interpretation)             │
│  Memory Graph (hypergraph storage)      │
└─────────────────────────────────────────┘
```

See [docs/architecture.md](./docs/architecture.md) for details.

## Monorepo Structure

```
mathison/
├── docs/
│   ├── tiriti.md          # Governance treaty v1.0
│   ├── architecture.md    # System architecture
│   ├── cdi-spec.md        # CDI specification
│   └── cif-spec.md        # CIF specification
├── packages/
│   ├── mathison-server/       # Main server orchestration
│   ├── mathison-governance/   # CDI + treaty enforcement
│   ├── mathison-memory/       # Graph/hypergraph memory
│   ├── mathison-oi/           # Interpretation engine
│   └── mathison-sdk-generator/ # Multi-language SDK generation
├── sdks/
│   ├── typescript/
│   ├── python/
│   └── rust/
└── config/
    └── governance.json    # Treaty configuration
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Install & Build

```bash
pnpm install
pnpm -r build
```

### Run Tests

```bash
pnpm -r test
```

### Environment Variables

Required for server operation:

- `MATHISON_STORE_BACKEND` — Storage backend: `FILE` or `SQLITE` (fail-closed if missing)
- `MATHISON_STORE_PATH` — Base path for storage files (fail-closed if missing)

Example:
```bash
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data
```

### Start Server

```bash
# Set required environment variables
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data

# Development mode (hot reload)
pnpm dev

# Production mode
pnpm server
```

Expected `/health` response:
```json
{
  "status": "healthy",
  "bootStatus": "ready",
  "governance": {
    "treaty": {
      "version": "1.0",
      "authority": "kaitiaki"
    },
    "cdi": { "strictMode": true, "initialized": true },
    "cif": { "maxRequestSize": 1048576, "maxResponseSize": 1048576, "initialized": true }
  },
  "storage": {
    "backend": "FILE",
    "path": "./data",
    "initialized": true
  }
}
```

## API Endpoints

### Health & Governance

- `GET /health` — Server health and governance status

### Job Management

- `POST /jobs/run` — Execute a new governed job
  - Body: `{ input: any, metadata?: any }`
  - Returns: `{ job_id, status, result? }`

- `GET /jobs/:job_id/status` — Query job status
  - Returns: `{ job_id, status, result?, stage?, error? }`

- `POST /jobs/:job_id/resume` — Resume a paused/failed job (idempotent)
  - Body: `{ checkpoint?: any }`
  - Returns: `{ job_id, status, result? }`

### Receipts

- `GET /receipts/:job_id` — Retrieve all governance receipts for a job
  - Returns: `{ job_id, receipts: [...] }`

## Governance Pipeline

Every request passes through a mandatory governance pipeline (structurally enforced via Fastify hooks):

1. **CIF Ingress** (`onRequest`) — Sanitize, validate, quarantine untrusted input
2. **CDI Action Check** (`preHandler`) — Evaluate action against treaty rules
3. **Handler Execution** — Perform governed operation via ActionGate
4. **CDI Output Check** (`onSend`) — Validate output for leaks/violations
5. **CIF Egress** (`onSend`) — Final boundary control before response

If any stage denies, the pipeline halts and returns a structured error with `reason_code` from the locked GovernanceReasonCode enum (17 codes covering treaty violations, boundary failures, and fail-closed scenarios).

## Development Principles

Following the treaty:

- **Fail-closed by default** — Refuse when uncertain
- **Explicit over implicit** — No silent escalation
- **Attribution** — Credit sources and collaborators
- **Bounded memory** — Honest about persistence limits
- **No hive** — Message-passing only between instances

## Status

**Current Phase:** Governed Service (v0.3.0)

### Completed

- [x] **P1:** Governance treaty (Tiriti o te Kai v1.0)
- [x] **P1:** Monorepo structure and package scaffolding
- [x] **P2-A:** CDI + CIF implementation (governance layer)
- [x] **P2-B:** Swap-ready storage backends (FILE + SQLite with conformance tests)
- [x] **P3-A:** Fastify server with governed pipeline (CIF→CDI→handler→CDI→CIF)
- [x] **P3-B:** ActionGate structural enforcement + locked reason codes (17 codes)
- [x] **P3-C:** Minimal job API (run/status/resume) with E2E conformance tests

### Upcoming

- [ ] **P4:** Memory graph persistence layer integration
- [ ] **P4:** OI engine core (Ongoing Intelligence interpretation)
- [ ] **P5:** gRPC APIs and streaming support
- [ ] **P6:** SDK generation for TypeScript/Python/Rust

## License

(To be determined — likely dual-license for commercial/open variants)

## Governance

This system is governed by **Tiriti o te Kai v1.0** ([docs/tiriti.md](./docs/tiriti.md)).
**Kaitiaki:** Ande (root veto authority)
