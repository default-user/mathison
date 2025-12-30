# Mathison OI — Governance-First Ongoing Intelligence

**Version:** 0.1.0 (bootstrap phase)
**Governance:** Tiriti o te Kai v1.0

## Overview

Mathison is a governance-first OI (Ongoing Intelligence) system built on treaty-based constraints. It combines:

- **Graph/Hypergraph Memory** — Structured memory for contexts and relationships with persistent storage
- **OI Engine** — Local interpretation engine with memory-graph integration
- **Distributed Mesh Protocol** — Privacy-preserving distributed computation across nodes
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
│   ├── mathison-storage/      # Persistent storage (FILE/SQLITE)
│   ├── mathison-oi/           # Interpretation engine
│   ├── mathison-mesh/         # Distributed mesh protocol
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

### Memory Graph

**Read Operations (Phase 4-A):**

- `GET /memory/nodes/:id` — Retrieve node by ID
  - Returns: `{ id, type, data, metadata? }`
  - 404 if node not found

- `GET /memory/nodes/:id/edges` — Retrieve edges for a node
  - Returns: `{ node_id, count, edges }`
  - 404 if node not found

- `GET /memory/search?q=query&limit=10` — Search nodes by text
  - Query params: `q` (required, search text), `limit` (optional, 1-100, default 10)
  - Returns: `{ query, limit, count, results }`
  - 400 for malformed request

**Write Operations (Phase 4-B) — Via ActionGate + Idempotency:**

- `POST /memory/nodes` — Create node (idempotent)
  - Body: `{ id?: string, type: string, data?: object, metadata?: object, idempotency_key: string }`
  - Returns: `{ node, created: boolean, receipt }`
  - **Idempotency:** Repeat requests with same `idempotency_key` return same response
  - 201 on success, 200 if already exists with identical payload, 409 if conflict, 400 for malformed request
  - **Receipt:** Includes `action`, `decision`, `policy_id`, `store_backend`, `timestamp`

- `POST /memory/edges` — Create edge (idempotent)
  - Body: `{ from: string, to: string, type: string, metadata?: object, idempotency_key: string }`
  - Returns: `{ edge, created: boolean, receipt }`
  - **Idempotency:** Repeat requests with same `idempotency_key` return same response
  - 201 on success, 404 if source/target node not found, 400 for malformed request
  - **Receipt:** Includes `action`, `decision`, `policy_id`, `store_backend`, `timestamp`

**Governance Notes:**
- **Read operations** pass through full governance pipeline (CIF→CDI→handler→CDI→CIF) without ActionGate (no side effects)
- **Write operations** MUST go through ActionGate for structural enforcement
- All writes create receipts (success or deny)
- All writes require `idempotency_key` for safe retry behavior
- Direct store mutation is structurally forbidden (all mutations via ActionGate)

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

**Current Phase:** Distributed Systems (v0.6.0)

### Completed

- [x] **P1:** Governance treaty (Tiriti o te Kai v1.0)
- [x] **P1:** Monorepo structure and package scaffolding
- [x] **P2-A:** CDI + CIF implementation (governance layer)
- [x] **P2-B:** Swap-ready storage backends (FILE + SQLite with conformance tests)
- [x] **P3-A:** Fastify server with governed pipeline (CIF→CDI→handler→CDI→CIF)
- [x] **P3-B:** ActionGate structural enforcement + locked reason codes (17 codes)
- [x] **P3-C:** Minimal job API (run/status/resume) with E2E conformance tests
- [x] **P4-A:** Read-only memory API (GET /memory/nodes, /memory/search) fully governed
- [x] **P4-B:** Write memory API (POST /memory/nodes, POST /memory/edges) via ActionGate + idempotency
- [x] **P4-C:** Memory graph persistence layer (FILE/SQLITE backends for nodes/edges/hyperedges)
- [x] **P5:** OI engine core (interpretation with memory integration, intent detection, confidence scoring)
- [x] **P6:** Distributed mesh protocol (MeshCoordinator, task distribution, privacy-preserving architecture)

### Upcoming

- [ ] **P7:** Mobile deployment (React Native / Capacitor)
- [ ] **P8:** Mesh discovery protocols (proximity-based, broadcast, manual)
- [ ] **P9:** End-to-end encryption for mesh communication
- [ ] **P10:** SDK generation for TypeScript/Python/Rust
- [ ] **P11:** gRPC APIs and streaming support

## License

(To be determined — likely dual-license for commercial/open variants)

## Governance

This system is governed by **Tiriti o te Kai v1.0** ([docs/tiriti.md](./docs/tiriti.md)).
**Kaitiaki:** Ande (root veto authority)
