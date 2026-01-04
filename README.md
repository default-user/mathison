# Mathison OI — Governance-First Ongoing Intelligence

**Version:** 1.0.0
**Governance:** Tiriti o te Kai v1.0

## Overview

Mathison is a governance-first OI (Ongoing Intelligence) system built on treaty-based constraints. It combines:

- **Quadratic Monolith (v0.2.0)** — Single-file OI runtime with two-plane architecture and growth ladder
- **Quadratic Bridge (v0.3.0)** — Secure system-side relay for browser OIs with enterprise-grade security
- **Graph/Hypergraph Memory** — Structured memory for contexts and relationships with persistent storage
- **OI Engine** — Local interpretation engine with memory-graph integration
- **Distributed Mesh Protocol** — Privacy-preserving distributed computation with BeamEnvelope messaging
- **Mobile Personal OI** — On-device LLM inference and proximity mesh for Android/iOS
- **CDI (Conscience Decision Interface)** — Kernel-level governance enforcement with stage-based allowlists
- **CIF (Context Integrity Firewall)** — Boundary control for safe ingress/egress with receipt verification
- **Treaty-Based Governance** — Human-first, consent-based, fail-closed operation

## Governance Root

All system behavior flows from **Tiriti o te Kai** ([docs/31-governance/tiriti.md](./docs/31-governance/tiriti.md)), which establishes:

1. **People first; tools serve** — Human authority and dignity lead
2. **Consent and stop always win** — Immediate de-escalation on request
3. **Speak true; name true; credit** — Truthfulness and attribution
4. **Fail-closed** — When uncertain, refuse or narrow scope
5. **No hive mind** — No identity fusion between OI instances
6. **Honest limits** — No false claims about capabilities

## Buyer Quick Eval

**Status:** Prototype / Early Stage — Not production-ready without additional hardening.

**Quick Start:**
```bash
pnpm install && pnpm demo
```

**What you get:**
- Deterministic demo proving governance pipeline works (CIF→CDI→ActionGate→CIF)
- Memory operations with receipts tracing back to signed governance root (Ed25519)
- Idempotency enforcement for safe retries
- Full test suite passing

**Trust Boundaries:**
- All requests pass through mandatory governance hooks (structurally enforced, cannot bypass)
- All write operations generate signed receipts with genome traceability
- Server fails-closed on missing/invalid genome (signature verification on boot)

**Where Governance Lives:**
- Treaty: `docs/31-governance/tiriti.md` (human-readable governance rules)
- Root: `genomes/TOTK_ROOT_v1.0.0/genome.json` (cryptographically signed with Ed25519)
- Enforcement: `packages/mathison-governance/` (CDI + CIF + ActionGate implementation)
- Verification: See `docs/31-governance/governance-claims.md` for strict implementation status table

**Buyer Trust Pack:**
- `LICENSE` — Apache-2.0 (full text)
- `docs/61-operations/provenance.md` — Chain-of-title, AI disclosure, dependency verification
- `docs/70-dev/contributor-certificate.md` — Attestation template for contributors
- `docs/61-operations/security.md` — Vulnerability reporting + security-critical components
- `docs/61-operations/threat-model.md` — Assets, trust boundaries, mitigations (honest about gaps)
- `docs/20-architecture/system-architecture.md` — Monorepo map + governance pipeline diagrams
- `docs/31-governance/governance-claims.md` — Truth table (only marks implemented if code + tests exist)
- `docs/00-start-here/demo.md` — 2-minute quickstart with troubleshooting
- `SBOM.cdx.json` — Software Bill of Materials (CycloneDX format)

**What this is NOT:**
- Not a chat interface (it's a governance-first OI substrate)
- Not production-ready (test genome keys in repo, no rate limiting, single-process only)
- Not feature-complete (see README for roadmap)

**For full evaluation:** See `docs/00-start-here/demo.md` for step-by-step walkthrough.

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

See [docs/20-architecture/system-architecture.md](./docs/20-architecture/system-architecture.md) for details.

## Canonical Product API

The canonical product API is **mathison-server** (port 3000). All SDKs, integrations, and production deployments MUST target this server.

### Server Architecture

| Server | Port | Purpose | Status |
|--------|------|---------|--------|
| **mathison-server** | 3000 | Canonical product API - jobs, memory, governance | **PRODUCTION** |
| kernel-mac | 3001 | Desktop/dev UI backend - beams, chat, llama | DEPRECATED |

### API Specification

The OpenAPI 3.0 specification is the source of truth:
- **Spec file:** `packages/mathison-server/src/openapi.ts`
- **Live endpoint:** `GET /openapi.json`
- **Vendor extension:** `x-mathison-action` on all endpoints for governance metadata

### SDK Generation

SDKs are generated from the mathison-server OpenAPI spec:

```bash
# Generate all SDKs (TypeScript, Python stubs, Rust stubs)
pnpm generate-sdks
```

### API Drift Prevention

To prevent API drift between servers/SDKs:

1. **Single source of truth:** All routes defined in `mathison-server/src/openapi.ts`
2. **Governance metadata:** Every route MUST have `x-mathison-action` specifying action type and risk class
3. **Fail-closed enforcement:** Routes without declared actions are denied at runtime
4. **SDK regeneration:** Any API change requires SDK regeneration from OpenAPI

## Monorepo Structure

```
mathison/
├── docs/
│   ├── 00-start-here/             # Getting started guides
│   ├── 10-vision/                 # Vision and roadmap
│   ├── 20-architecture/           # System architecture
│   ├── 31-governance/             # Governance specs (tiriti, CDI, CIF)
│   ├── 40-apis/                   # API documentation
│   ├── 45-integrations/           # Third-party integrations
│   ├── 50-mesh/                   # Mesh networking
│   ├── 60-mobile/                 # Mobile deployment
│   ├── 61-operations/             # Operations and security
│   ├── 70-dev/                    # Development workflows
│   ├── 80-reference/              # Reference materials
│   ├── 90-proposals/              # Feature proposals
│   └── 95-adr/                    # Architecture Decision Records
├── packages/
│   ├── mathison-server/       # CANONICAL PRODUCT API (port 3000)
│   ├── mathison-kernel-mac/   # [DEPRECATED] Desktop UI backend (port 3001)
│   ├── mathison-governance/   # CDI + treaty enforcement
│   ├── mathison-memory/       # Graph/hypergraph memory
│   ├── mathison-storage/      # Persistent storage (FILE/SQLITE)
│   ├── mathison-oi/           # Interpretation engine
│   ├── mathison-mesh/         # Distributed mesh protocol + ModelBus
│   ├── mathison-mobile/       # Mobile components (React Native)
│   ├── mathison-quadratic/    # Single-file OI runtime (v0.2.0)
│   ├── mathison-genome/       # Genome verification + build manifest
│   └── mathison-sdk-generator/ # Multi-language SDK generation
├── quadratic-bridge.mjs       # Secure bridge server (v0.3.0)
├── quadratic.html             # Browser bootstrap UI
├── quad.js                    # Compiled browser bundle
├── BRIDGE.md                  # Bridge documentation
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

Governance settings:

- `MATHISON_ENV` — Environment: `production` or `development` (affects defaults)
- `MATHISON_STRICT_PERSISTENCE` — Fail request on persistence errors: `1` (enabled) or `0` (disabled)
  - Default: enabled in production (`MATHISON_ENV=production`), disabled in development
- `MATHISON_VERIFY_MANIFEST` — Verify build manifest on startup: `1` (enabled) or `0` (disabled)

Optional for LLM integration:

- `GITHUB_TOKEN` — GitHub token for Models API (free tier: 15 req/min, 150 req/day)
- `ANTHROPIC_API_KEY` — Anthropic API key (fallback if GitHub Models unavailable)

Example:
```bash
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data
export MATHISON_ENV=production          # Enable strict mode defaults
export GITHUB_TOKEN=ghp_your_token_here  # For free LLM access
```

**LLM Provider Priority:** GitHub Models → Anthropic → Local Fallback

See [docs/45-integrations/github-models-setup.md](./docs/45-integrations/github-models-setup.md) for complete setup guide.

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
  - Body: `{ jobType: string, inputs?: any, policyId?: string, jobId?: string }`
  - Returns: `{ job_id, status, result? }`

- `GET /jobs/status?job_id=<id>` — Query job status
  - Query params: `job_id` (optional - omit to list all), `limit` (optional)
  - Returns: `{ job_id, status, result?, stage?, error? }`

- `POST /jobs/resume` — Resume a paused/failed job (idempotent)
  - Body: `{ job_id: string }`
  - Returns: `{ job_id, status, result? }`

- `GET /jobs/logs?job_id=<id>` — Retrieve governance receipts for a job
  - Query params: `job_id` (required), `limit` (optional)
  - Returns: `{ job_id, count, receipts: [...] }`

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

## Mobile Deployment

Mathison includes mobile-first components for building personal OI companions on Android and iOS devices.

### mathison-mobile Package

React Native compatible package providing:

- **MobileModelBus** — On-device LLM inference (Gemini Nano via Android AICore, llama.cpp fallback)
- **MobileGraphStore** — Mobile persistence (AsyncStorage for key-value, SQLite for structured queries)
- **MobileMeshCoordinator** — Proximity-based mesh formation using Android Nearby Connections API

### Quick Start (React Native)

```bash
# Install mobile package
npm install mathison-mobile

# Install React Native dependencies
npm install @react-native-async-storage/async-storage
npm install react-native-sqlite-storage
npm install react-native-nearby-connections
```

```typescript
import { NativeModules } from 'react-native';
import { MobileModelBus, MobileGraphStore } from 'mathison-mobile';
import { MemoryGraph } from 'mathison-memory';
import { OIEngine } from 'mathison-oi';

// Initialize on-device inference
const modelBus = new MobileModelBus(NativeModules);
await modelBus.initialize();

// Initialize mobile storage
const graphStore = new MobileGraphStore('sqlite', NativeModules);
await graphStore.initialize();

// Create memory graph with mobile persistence
const memoryGraph = new MemoryGraph(graphStore);
await memoryGraph.initialize();

// Create OI engine
const oiEngine = new OIEngine({ memoryGraph });
await oiEngine.initialize();

// Chat with your personal OI
const response = await modelBus.inference('Explain quantum computing', {
  maxTokens: 512,
  temperature: 0.7,
});
```

### Documentation

- **Architecture & Strategy:** [docs/60-mobile/mobile-deployment.md](./docs/60-mobile/mobile-deployment.md)
- **React Native Implementation:** [docs/60-mobile/react-native-app-guide.md](./docs/60-mobile/react-native-app-guide.md)
- **Mobile Package README:** [packages/mathison-mobile/README.md](./packages/mathison-mobile/README.md)

### Privacy-First Mobile Design

- **100% on-device inference** — No cloud dependencies (Gemini Nano or llama.cpp)
- **Local-first storage** — All memory persisted on device
- **Consent-based mesh** — Explicit user approval for proximity connections
- **No identity fusion** — Each device maintains sovereign OI instance

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

**Current Phase:** Production Ready (v1.0.0 — Stable Release)

## Recent Major Features

### Quadratic Monolith (v0.2.0)
- Single-file OI runtime (1377 lines, zero dependencies)
- Two-plane architecture: Meaning (governance) + Capability (execution)
- Growth ladder: WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA
- Receipt hash chain with tamper detection
- LLM, Mesh, and Orchestra adapters
- CLI: `pnpm quad:selftest`

### Quadratic Bridge (v0.3.0 - Secure)
- System-side HTTP relay for browser OIs
- API key authentication with constant-time comparison
- CORS origin allowlist (no wildcards)
- Action allowlist with risk levels (LOW/MEDIUM/HIGH/CRITICAL)
- Rate limiting: 100 req/min per client
- Audit logging with structured JSON
- System actions disabled by default
- Start: `BRIDGE_API_KEY=$(openssl rand -hex 32) npx tsx quadratic-bridge.mjs`

### Browser Bootstrap
- Interactive HTML UI (`quadratic.html`)
- Live OI status display
- Bridge connection with API key support
- Example actions for all stages
- Open: `open quadratic.html`

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
- [x] **P7-A:** Mobile package foundation (MobileModelBus, MobileGraphStore, MobileMeshCoordinator)

### Upcoming

- [ ] **P7-B:** React Native app implementation with native modules (Gemini Nano, llama.cpp)
- [ ] **P7-C:** Google Play Store deployment ($365/year subscription)
- [ ] **P8:** Mesh discovery protocols (proximity-based, broadcast, manual)
- [ ] **P9:** End-to-end encryption for mesh communication
- [ ] **P10:** SDK generation for TypeScript/Python/Rust
- [ ] **P11:** gRPC APIs and streaming support

## License

(To be determined — likely dual-license for commercial/open variants)

## Governance

This system is governed by **Tiriti o te Kai v1.0** ([docs/31-governance/tiriti.md](./docs/31-governance/tiriti.md)).
**Kaitiaki:** Ande (root veto authority)
