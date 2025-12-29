# Mathison OI — System Architecture

**Version:** 0.1.0
**Governance:** Tiriti o te Kai v1.0

## Overview

Mathison is a governance-first OI system with three core layers:

1. **Governance Layer** (CDI + CIF)
2. **Intelligence Layer** (OI Engine + Memory Graph)
3. **Interface Layer** (Server + SDKs)

## Architectural Diagram

```
┌───────────────────────────────────────────────────────────┐
│                    Client Applications                     │
└────────────────────────┬──────────────────────────────────┘
                         │ (SDK: TS/Python/Rust)
                         ▼
┌───────────────────────────────────────────────────────────┐
│                   Mathison Server                          │
│                  (HTTP/gRPC/WebSocket)                     │
└────────────────────────┬──────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        ▼                                  ▼
┌──────────────────────┐         ┌──────────────────────┐
│  CIF (Firewall)      │         │  CDI (Conscience)    │
│  ┌────────────────┐  │         │  ┌────────────────┐  │
│  │ Ingress        │  │         │  │ Treaty Parser  │  │
│  │ - Sanitize     │  │         │  │ (tiriti.md)    │  │
│  │ - Quarantine   │  │         │  ├────────────────┤  │
│  │ - Rate limit   │  │         │  │ Rule Engine    │  │
│  ├────────────────┤  │         │  │ - Consent      │  │
│  │ Egress         │  │         │  │ - Non-person   │  │
│  │ - Leak detect  │  │         │  │ - Fail-closed  │  │
│  │ - PII scrub    │  │         │  │ - Anti-hive    │  │
│  │ - Audit log    │  │         │  └────────────────┘  │
│  └────────────────┘  │         └──────────────────────┘
└──────────┬───────────┘                   │
           │                                │
           └───────────┬────────────────────┘
                       ▼
        ┌──────────────────────────────────┐
        │      OI Engine (Interpretation)   │
        │      ┌──────────────────────┐     │
        │      │ Context Assembly     │     │
        │      │ Confidence Scoring   │     │
        │      │ Alternative Paths    │     │
        │      └──────────────────────┘     │
        └──────────────┬───────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────┐
        │    Memory Graph (Hypergraph)     │
        │    ┌──────────────────────┐      │
        │    │ Nodes (entities)     │      │
        │    │ Edges (relations)    │      │
        │    │ Hyperedges (n-ary)   │      │
        │    │ Persistence layer    │      │
        │    └──────────────────────┘      │
        └─────────────────────────────────┘
```

## Component Responsibilities

### CIF (Context Integrity Firewall)

**Purpose:** Boundary control for safe ingress/egress

**Ingress Functions:**
- Sanitize inputs (XSS, injection attacks)
- Quarantine suspicious patterns
- Rate limiting per client
- Input validation against schema

**Egress Functions:**
- PII detection and scrubbing
- Leakage prevention (credentials, secrets)
- Output audit logging
- Response size limits

**Implementation:** `packages/mathison-governance/src/cif.ts`

### CDI (Conscience Decision Interface)

**Purpose:** Kernel-level governance enforcement

**Core Functions:**
1. **Treaty Parsing** — Load and parse tiriti.md rules
2. **Rule Evaluation** — Check actions against governance
3. **Fail-Closed Logic** — Default to refusal when uncertain
4. **Consent Tracking** — Honor "stop" signals
5. **Non-Personhood Enforcement** — Block claims of sentience/suffering
6. **Anti-Hive Guards** — Prevent identity fusion

**Decision Flow:**
```
Action Request
    ↓
CDI.checkAction(action, context)
    ↓
Parse treaty rules
    ↓
Evaluate constraints
    ↓
┌─────────────┬─────────────┬─────────────┐
│   ALLOW     │   TRANSFORM │   DENY      │
│ (compliant) │  (modified) │ (violation) │
└─────────────┴─────────────┴─────────────┘
```

**Implementation:** `packages/mathison-governance/src/cdi.ts`

### OI Engine

**Purpose:** Open Interpretation with confidence scoring

**Functions:**
- Multi-modal interpretation (text, structured data, future: images/audio)
- Confidence scoring for outputs
- Alternative interpretation paths
- Context integration from memory graph

**Implementation:** `packages/mathison-oi/src/index.ts`

### Memory Graph

**Purpose:** Hypergraph storage for structured memory

**Data Model:**
- **Nodes:** Entities (concepts, facts, contexts)
- **Edges:** Binary relationships
- **Hyperedges:** N-ary relationships (e.g., event with multiple participants)

**Operations:**
- CRUD for nodes/edges/hyperedges
- Traversal algorithms (BFS, DFS, shortest path)
- Query DSL for complex patterns
- Persistence layer (future: PostgreSQL + graph extensions)

**Implementation:** `packages/mathison-memory/src/index.ts`

## Data Flow Example

### Request: "Interpret this user message"

```
1. Client sends request via SDK
   ↓
2. Server receives at HTTP endpoint
   ↓
3. CIF.ingress() — sanitize input, check rate limits
   ↓
4. CDI.checkAction("interpret", context) — governance check
   ↓
5. OI Engine.interpret(message) — perform interpretation
   │  ↓
   │  Memory Graph.query(context) — fetch relevant context
   │  ↓
   │  Generate interpretation + confidence score
   ↓
6. CDI.checkOutput(result) — ensure compliant output
   ↓
7. CIF.egress() — scrub PII, audit log
   ↓
8. Server returns response to client
```

## Governance Integration Points

Every component respects treaty rules:

| Component | Treaty Enforcement |
|-----------|-------------------|
| **CIF** | Boundary enforcement, leakage prevention |
| **CDI** | Core governance logic, fail-closed kernel |
| **OI Engine** | Honest uncertainty, no false confidence |
| **Memory** | Bounded persistence, no covert cross-instance sharing |
| **Server** | Consent tracking, immediate stop on request |

## Deployment Model

### Phase 1 (Current): Monolithic

Single server process orchestrating all components.

### Phase 2 (Future): Distributed

- CDI/CIF as shared governance service
- Multiple OI Engine instances
- Distributed memory graph
- Message-passing only (anti-hive)

## Security Model

1. **Fail-closed by default** — Deny when uncertain
2. **Least privilege** — Minimal capabilities per component
3. **Audit everything** — Log all governance decisions
4. **No silent escalation** — Explicit authorization required
5. **Bounded memory** — Clear persistence limits

## HTTP API Request Flow

**Mathison Server** (`packages/mathison-server`) provides a governed HTTP API built on Fastify. Every request passes through a mandatory governance pipeline.

### Request Pipeline (Fail-Closed)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client HTTP Request                         │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
                    ┌────────────────┐
                    │  /health only? │────Yes──> Return 200
                    └────────┬───────┘
                             No
                             ▼
                    ┌────────────────────┐
                    │  1. CIF INGRESS    │
                    │  - Rate limiting   │
                    │  - Input sanitize  │
                    │  - Size checks     │
                    │  - PII detection   │
                    └─────────┬──────────┘
                              ▼
                      ┌───────────────┐
                      │ Allowed?      │──No──> 403 CIF_INGRESS_DENIED
                      └───────┬───────┘
                              Yes
                              ▼
                    ┌────────────────────┐
                    │  2. CDI ACTION     │
                    │  - Consent check   │
                    │  - Anti-hive       │
                    │  - Non-personhood  │
                    │  - Fail-closed     │
                    └─────────┬──────────┘
                              ▼
                      ┌───────────────┐
                      │ ALLOW/DENY?   │──DENY──> 403 CDI_ACTION_DENIED
                      └───────┬───────┘
                              ALLOW
                              ▼
                    ┌────────────────────┐
                    │  3. BUSINESS LOGIC │
                    │  - Run job         │
                    │  - Checkpoint      │
                    │  - Write receipts  │
                    └─────────┬──────────┘
                              ▼
                    ┌────────────────────┐
                    │  4. CDI OUTPUT     │
                    │  - Check response  │
                    │  - No personhood   │
                    │  - No leakage      │
                    └─────────┬──────────┘
                              ▼
                      ┌───────────────┐
                      │ Allowed?      │──No──> 403 CDI_OUTPUT_DENIED
                      └───────┬───────┘
                              Yes
                              ▼
                    ┌────────────────────┐
                    │  5. CIF EGRESS     │
                    │  - PII scrubbing   │
                    │  - Size limits     │
                    │  - Audit log       │
                    └─────────┬──────────┘
                              ▼
                      ┌───────────────┐
                      │ Allowed?      │──No──> 403 CIF_EGRESS_DENIED
                      └───────┬───────┘
                              Yes
                              ▼
                    ┌────────────────────┐
                    │  Return Response   │
                    └────────────────────┘
```

### Fail-Closed Guarantees

**ANY governance component failure → 503 Service Unavailable**

- CIF not initialized → 503 GOVERNANCE_NOT_READY
- CDI not initialized → 503 GOVERNANCE_NOT_READY
- Ingress error → 503 CIF_INGRESS_ERROR
- Action check error → 503 CDI_ACTION_ERROR
- Output check error → 503 CDI_OUTPUT_ERROR
- Egress error → 503 EGRESS_ERROR

**NO BYPASS ALLOWED.** Health check (`/health`) is the ONLY endpoint that skips governance.

### API Endpoints

All endpoints require governance approval:

| Method | Endpoint | Purpose | Governance Actions |
|--------|----------|---------|-------------------|
| POST | `/v1/jobs/run` | Start new job | `run_job` |
| GET | `/v1/jobs/:id/status` | Get job status | `get_job_status` |
| POST | `/v1/jobs/:id/resume` | Resume failed job | `resume_job` |
| GET | `/v1/jobs/:id/receipts` | Get audit receipts | `get_job_receipts` |

### Integration with Job System

The server integrates with the existing checkpoint/receipt infrastructure:

1. **Job Execution:** Uses `TiritiAuditJob` from `mathison-jobs`
2. **Checkpoints:** Uses `CheckpointEngine` for resumability
3. **Receipts:** Uses `EventLog` for append-only audit trail
4. **Idempotency:** Hash checks prevent duplicate writes (same as CLI)

**Implementation:** `packages/mathison-server/src/index.ts`

## Extension Points

- **Custom treaty rules** — Extend tiriti.md with project-specific constraints
- **Plugin system** — Add new OI engines or memory backends
- **SDK generation** — Automatic client library creation for new languages

---

**See Also:**
- [docs/cdi-spec.md](./cdi-spec.md) — CDI detailed specification
- [docs/cif-spec.md](./cif-spec.md) — CIF detailed specification
- [docs/tiriti.md](./tiriti.md) — Governance treaty
