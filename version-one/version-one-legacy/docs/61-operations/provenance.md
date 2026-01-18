# Provenance

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Auditors verifying code origin and dependencies
- Legal teams reviewing licensing
- Security engineers assessing supply chain

## Why This Exists

This document establishes chain-of-title for Mathison code and dependencies, including AI assistance disclosure.

## Guarantees / Invariants

1. All third-party dependencies are tracked in pnpm-lock.yaml
2. SBOM is regenerated on each release
3. AI-assisted code is human-reviewed before merge
4. Frozen lockfile ensures reproducible builds

## Non-Goals

- This document does NOT provide legal licensing advice
- This document does NOT cover patent claims
- This document does NOT guarantee absence of all security issues

---

## Original Work

All code in the following directories is original:

- `packages/mathison-server/` — Server orchestration
- `packages/mathison-governance/` — CDI/CIF implementation
- `packages/mathison-memory/` — Graph memory layer
- `packages/mathison-storage/` — Storage backends
- `packages/mathison-oi/` — Interpretation engine
- `packages/mathison-mesh/` — Mesh protocol
- `packages/mathison-mobile/` — Mobile components
- `packages/mathison-quadratic/` — Single-file runtime
- `packages/mathison-genome/` — Genome system
- `quadratic-bridge.mjs` — HTTP relay
- `docs/` — All documentation

## Third-Party Dependencies

**Critical runtime:**
- `fastify` (MIT) — HTTP server
- `better-sqlite3` (MIT) — SQLite bindings
- Node.js built-ins — Standard library

See `SBOM.cdx.json` for complete inventory.

## AI Assistance Disclosure

**Human-authored:** Architecture, specifications, security requirements
**AI-assisted:** Implementation code (reviewed before merge)

## Verification

```bash
pnpm install --frozen-lockfile  # Verify dependencies
pnpm sbom                       # Regenerate SBOM
pnpm -r test                    # Run tests
```

---

## How to Verify

```bash
# Verify lockfile integrity
pnpm install --frozen-lockfile

# Check SBOM
cat SBOM.cdx.json | jq '.components | length'

# Verify all tests pass
pnpm -r test
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Package lockfile | `pnpm-lock.yaml` |
| SBOM | `SBOM.cdx.json` |
| License | `LICENSE` |
| Contributor cert | `docs/70-dev/contributor-certificate.md` |
