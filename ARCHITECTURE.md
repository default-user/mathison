# Architecture

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
- Treaty parser (loads `docs/tiriti.md`)
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

See `THREAT_MODEL.md` for full details.

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

See `DEPLOYMENT.md` for deployment guide.

## Future Architecture

Planned (not yet implemented):

- **Horizontal Scaling:** Multi-replica server with shared storage
- **Receipt Chain:** Cryptographic hash chain for tamper detection
- **Mesh Networking:** Peer-to-peer OI communication with E2E encryption
- **Mobile Sync:** Offline-first mobile app with server sync
- **gRPC API:** Streaming and bidirectional communication
- **Multi-Tenancy:** Isolated genomes per organization

## References

- Governance Treaty: `docs/tiriti.md`
- CDI Specification: `docs/cdi-spec.md`
- CIF Specification: `docs/cif-spec.md`
- Threat Model: `THREAT_MODEL.md`
- Production Requirements: `PRODUCTION_REQUIREMENTS.md`

**Last Updated:** 2025-12-31
