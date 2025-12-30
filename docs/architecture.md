# Mathison OI — System Architecture

**Version:** 0.9.0
**Governance:** Tiriti o te Kai v1.0

## Overview

Mathison is a governance-first distributed OI system with four core layers:

1. **Governance Layer** (CDI + CIF) — Treaty-based constraints
2. **Intelligence Layer** (OI Engine + Memory Graph) — Local interpretation and context
3. **Mesh Layer** (ModelBus + MeshCoordinator) — Distributed LLM inference kernel with GitHub Models API
4. **Interface Layer** (Server + SDKs + Quadratic Bridge) — API surface with browser and mobile support

## Architectural Diagram

### Single Node (Personal OI)

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
        │         Mesh Layer (Kernel)       │
        │  ┌────────────────────────────┐   │
        │  │  ModelBus                  │   │
        │  │  - Inference routing       │   │
        │  │  - Load balancing          │   │
        │  │  - Ensemble synthesis      │   │
        │  ├────────────────────────────┤   │
        │  │  MeshCoordinator           │   │
        │  │  - Mesh formation          │   │
        │  │  - Node discovery          │   │
        │  │  - Task distribution       │   │
        │  └────────────────────────────┘   │
        └──────────────┬───────────────────┘
                       │
        ┌──────────────┴────────────────┐
        ▼                                ▼
┌──────────────────────┐     ┌──────────────────────┐
│  OI Engine           │     │  Memory Graph        │
│  ┌────────────────┐  │     │  ┌────────────────┐  │
│  │ Local inference│  │     │  │ Nodes/Edges    │  │
│  │ Intent detect  │  │     │  │ Hyperedges     │  │
│  │ Context query  │  │     │  │ Persistence    │  │
│  └────────────────┘  │     │  │ (FILE/SQLITE)  │  │
└──────────────────────┘     │  └────────────────┘  │
                             └──────────────────────┘
```

### Distributed Mesh (Room-Scale)

```
   ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
   │  Node A     │       │  Node B     │       │  Node C     │
   │  (Phone 1)  │◄─────►│  (Phone 2)  │◄─────►│  (Phone 3)  │
   └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
          │                     │                     │
          │    ModelBus mesh communication            │
          │         (inference routing)               │
          └─────────────────────┼─────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Structural          │
                    │  Generative          │
                    │  Synthesis           │
                    │                      │
                    │  - Ensemble N models │
                    │  - Compositional     │
                    │  - Quality aggregate │
                    └──────────────────────┘

Each node runs:
  - Personal OI (local memory + interpretation)
  - ModelBus (inference routing kernel)
  - MeshCoordinator (task distribution)
  - Governance (CDI/CIF enforcement)

Privacy-preserving:
  - No raw memory sharing between nodes
  - Encrypted inference requests
  - Consent-based mesh participation
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

### ModelBus (The Kernel)

**Purpose:** Distributed LLM inference routing and structural generative synthesis

**Core Functions:**
1. **Model Registry** — Track available models (text, embedding, vision, multimodal)
2. **Node-Model Mapping** — Which models are available on which nodes
3. **Inference Routing** — Intelligent routing based on load, latency, quality
4. **Ensemble Synthesis** — Compositional generation across multiple models
5. **Load Balancing** — Distribute requests across available nodes

**Routing Strategy:**
- **Model preference** — Route to preferred model if available
- **Fallback** — Degrade to alternative model if allowed
- **Load-aware** — Prefer nodes with lower queue depth
- **Latency-aware** — Route to lowest-latency node meeting requirements
- **Diversity** — For ensemble, prefer different model types

**Structural Synthesis:**
```
Ensemble Request (N=3)
    ↓
Select 3 diverse models across mesh
    ↓
┌─────────┬─────────┬─────────┐
│ Model A │ Model B │ Model C │
│ Node 1  │ Node 2  │ Node 3  │
└─────────┴─────────┴─────────┘
    │         │         │
    └─────────┼─────────┘
              ↓
    Compositional Synthesis
    - Merge outputs
    - Quality aggregation
    - Contributor tracking
              ↓
        Final Result
```

**Implementation:** `packages/mathison-mesh/src/model-bus.ts`

### MeshCoordinator

**Purpose:** Distributed task orchestration and mesh lifecycle

**Core Functions:**
1. **Mesh Formation** — Create computational mesh with privacy controls
2. **Node Discovery** — Find nearby nodes (proximity, broadcast, manual)
3. **Task Distribution** — Route generic tasks across mesh
4. **Mesh Dissolution** — Clean teardown with no residual state

**Privacy Controls:**
- **Encryption requirement** — Enforce end-to-end encryption
- **Node allowlist** — Restrict mesh to trusted nodes only
- **Data sharing consent** — No raw memory sharing without explicit opt-in
- **Anti-hive enforcement** — No identity fusion between nodes

**Implementation:** `packages/mathison-mesh/src/index.ts`

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

### Distributed Inference: "Ensemble synthesis across mesh"

```
1. Client requests inference with ensemble synthesis
   ↓
2. Server receives request
   ↓
3. CIF/CDI governance checks
   ↓
4. ModelBus.synthesize(request, ensemble=3)
   ↓
5. Select 3 diverse models across mesh:
   ┌────────────────┬────────────────┬────────────────┐
   │ Node A         │ Node B         │ Node C         │
   │ Model: GPT-4   │ Model: Claude  │ Model: Llama   │
   │ Load: 20%      │ Load: 35%      │ Load: 10%      │
   └────────────────┴────────────────┴────────────────┘
   ↓
6. Parallel inference execution:
   ┌────────────────┬────────────────┬────────────────┐
   │ Execute on A   │ Execute on B   │ Execute on C   │
   │ Result A       │ Result B       │ Result C       │
   │ Quality: 0.87  │ Quality: 0.91  │ Quality: 0.84  │
   └────────────────┴────────────────┴────────────────┘
   ↓
7. Compositional Synthesis:
   - Merge outputs structurally
   - Aggregate quality: (0.87 + 0.91 + 0.84) / 3 = 0.87
   - Track contributors: [Node A, Node B, Node C]
   - Preserve diversity signals
   ↓
8. CDI.checkOutput(synthesized_result)
   ↓
9. CIF.egress() — final boundary check
   ↓
10. Return synthesized result with metadata:
    {
      output: <compositional_synthesis>,
      quality: 0.87,
      contributors: ["GPT-4", "Claude", "Llama"],
      nodes: ["Node A", "Node B", "Node C"]
    }
```

**Key Properties:**
- Each node maintains local memory (no sharing)
- Inference requests encrypted in transit
- Quality-based result weighting
- Contributor attribution preserved
- Governance enforced at coordination node

## Governance Integration Points

Every component respects treaty rules:

| Component | Treaty Enforcement |
|-----------|-------------------|
| **CIF** | Boundary enforcement, leakage prevention |
| **CDI** | Core governance logic, fail-closed kernel |
| **OI Engine** | Honest uncertainty, no false confidence |
| **Memory** | Bounded persistence, no covert cross-instance sharing |
| **ModelBus** | No hive mind, explicit routing consent, quality honesty |
| **MeshCoordinator** | Privacy controls, node allowlisting, mesh consent |
| **Server** | Consent tracking, immediate stop on request |

## Deployment Model

### Single Node (Personal OI)

**Current deployment:** One Mathison instance per device (phone, laptop, server)

**Components:**
- Mathison Server (HTTP/gRPC)
- Governance layer (CDI + CIF)
- OI Engine (local inference)
- Memory Graph (FILE or SQLITE persistence)
- ModelBus (local models + mesh-ready)
- MeshCoordinator (dormant until mesh formed)

**Use cases:**
- Personal AI companion
- Offline-capable intelligence
- Private memory and context
- Local-first architecture

### Distributed Mesh (Room-Scale)

**Deployment:** Multiple Mathison nodes forming computational mesh

**Topology:**
```
Personal Node 1 ←→ Personal Node 2 ←→ Personal Node 3
       ↓                   ↓                   ↓
   ModelBus mesh communication (inference routing)
       ↓                   ↓                   ↓
       └───────────────────┴───────────────────┘
                           ↓
              Structural Generative Synthesis
```

**Components per node:**
- Full Mathison stack (personal OI)
- ModelBus (active mesh participation)
- MeshCoordinator (mesh lifecycle management)
- Local models (contribution to ensemble)

**Privacy guarantees:**
- No raw memory sharing between nodes
- Encrypted inference requests
- Consent-based mesh formation
- Automatic dissolution (no persistent mesh state)
- Anti-hive enforcement (no identity fusion)

**Use cases:**
- Conference room super-computing
- Team collaboration with pooled resources
- Emergency compute scaling
- Privacy-preserving distributed inference

## Security Model

1. **Fail-closed by default** — Deny when uncertain
2. **Least privilege** — Minimal capabilities per component
3. **Audit everything** — Log all governance decisions
4. **No silent escalation** — Explicit authorization required
5. **Bounded memory** — Clear persistence limits

## Extension Points

- **Custom treaty rules** — Extend tiriti.md with project-specific constraints
- **Plugin system** — Add new OI engines or memory backends
- **SDK generation** — Automatic client library creation for new languages

---

**See Also:**
- [docs/cdi-spec.md](./cdi-spec.md) — CDI detailed specification
- [docs/cif-spec.md](./cif-spec.md) — CIF detailed specification
- [docs/tiriti.md](./tiriti.md) — Governance treaty
