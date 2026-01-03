# Mathison Documentation

**Version:** 1.0.0
**Governance:** Tiriti o te Kai v1.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- **Evaluators**: Buyers, technical reviewers, and security auditors assessing Mathison for adoption
- **Developers**: Engineers integrating with or extending the Mathison platform
- **Operators**: Teams deploying and maintaining Mathison in production environments
- **Contributors**: Open-source contributors understanding the architecture and governance model

## Why This Exists

This documentation provides a comprehensive reference for understanding, deploying, and extending Mathison—a governance-first Ongoing Intelligence (OI) system built on treaty-based constraints. Every document follows a consistent structure that emphasizes operational invariants, verification steps, and implementation traceability.

## Guarantees / Invariants

1. **Documentation Accuracy**: All documented behaviors are tested in the CI pipeline
2. **Version Alignment**: Documentation versions match software releases
3. **Governance Compliance**: All features documented here respect Tiriti o te Kai v1.0
4. **Link Integrity**: Internal links are verified during build (broken links fail CI)

## Non-Goals

- This documentation does NOT replace reading the source code for implementation details
- This documentation does NOT provide legal advice about deployment in regulated environments
- This documentation does NOT guarantee production readiness without security hardening

---

## Quick Navigation

### Getting Started

| Document | Purpose |
|----------|---------|
| [Quickstart](./quickstart.md) | 5-minute setup from zero to running server |
| [Demo](./demo.md) | 2-minute deterministic evaluation of governance pipeline |

### Vision & Roadmap

| Document | Purpose |
|----------|---------|
| [Vision](../10-vision/vision.md) | Mars-class constraints, distributed mesh, embodiment-ready architecture |
| [Roadmap Execution](../10-vision/roadmap_execution.md) | Phase-by-phase implementation status |

### Architecture

| Document | Purpose |
|----------|---------|
| [System Architecture](../20-architecture/system-architecture.md) | High-level architecture with package map |
| [Repository Architecture](../20-architecture/repo-architecture.md) | Detailed component responsibilities and data flows |
| [Quadratic Bridge](../20-architecture/quadratic-bridge.md) | Browser OI bridge security model |
| [Full Stack Overview](../20-architecture/full_stack_overview.md) | End-to-end stack summary |

### Governance

| Document | Purpose |
|----------|---------|
| [Tiriti o te Kai](../31-governance/tiriti.md) | The governance treaty (v1.0) |
| [CDI Specification](../31-governance/cdi-spec.md) | Conscience Decision Interface details |
| [CIF Specification](../31-governance/cif-spec.md) | Context Integrity Firewall details |
| [Governance Claims](../31-governance/governance-claims.md) | Implementation status truth table |
| [Genome Audit](../31-governance/genome_audit.md) | Genome verification procedures |

### APIs

| Document | Purpose |
|----------|---------|
| [OpenAPI](../40-apis/openapi.md) | REST API specification |
| [gRPC](../40-apis/grpc.md) | gRPC service definitions |
| [Jobs API](../40-apis/jobs_api.md) | Job orchestration endpoints |
| [Memory API](../40-apis/memory_api.md) | Graph memory operations |
| [OI API](../40-apis/oi_api.md) | Interpretation engine interface |

### Mesh & Mobile

| Document | Purpose |
|----------|---------|
| [Mesh Discovery](../50-mesh/mesh_discovery.md) | Peer discovery protocols |
| [Mesh E2EE](../50-mesh/mesh_e2ee.md) | End-to-end encryption |
| [Mobile Deployment](../60-mobile/mobile-deployment.md) | iOS/Android architecture |
| [React Native Guide](../60-mobile/react-native-app-guide.md) | Implementation guide |
| [Play Store](../60-mobile/play_store.md) | Android distribution |

### Operations

| Document | Purpose |
|----------|---------|
| [Deployment](../61-operations/deployment.md) | Deployment configurations |
| [Production Requirements](../61-operations/production-requirements.md) | Production hardening |
| [Security](../61-operations/security.md) | Security policy and reporting |
| [Threat Model](../61-operations/threat-model.md) | Assets, boundaries, mitigations |
| [Provenance](../61-operations/provenance.md) | Chain-of-title and dependencies |

### Development

| Document | Purpose |
|----------|---------|
| [Changelog](../70-dev/changelog.md) | Version history |
| [Contributor Certificate](../70-dev/contributor-certificate.md) | Contribution attestation |
| [Merge Guide](../70-dev/merge-guide.md) | PR merge procedures |
| [Pull Request Template](../70-dev/pull-request.md) | PR guidelines |

### Reference

| Document | Purpose |
|----------|---------|
| [Root Codec](../80-reference/root-codec.md) | Binary encoding specification |
| [Patchlog](../80-reference/patchlog.md) | Patch history |
| [Rector Pack](../80-reference/rector_pack.md) | Rector configuration |

---

## How to Verify

Run the documentation link checker:

```bash
# Check all markdown links are valid
pnpm run docs:check-links
```

Run the full test suite to verify documented behaviors:

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Documentation source | `docs/` |
| Link checker script | `scripts/check-doc-links.ts` |
| CI documentation tests | `.github/workflows/docs.yml` |

---

## Document Conventions

All substantial documents in this repository follow a consistent structure:

1. **Who this is for** — Target audience
2. **Why this exists** — Problem being solved
3. **Guarantees / Invariants** — What the system promises
4. **Non-goals** — Explicit scope exclusions
5. **How to verify** — Tests, scripts, or manual checks
6. **Implementation pointers** — Paths to relevant code
7. **Examples** — Concrete usage patterns

See [Style Guide](../style_guide.md) for full documentation standards.

---

## Migration Notice

This documentation structure was reorganized in v1.1. If you have bookmarks to old paths, see [Migration Map](../migration_map.md) for the mapping from old to new locations. Old paths contain forwarding stubs that redirect to the new canonical locations.
