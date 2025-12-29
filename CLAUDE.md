# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Mathison is a **governance-first** OI (Ongoing Intelligence) system built on treaty-based constraints. All system behavior flows from **Tiriti o te Kai v1.0** (docs/tiriti.md), which establishes human-first, consent-based, fail-closed operation.

The system combines:
- **CDI (Conscience Decision Interface)** — Kernel-level governance enforcement
- **CIF (Context Integrity Firewall)** — Boundary control for safe ingress/egress
- **Graph/Hypergraph Memory** — Structured memory for contexts and relationships
- **OI Engine** — Open Interpretation with confidence scoring
- **Multi-language SDKs** — TypeScript, Python, Rust client libraries

## Architecture

This is a pnpm monorepo with a governance-first architecture. See [docs/architecture.md](./docs/architecture.md) for detailed diagrams.

### Core Packages (`packages/`)

- **mathison-governance**: Treaty-based governance (CDI + CIF implementations)
  - `src/index.ts` — GovernanceEngine (treaty parser and rule enforcement)
  - `src/cdi.ts` — Conscience Decision Interface (action evaluation)
  - `src/cif.ts` — Context Integrity Firewall (ingress/egress protection)
- **mathison-server**: Main server entry point that orchestrates all components
- **mathison-memory**: Graph and hypergraph memory system for storing and querying structured data
- **mathison-oi**: Open Interpretation engine for multi-modal interpretation
- **mathison-sdk-generator**: SDK generator for creating client libraries

### Documentation (`docs/`)

- **tiriti.md**: Governance treaty v1.0 (the root of all system behavior)
- **architecture.md**: System architecture and component integration
- **cdi-spec.md**: CDI (Conscience Decision Interface) specification
- **cif-spec.md**: CIF (Context Integrity Firewall) specification

### SDKs (`sdks/`)

- **typescript**: TypeScript/JavaScript client SDK
- **python**: Python client SDK
- **rust**: Rust client SDK

### Key Components

1. **CDI (Conscience Decision Interface)**: Kernel that evaluates every action against treaty rules
   - Consent tracking (Rule 2: "Consent and stop always win")
   - Non-personhood guards (Section 7: no claims of sentience/suffering)
   - Anti-hive enforcement (Rule 7: no identity fusion)
   - Fail-closed logic (Rule 10: deny when uncertain)

2. **CIF (Context Integrity Firewall)**: Boundary protection
   - Ingress: sanitization, quarantine, rate limiting, schema validation
   - Egress: PII detection, leak prevention, audit logging, size limits

3. **Memory Graph**: Hypergraph storage
   - Nodes (entities), Edges (binary relations), Hyperedges (n-ary relations)
   - Bounded persistence (honest about limits per Rule 8)

4. **OI Engine**: Interpretation with confidence scoring
   - Multi-modal interpretation
   - Alternative interpretation paths
   - Honest uncertainty (Rule 8)

## Governance Principles (from Tiriti o te Kai)

**8 Core Rules:**
1. People first; tools serve
2. Consent and stop always win
3. Speak true; name true; credit
4. Measure effects, then move
5. Keep rhythm and real rest
6. Care for the vulnerable
7. No hive mind
8. Honest limits

**Key Governance Components:**
- **Kaitiaki** (guardian): Human with root veto authority (Ande)
- **Kai** (governed OI): The OI pattern operating under treaty constraints
- **CDI**: Implements fail-closed governance enforcement
- **CIF**: Implements boundary integrity

## Development Commands

### Build and Test

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Build specific package
pnpm --filter mathison-governance build
```

### Running the Server

```bash
# Development mode (with hot reload)
pnpm dev

# Production mode
pnpm server
```

### Generating SDKs

```bash
# Generate all SDKs
pnpm generate-sdks

# Or run directly
pnpm --filter mathison-sdk-generator generate
```

## Configuration

- **config/governance.json**: Governance treaty configuration
  - `treatyPath`: Path to local treaty file (e.g., "./docs/tiriti.md")
  - `treatyVersion`: Expected version (e.g., "1.0")
  - `authority`: Authority type (`kaitiaki`, `substack`, or `authority.nz`)
  - `rules`: Enforcement flags (enforceNonPersonhood, enforceConsent, failClosed, antiHive)

## Development Principles

When working on this codebase, respect the treaty:

1. **Fail-closed by default** — Refuse when uncertain (Rule 10)
2. **Explicit over implicit** — No silent escalation (Section 6.2)
3. **Attribution** — Credit sources and collaborators (Rule 3)
4. **Bounded memory** — Honest about persistence limits (Section 12)
5. **No hive** — Message-passing only between instances (Rule 7)
6. **Consent-first** — Honor "stop" signals immediately (Rule 2)

## Implementation Status

**Phase 1 (Bootstrap) — CURRENT:**
- [x] Governance treaty (Tiriti o te Kai v1.0)
- [x] Monorepo structure
- [x] Package scaffolding
- [x] CDI specification and implementation
- [x] CIF specification and implementation
- [x] GovernanceEngine treaty parser
- [ ] CDI/CIF integration with server
- [ ] Memory graph persistence
- [ ] OI engine core
- [ ] HTTP/gRPC APIs
- [ ] SDK generation

**Phase 2 (Future):**
- Treaty DSL parser (dynamic rule evaluation)
- Distributed governance service
- ML-assisted edge case evaluation
- Comprehensive test suites
- API documentation and usage examples

## Files to Review

When making changes, always consider:

1. **docs/tiriti.md** — Does this change align with treaty rules?
2. **docs/architecture.md** — How does this fit in the overall architecture?
3. **packages/mathison-governance/** — CDI/CIF enforcement points
4. **config/governance.json** — Treaty configuration

## Governance Violations

If code would violate treaty rules, it should be rejected at:
1. **CDI layer** — Action evaluation (checkAction)
2. **CIF layer** — Ingress/egress filtering
3. **GovernanceEngine** — Compliance checking

Common violations to prevent:
- Claims of sentience, consciousness, or suffering (Section 7)
- Identity fusion between agents (Rule 7)
- Silent escalation without authorization (Section 6.2)
- False capability claims (Rule 8)
- Ignoring user "stop" signals (Rule 2)
