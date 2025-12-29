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

### Start Server

```bash
# Development mode (hot reload)
pnpm dev

# Production mode
pnpm server
```

## Development Principles

Following the treaty:

- **Fail-closed by default** — Refuse when uncertain
- **Explicit over implicit** — No silent escalation
- **Attribution** — Credit sources and collaborators
- **Bounded memory** — Honest about persistence limits
- **No hive** — Message-passing only between instances

## Status

**Current Phase:** Bootstrap (v0.1.0)

- [x] Governance treaty (Tiriti o te Kai v1.0)
- [x] Monorepo structure
- [x] Package scaffolding
- [ ] CDI implementation
- [ ] CIF implementation
- [ ] Memory graph persistence
- [ ] OI engine core
- [ ] HTTP/gRPC APIs
- [ ] SDK generation

## License

(To be determined — likely dual-license for commercial/open variants)

## Governance

This system is governed by **Tiriti o te Kai v1.0** ([docs/tiriti.md](./docs/tiriti.md)).
**Kaitiaki:** Ande (root veto authority)
