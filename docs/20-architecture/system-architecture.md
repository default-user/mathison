# System Architecture

## Who This Is For

- **System architects** evaluating Mathison's governance-first design
- **Backend developers** implementing or extending core server components
- **Security engineers** auditing the enforcement pipeline
- **DevOps teams** deploying Mathison in production environments
- **Contributors** understanding the monorepo package structure

## Why This Exists

Mathison is intentionally designed as a governance-first system where all operations must pass through mandatory gates. This document provides the authoritative map of how requests flow through CIF/CDI enforcement, how packages interact, and where critical security boundaries exist. Without this architectural foundation, it would be unclear how treaty rules are actually enforced at runtime.

## Guarantees / Invariants

**Structural:**
- Every HTTP request MUST pass through CIF ingress → CDI pre-check → handler → ActionGate (writes) → CDI output check → CIF egress
- Hooks are registered at server boot and cannot be removed during runtime
- ActionGate is the ONLY path to storage writes (no code path can bypass it)
- Denial at any governance stage halts the pipeline immediately (fail-closed)

**Operational:**
- Genome signature is verified once at boot using Ed25519
- All mutations generate receipts with `genome_id`, `timestamp`, `action`, `decision`, `policy_id`
- Storage backends (FILE/SQLite) pass identical conformance tests
- Idempotency keys prevent duplicate execution of write operations

**Performance:**
- CIF/CDI pipeline adds 1-5ms latency per request (measured on dev machine)
- ActionGate receipt generation: ~0.5ms (FILE), ~1ms (SQLite)

## Non-Goals

- Horizontal scaling across multiple server instances (single-process design for now)
- Generic API gateway functionality (governance-specific, not general-purpose)
- Zero-overhead operation (governance has intentional cost)
- Multi-tenancy with isolated genomes per organization (planned, not implemented)

---

## Overview

Mathison is a governance-first Ongoing Intelligence (OI) system built on treaty-based constraints. It combines structured memory (graph/hypergraph), interpretation engines, and distributed mesh protocols under a mandatory governance pipeline.

**Core Principle:** All operations pass through governance gates. Bypass is structurally prevented.

## System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Mathison Server                            │
│                         (Fastify HTTP)                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  CIF (Context Integrity Firewall)                           │ │
│  │  ├─ Ingress: sanitize, validate, size limits               │ │
│  │  └─ Egress: leakage control, response limits               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  CDI (Conscience Decision Interface)                        │ │
│  │  ├─ Treaty parser (Tiriti o te Kai)                        │ │
│  │  ├─ Capability ceiling checks                              │ │
│  │  ├─ Consent validation                                     │ │
│  │  └─ ActionGate (side effect chokepoint)                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                    │
│  ┌───────────────────┬──────────────────┬──────────────────────┐ │
│  │   OI Engine       │  Memory Graph    │  Job Orchestration  │ │
│  │  (Interpretation) │ (Nodes/Edges/    │  (Run/Status/Resume)│ │
│  │                   │  Hyperedges)     │                      │ │
│  └───────────────────┴──────────────────┴──────────────────────┘ │
│                              ↓                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Storage Layer (Backend Abstraction)                        │ │
│  │  ├─ FILE: JSON files + directories                         │ │
│  │  └─ SQLite: better-sqlite3 with WAL mode                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│  Governance Root: Memetic Genome (Ed25519 signed)                │
│  Location: genomes/TOTK_ROOT_v1.0.0/genome.json                  │
└──────────────────────────────────────────────────────────────────┘
```

## Governance Pipeline (Request Flow)

Every HTTP request follows this mandatory path:

```
HTTP Request
    ↓
┌───────────────────────────┐
│ 1. CIF Ingress            │ ← Fastify onRequest hook
│    - Validate size        │
│    - Sanitize input       │
│    - Quarantine untrusted │
└───────────────────────────┘
    ↓
┌───────────────────────────┐
│ 2. CDI Action Check       │ ← Fastify preHandler hook
│    - Load genome          │
│    - Evaluate treaty      │
│    - Check capabilities   │
│    - Decide: ALLOW/DENY   │
└───────────────────────────┘
    ↓
┌───────────────────────────┐
│ 3. Handler Execution      │
│    - Read: direct access  │
│    - Write: via ActionGate│
└───────────────────────────┘
    ↓
┌───────────────────────────┐
│ 4. ActionGate (Writes)    │ ← Mandatory for mutations
│    - Generate receipt     │
│    - Store mutation       │
│    - Return w/ receipt    │
└───────────────────────────┘
    ↓
┌───────────────────────────┐
│ 5. CDI Output Check       │ ← Fastify onSend hook
│    - Validate response    │
│    - Check for leaks      │
└───────────────────────────┘
    ↓
┌───────────────────────────┐
│ 6. CIF Egress             │ ← Fastify onSend hook
│    - Size limits          │
│    - Final boundary check │
└───────────────────────────┘
    ↓
HTTP Response (with receipt if write)
```

**Key Enforcement:**
- Hooks are registered at server boot (cannot be removed)
- All routes added after hooks are in place
- ActionGate is the ONLY path to storage writes
- Denial at any stage halts the pipeline (fail-closed)

## Monorepo Package Map

```
mathison/
├── packages/
│   ├── mathison-server/          # Fastify orchestration + HTTP API
│   │   ├─ src/index.ts            # Server bootstrap
│   │   ├─ src/routes/             # Endpoint handlers
│   │   └─ dist/                   # Compiled output
│   │
│   ├── mathison-governance/       # CDI + CIF + treaty enforcement
│   │   ├─ src/cdi.ts              # CDI implementation
│   │   ├─ src/cif.ts              # CIF implementation
│   │   ├─ src/action-gate.ts      # Side effect chokepoint
│   │   └─ src/treaty-parser.ts    # Parse tiriti.md rules
│   │
│   ├── mathison-genome/           # Memetic genome system
│   │   ├─ src/genome-loader.ts    # Load + verify Ed25519 signature
│   │   ├─ src/genome-types.ts     # TypeScript types
│   │   └─ src/genome-validator.ts # Schema validation
│   │
│   ├── mathison-memory/           # Graph/hypergraph memory
│   │   ├─ src/memory-graph.ts     # Node/edge/hyperedge logic
│   │   ├─ src/search.ts           # Text search
│   │   └─ src/traversal.ts        # Graph traversal
│   │
│   ├── mathison-storage/          # Backend abstraction
│   │   ├─ src/storage-interface.ts # Abstract interface
│   │   ├─ src/file-backend.ts     # FILE implementation
│   │   ├─ src/sqlite-backend.ts   # SQLite implementation
│   │   └─ tests/conformance.test.ts # Backend swap tests
│   │
│   ├── mathison-oi/               # OI engine (interpretation)
│   │   ├─ src/oi-engine.ts        # Main engine
│   │   ├─ src/intent-detector.ts  # Intent classification
│   │   └─ src/confidence-scorer.ts# Confidence metrics
│   │
│   ├── mathison-mesh/             # Distributed mesh protocol
│   │   ├─ src/mesh-coordinator.ts # Task distribution
│   │   ├─ src/model-bus.ts        # LLM abstraction
│   │   └─ src/beam-envelope.ts    # Privacy-preserving messages
│   │
│   ├── mathison-mobile/           # Mobile-specific components
│   │   ├─ src/mobile-model-bus.ts # On-device inference
│   │   ├─ src/mobile-graph-store.ts # Mobile persistence
│   │   └─ src/mobile-mesh.ts      # Proximity mesh
│   │
│   ├── mathison-quadratic/        # Single-file OI runtime
│   │   └─ quadratic.js            # 1377-line monolith (v0.2.0)
│   │
│   ├── mathison-ui/               # User interface components
│   │   └─ src/                    # React/UI code
│   │
│   ├── mathison-kernel-mac/       # macOS native integration
│   │   └─ src/                    # Swift/Objective-C bindings
│   │
│   └── mathison-sdk-generator/    # Multi-language SDK generation
│       └─ src/                    # Code generation logic
│
├── sdks/                          # Generated SDKs
│   ├── typescript/                # TS/JS SDK
│   ├── python/                    # Python SDK (planned)
│   └── rust/                      # Rust SDK (planned)
│
├── scripts/                       # Build/deploy/demo scripts
│   ├── bootstrap-mathison.sh      # Full system bootstrap
│   ├── genome-keygen.ts           # Generate genome signing keys
│   ├── genome-sign.ts             # Sign genome with private key
│   ├── genome-verify.ts           # Verify genome signature
│   └── demo.mjs                   # Quickstart demo script
│
├── genomes/                       # Memetic genomes
│   └── TOTK_ROOT_v1.0.0/
│       ├── genome.json            # Signed genome
│       ├── key.pub                # Public key (dev only)
│       └── key.priv               # Private key (dev only, NEVER prod)
│
├── docs/                          # Specifications + guides
│   ├── tiriti.md                  # Governance treaty (v1.0)
│   ├── architecture.md            # (this file)
│   ├── cdi-spec.md                # CDI specification
│   ├── cif-spec.md                # CIF specification
│   └── mobile-deployment.md       # Mobile architecture
│
└── config/                        # Configuration files
    └── governance.json            # Treaty configuration
```

## Key Boundaries

### CIF (Context Integrity Firewall)

**Responsibility:** Boundary control for ingress/egress

**Ingress (onRequest):**
- Request size validation (1MB default)
- Input sanitization
- CORS enforcement
- Quarantine untrusted data

**Egress (onSend):**
- Response size validation (1MB default)
- Leakage detection
- Receipt inclusion (for writes)

**Code Location:** `packages/mathison-governance/src/cif.ts`

### CDI (Conscience Decision Interface)

**Responsibility:** Governance decision-making

**Components:**
- Treaty parser (loads `docs/31-governance/tiriti.md`)
- Genome loader (verifies Ed25519 signature)
- Capability ceiling checks
- Consent signal validation
- ActionGate (side effect chokepoint)

**Decision Outputs:**
- `ALLOW` — Proceed with action
- `DENY` — Halt with reason code (17 locked codes)
- `UNCERTAIN` — Deny if `strictMode: true` (default)

**Code Location:** `packages/mathison-governance/src/cdi.ts`

### ActionGate

**Responsibility:** Ensure all mutations generate receipts

**Workflow:**
1. Handler calls `actionGate.execute(action, context)`
2. ActionGate generates receipt with:
   - `genome_id` / `genome_version`
   - `timestamp`
   - `action` description
   - `decision` (ALLOW/DENY)
   - `policy_id` (which rule triggered)
3. ActionGate calls storage backend
4. Returns result + receipt

**Code Location:** `packages/mathison-governance/src/action-gate.ts`

**Critical Invariant:** NO code path can mutate storage without going through ActionGate.

### Memory Graph

**Responsibility:** Structured memory (nodes/edges/hyperedges)

**Entities:**
- **Nodes:** `{ id, type, data, metadata }`
- **Edges:** `{ from, to, type, metadata }`
- **Hyperedges:** `{ id, nodes[], type, metadata }`

**Operations:**
- Read: `getNode`, `getEdges`, `search`
- Write: `createNode`, `createEdge` (via ActionGate)

**Code Location:** `packages/mathison-memory/src/memory-graph.ts`

### Storage Layer

**Responsibility:** Persistence abstraction (swap-ready backends)

**Backends:**
- **FILE:** JSON files in directory structure
  - Nodes: `./data/nodes/{id}.json`
  - Edges: `./data/edges/{from}_{to}_{type}.json`
  - Receipts: `./data/receipts/{receipt_id}.json`

- **SQLite:** better-sqlite3 with WAL mode
  - Tables: `nodes`, `edges`, `hyperedges`, `receipts`
  - Indexes: `id`, `type`, `from`, `to`

**Conformance Tests:** Both backends pass identical test suite (`mathison-storage/tests/conformance.test.ts`)

**Code Location:** `packages/mathison-storage/src/`

## Data Flow Example (Write Operation)

```
User: POST /memory/nodes { type: "person", data: {name: "Alice"}, idempotency_key: "abc123" }
    ↓
CIF Ingress: Validate request size, sanitize input
    ↓
CDI Action Check: Load genome, evaluate treaty rule "allow_memory_write"
    ↓
Handler: /memory/nodes route handler
    ↓
ActionGate:
    - Check idempotency (has "abc123" been seen?)
    - If new: generate receipt, call storage.createNode()
    - If duplicate: return cached response (idempotent)
    ↓
Storage Backend (FILE or SQLite):
    - Write node to storage
    - Write receipt to storage
    ↓
CDI Output Check: Validate response structure, check for leaks
    ↓
CIF Egress: Size check, final boundary validation
    ↓
Response: { node: {...}, created: true, receipt: {...} }
```

## Extension Points

### Adding a New Route

1. Register route in `packages/mathison-server/src/routes/`
2. Hooks are already applied (CIF/CDI run automatically)
3. For writes: call `actionGate.execute(action, context)`
4. For reads: access storage directly (still governed, just no receipt)
5. Add tests that verify governance pipeline is active

### Adding a New Storage Backend

1. Implement `StorageInterface` from `packages/mathison-storage/src/storage-interface.ts`
2. Run conformance tests (`tests/conformance.test.ts`)
3. Update server to support new backend type
4. Document failure modes and performance characteristics

### Adding a New Governance Rule

1. Edit genome JSON (`genomes/TOTK_ROOT_v1.0.0/genome.json`)
2. Add rule to `policies` array
3. Re-sign genome: `pnpm tsx scripts/genome-sign.ts genomes/TOTK_ROOT_v1.0.0/genome.json genomes/TOTK_ROOT_v1.0.0/key.priv`
4. Verify signature: `pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json`
5. Restart server (loads genome on boot)

## Technology Stack

| Component | Technology | Version | License |
|-----------|------------|---------|---------|
| Server | Fastify | 4.26+ | MIT |
| Language | TypeScript | 5.3+ | Apache-2.0 |
| Runtime | Node.js | 18+ | MIT |
| Package Manager | pnpm | 8+ | MIT |
| Storage (SQL) | better-sqlite3 | 9.6+ | MIT |
| Crypto | Node.js crypto (Ed25519) | built-in | MIT |
| Testing | Jest | 29.7+ | MIT |
| Mobile | React Native | 0.83+ | MIT |

## Performance Characteristics

**Governance Overhead:**
- CIF/CDI pipeline adds ~1-5ms latency per request (measured on dev machine)
- ActionGate receipt generation: ~0.5ms (FILE), ~1ms (SQLite)

**Storage:**
- FILE backend: O(1) writes, O(n) scans (no indexes)
- SQLite backend: O(log n) indexed lookups, O(1) inserts

**Scalability:**
- Single-process server (no horizontal scaling yet)
- SQLite supports ~1M receipts before performance degrades
- FILE backend suitable for <10k nodes

**Bottlenecks:**
- Genome loading on boot (Ed25519 verify: ~1ms)
- Receipt generation (synchronous, blocks writes)
- SQLite write lock contention (WAL mode mitigates)

## Security Assumptions

See `docs/61-operations/threat-model.md` for full details.

**Critical Assumptions:**
1. Genome signing keys are stored securely (HSM in production)
2. Filesystem permissions prevent unauthorized genome modification
3. Node.js crypto library correctly implements Ed25519
4. Fastify hooks cannot be disabled or bypassed
5. Operator is trustworthy (no insider threat mitigation)

## Deployment Topology

**Development:**
```
Developer Machine
├─ Node.js process (mathison-server)
├─ Storage: FILE (./data/)
├─ Genome: Test keys (public in repo)
└─ LLM: GitHub Models (free tier)
```

**Production (Recommended):**
```
Kubernetes Cluster
├─ mathison-server pod (replicas: 1, for now)
├─ Storage: SQLite (persistent volume) OR managed DB
├─ Genome: ConfigMap with signature, keys in Secret Manager
├─ LLM: Anthropic API OR self-hosted
└─ Receipts: Exported to S3 with object lock
```

See `docs/61-operations/deployment.md` for deployment guide.

## Future Architecture

Planned (not yet implemented):

- **Horizontal Scaling:** Multi-replica server with shared storage
- **Receipt Chain:** Cryptographic hash chain for tamper detection
- **Mesh Networking:** Peer-to-peer OI communication with E2E encryption
- **Mobile Sync:** Offline-first mobile app with server sync
- **gRPC API:** Streaming and bidirectional communication
- **Multi-Tenancy:** Isolated genomes per organization

## References

- Governance Treaty: `docs/31-governance/tiriti.md`
- CDI Specification: `docs/31-governance/cdi-spec.md`
- CIF Specification: `docs/31-governance/cif-spec.md`
- Threat Model: `docs/61-operations/threat-model.md`
- Production Requirements: `docs/61-operations/production-requirements.md`

**Last Updated:** 2025-12-31

---

## How to Verify

**Governance Pipeline:**
```bash
# Verify hooks are registered in correct order
cd packages/mathison-server
grep -A 10 "onRequest\|preHandler\|onSend" src/index.ts

# Check that genome signature verifies
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Test that writes generate receipts
curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":{},"idempotency_key":"verify-test"}'
# Response should include receipt object
```

**ActionGate Enforcement:**
```bash
# Verify no direct storage access exists
cd packages/mathison-server
grep -r "storage\.\(createNode\|createEdge\|deleteNode\)" src/routes/
# Should only find calls through actionGate.execute()
```

**Storage Backend Conformance:**
```bash
# Run conformance tests for both backends
cd packages/mathison-storage
pnpm test tests/conformance.test.ts
```

**Performance Benchmarks:**
```bash
# Measure governance overhead
cd packages/mathison-server
pnpm tsx scripts/benchmark-pipeline.ts
# Should report CIF+CDI latency under 5ms
```

## Implementation Pointers

**Adding CIF/CDI to new endpoints:**
- Location: `packages/mathison-server/src/index.ts`
- Hooks are registered globally, apply to all routes automatically
- No per-route registration needed

**Implementing a custom storage backend:**
- Interface: `packages/mathison-storage/src/storage-interface.ts`
- Required methods: `createNode`, `getNode`, `createEdge`, `getEdges`, `createReceipt`, `getReceipts`
- Test suite: `packages/mathison-storage/tests/conformance.test.ts`
- Example: See `file-backend.ts` or `sqlite-backend.ts`

**Extending the governance treaty:**
- File: `genomes/TOTK_ROOT_v1.0.0/genome.json`
- Add policies to `policies` array with structure: `{id, condition, action}`
- Re-sign genome after modification using `scripts/genome-sign.ts`
- CDI evaluates policies in order, first match wins

**Debugging receipt chain:**
- Receipts stored in: `./data/receipts/` (FILE) or `receipts` table (SQLite)
- Each receipt contains: `genome_id`, `genome_version`, `timestamp`, `action`, `decision`, `policy_id`
- Retrieve job receipts: `curl "http://localhost:3000/jobs/logs?job_id=<job_id>"`

**Key source files:**
- Server bootstrap: `packages/mathison-server/src/index.ts`
- CIF implementation: `packages/mathison-governance/src/cif.ts`
- CDI implementation: `packages/mathison-governance/src/cdi.ts`
- ActionGate implementation: `packages/mathison-governance/src/action-gate.ts`
- Memory graph: `packages/mathison-memory/src/memory-graph.ts`
- Storage interface: `packages/mathison-storage/src/storage-interface.ts`
