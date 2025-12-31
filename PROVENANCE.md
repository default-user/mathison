# Provenance

## Purpose

This document establishes chain-of-title for Mathison code and dependencies.

## Original Work vs. Third-Party

### Original Mathison Code

All code in the following directories is original work created for this project:

- `packages/mathison-server/` — Fastify server orchestration with governance pipeline
- `packages/mathison-governance/` — CDI/CIF implementation and treaty enforcement
- `packages/mathison-memory/` — Graph/hypergraph memory layer
- `packages/mathison-storage/` — Swap-ready storage backends (FILE/SQLite)
- `packages/mathison-oi/` — Interpretation engine with intent detection
- `packages/mathison-mesh/` — Distributed mesh protocol and ModelBus
- `packages/mathison-mobile/` — Mobile-specific components (React Native compatible)
- `packages/mathison-quadratic/` — Single-file OI runtime (Quadratic Monolith)
- `packages/mathison-genome/` — Memetic genome system with Ed25519 signing
- `packages/mathison-kernel-mac/` — macOS-specific native kernel integration
- `packages/mathison-sdk-generator/` — Multi-language SDK code generation
- `packages/mathison-ui/` — User interface components
- `quadratic-bridge.mjs` — Secure HTTP relay for browser OIs
- `quadratic.html` + `quad.js` — Browser bootstrap UI and runtime
- `docs/` — All documentation (tiriti.md, architecture, specs)
- `config/` — Governance configuration files

### Third-Party Dependencies

All third-party code is declared in `package.json` files and tracked in `pnpm-lock.yaml`.

**Critical runtime dependencies:**

- `fastify` (MIT) — HTTP server framework, governance hooks
- `@fastify/cors` (MIT) — CORS middleware
- `better-sqlite3` (MIT) — SQLite bindings for persistence
- Node.js built-in modules (`crypto`, `fs`, `path`) — Standard library

**Development dependencies:**

- `typescript` (Apache-2.0) — Type checking and compilation
- `jest` (MIT) — Test framework
- `tsx` (MIT) — TypeScript execution
- React Native ecosystem (mobile package only)

See `SBOM.cdx.json` for complete dependency inventory with versions and licenses.

## Dependency Verification

To verify all dependencies match the lockfile:

```bash
pnpm install --frozen-lockfile
```

This ensures:
- Exact versions specified in `pnpm-lock.yaml` are installed
- No unexpected transitive dependencies
- Reproducible builds across environments

To regenerate the dependency lockfile (maintainers only):

```bash
pnpm install
git diff pnpm-lock.yaml  # Review changes before committing
```

## AI Assistance Disclosure

This codebase was developed with assistance from Claude (Anthropic) and GitHub Copilot.

**Human-authored components:**
- Governance treaty (Tiriti o te Kai)
- Architecture decisions and system design
- Test specifications and acceptance criteria
- Security requirements and threat models
- API contracts and specifications

**AI-assisted components:**
- Implementation code (TypeScript)
- Test implementations following human-specified criteria
- Documentation formatting and clarity improvements
- Boilerplate reduction

**Human review applied to:**
- All AI-generated code before merging
- Security-critical paths (signature verification, governance gates)
- API surface and public contracts
- Test coverage and edge cases

**AI limitations acknowledged:**
- AI cannot verify correctness of cryptographic implementations (human cryptography review required)
- AI may introduce subtle logic errors (all code requires human review)
- AI cannot make architectural trade-off decisions (human judgment required)

## Contributor Rights

Contributors to this project must:

1. Have legal right to contribute their code
2. Not paste proprietary code from other projects
3. Ensure AI-assisted contributions are reviewed by a human before submission
4. Sign the Contributor Certificate (see `CONTRIBUTOR_CERTIFICATE.md`)

## License

All original Mathison code is licensed under Apache License 2.0 (see `LICENSE`).

Third-party dependencies retain their original licenses (see `SBOM.cdx.json` for details).

## Verification Commands

```bash
# Verify dependency integrity
pnpm install --frozen-lockfile

# Regenerate SBOM
pnpm sbom

# Run full test suite
pnpm -r test

# Verify genome signature
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json
```

## Change Log

- **2025-12-31:** Initial provenance documentation
- Dependencies tracked via pnpm-lock.yaml
- SBOM generation added via CycloneDX

## Contact

For provenance questions or contributor attestation: open an issue in the repository.
