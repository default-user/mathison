# Documentation Migration Map

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Users with bookmarks to old documentation paths
- Developers updating internal links
- Maintainers tracking documentation reorganization

## Why This Exists

Documentation was reorganized in v1.1 (docs v2) to provide a coherent tree structure. This map shows where every document moved from and to.

---

## Migration Table

### Root-Level Documents → docs/

| Old Path | New Path |
|----------|----------|
| `QUICKSTART.md` | `docs/00-start-here/quickstart.md` |
| `DEMO.md` | `docs/00-start-here/demo.md` |
| `VISION.md` | `docs/10-vision/vision.md` |
| `ARCHITECTURE.md` | `docs/20-architecture/system-architecture.md` |
| `BRIDGE.md` | `docs/20-architecture/quadratic-bridge.md` |
| `DEPLOYMENT.md` | `docs/61-operations/deployment.md` |
| `CHANGELOG.md` | `docs/70-dev/changelog.md` |
| `CONTRIBUTOR_CERTIFICATE.md` | `docs/70-dev/contributor-certificate.md` |
| `GITHUB-PAGES-SETUP.md` | `docs/45-integrations/github-pages-setup.md` |
| `GITHUB_MODELS_SETUP.md` | `docs/45-integrations/github-models-setup.md` |
| `GOVERNANCE_CLAIMS.md` | `docs/31-governance/governance-claims.md` |
| `MERGE-GUIDE.md` | `docs/70-dev/merge-guide.md` |
| `PRODUCTION_REQUIREMENTS.md` | `docs/61-operations/production-requirements.md` |
| `PROVENANCE.md` | `docs/61-operations/provenance.md` |
| `PULL_REQUEST.md` | `docs/70-dev/pull-request.md` |
| `ROOT_CODEC.md` | `docs/80-reference/root-codec.md` |
| `SECURITY.md` | `docs/61-operations/security.md` |
| `THREAT_MODEL.md` | `docs/61-operations/threat-model.md` |

### docs/ Internal Reorganization

| Old Path | New Path |
|----------|----------|
| `docs/architecture.md` | `docs/20-architecture/repo-architecture.md` |
| `docs/tiriti.md` | `docs/31-governance/tiriti.md` |
| `docs/cdi-spec.md` | `docs/31-governance/cdi-spec.md` |
| `docs/cif-spec.md` | `docs/31-governance/cif-spec.md` |
| `docs/mobile-deployment.md` | `docs/60-mobile/mobile-deployment.md` |
| `docs/react-native-app-guide.md` | `docs/60-mobile/react-native-app-guide.md` |
| `docs/FULL_STACK_OVERVIEW.md` | `docs/20-architecture/full_stack_overview.md` |
| `docs/GENOME_AUDIT.md` | `docs/31-governance/genome_audit.md` |
| `docs/GRPC.md` | `docs/40-apis/grpc.md` |
| `docs/JOBS_API.md` | `docs/40-apis/jobs_api.md` |
| `docs/MEMORY_API.md` | `docs/40-apis/memory_api.md` |
| `docs/MESH_DISCOVERY.md` | `docs/50-mesh/mesh_discovery.md` |
| `docs/MESH_E2EE.md` | `docs/50-mesh/mesh_e2ee.md` |
| `docs/OI_API.md` | `docs/40-apis/oi_api.md` |
| `docs/OPENAPI.md` | `docs/40-apis/openapi.md` |
| `docs/PATCHLOG.md` | `docs/80-reference/patchlog.md` |
| `docs/PLAY_STORE.md` | `docs/60-mobile/play_store.md` |
| `docs/RECTOR_PACK.md` | `docs/80-reference/rector_pack.md` |
| `docs/ROADMAP_EXECUTION.md` | `docs/10-vision/roadmap_execution.md` |

### Subdirectory Reorganization

| Old Path | New Path |
|----------|----------|
| `docs/governance/GOVERNANCE_DATAFLOW_SPEC.md` | `docs/31-governance/governance_dataflow_spec.md` |
| `docs/governance/GOVERNANCE_TYPES.md` | `docs/31-governance/governance_types.md` |
| `docs/specs/ethical-immune-system.md` | `docs/31-governance/specs/ethical-immune-system.md` |
| `docs/specs/system-integrity-and-permissions.md` | `docs/31-governance/specs/system-integrity-and-permissions.md` |
| `docs/adr/0001-storage-backends.md` | `docs/95-adr/0001-storage-backends.md` |
| `proposals/README.md` | `docs/90-proposals/readme.md` |
| `proposals/0001-example/rationale.md` | `docs/90-proposals/0001-example/rationale.md` |

### Documents Kept at Root

| Path | Reason |
|------|--------|
| `README.md` | Repository entry point |
| `CLAUDE.md` | Behavioral kernel (per spec) |
| `LICENSE` | License file |
| `NOTICE` | Apache notice file |
| `SBOM.cdx.json` | Software Bill of Materials |
| `VERSION_LEDGER.json` | Version tracking |

### New Documents Created

| Path | Description |
|------|-------------|
| `docs/00-start-here/index.md` | Documentation index |
| `docs/style_guide.md` | Documentation style guide |
| `docs/migration_map.md` | This file |

---

## Forwarding Stubs

For one release cycle, old paths contain forwarding stubs that redirect to new locations. Each stub contains:

```markdown
Moved to [new/path/file.md](./new/path/file.md)
```

These stubs will be removed in a future release.

---

## Updating Links

### Grep Patterns for Old Links

```bash
# Find links to old root-level docs
grep -r "QUICKSTART\.md\|DEMO\.md\|VISION\.md\|ARCHITECTURE\.md" --include="*.md"

# Find links to old docs/ paths
grep -r "docs/architecture\.md\|docs/tiriti\.md" --include="*.md"
```

### Sed Replacement Examples

```bash
# Example: Update QUICKSTART.md references
sed -i 's|QUICKSTART\.md|docs/00-start-here/quickstart.md|g' README.md

# Example: Update docs/architecture.md references
sed -i 's|docs/architecture\.md|docs/20-architecture/repo-architecture.md|g' *.md
```

---

## Verification

After updating links, verify no broken references:

```bash
# Check for references to old paths
grep -rE "(QUICKSTART|DEMO|VISION|ARCHITECTURE|BRIDGE|DEPLOYMENT|CHANGELOG)\.md" --include="*.md" | grep -v "Moved to"

# Check for references to old docs/ structure
grep -rE "docs/(architecture|tiriti|cdi-spec|cif-spec)\.md" --include="*.md" | grep -v "Moved to"
```

---

## Questions

For questions about the migration, open an issue in the repository.
