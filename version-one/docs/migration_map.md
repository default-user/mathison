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
| `docs/00-start-here/quickstart.md` | `docs/00-start-here/quickstart.md` |
| `docs/00-start-here/demo.md` | `docs/00-start-here/demo.md` |
| `docs/10-vision/vision.md` | `docs/10-vision/vision.md` |
| `docs/20-architecture/system-architecture.md` | `docs/20-architecture/system-architecture.md` |
| `docs/20-architecture/quadratic-bridge.md` | `docs/20-architecture/quadratic-bridge.md` |
| `docs/61-operations/deployment.md` | `docs/61-operations/deployment.md` |
| `docs/70-dev/changelog.md` | `docs/70-dev/changelog.md` |
| `docs/70-dev/contributor-certificate.md` | `docs/70-dev/contributor-certificate.md` |
| `docs/45-integrations/github-pages-setup.md` | `docs/45-integrations/github-pages-setup.md` |
| `docs/45-integrations/github-models-setup.md` | `docs/45-integrations/github-models-setup.md` |
| `docs/31-governance/governance-claims.md` | `docs/31-governance/governance-claims.md` |
| `docs/70-dev/merge-guide.md` | `docs/70-dev/merge-guide.md` |
| `docs/61-operations/production-requirements.md` | `docs/61-operations/production-requirements.md` |
| `docs/61-operations/provenance.md` | `docs/61-operations/provenance.md` |
| `docs/70-dev/pull-request.md` | `docs/70-dev/pull-request.md` |
| `docs/80-reference/root-codec.md` | `docs/80-reference/root-codec.md` |
| `docs/61-operations/security.md` | `docs/61-operations/security.md` |
| `docs/61-operations/threat-model.md` | `docs/61-operations/threat-model.md` |

### docs/ Internal Reorganization

| Old Path | New Path |
|----------|----------|
| `docs/20-architecture/repo-architecture.md` | `docs/20-architecture/repo-architecture.md` |
| `docs/31-governance/tiriti.md` | `docs/31-governance/tiriti.md` |
| `docs/31-governance/cdi-spec.md` | `docs/31-governance/cdi-spec.md` |
| `docs/31-governance/cif-spec.md` | `docs/31-governance/cif-spec.md` |
| `docs/60-mobile/mobile-deployment.md` | `docs/60-mobile/mobile-deployment.md` |
| `docs/60-mobile/react-native-app-guide.md` | `docs/60-mobile/react-native-app-guide.md` |
| `docs/20-architecture/full_stack_overview.md` | `docs/20-architecture/full_stack_overview.md` |
| `docs/31-governance/genome_audit.md` | `docs/31-governance/genome_audit.md` |
| `docs/40-apis/grpc.md` | `docs/40-apis/grpc.md` |
| `docs/40-apis/jobs_api.md` | `docs/40-apis/jobs_api.md` |
| `docs/40-apis/memory_api.md` | `docs/40-apis/memory_api.md` |
| `docs/50-mesh/mesh_discovery.md` | `docs/50-mesh/mesh_discovery.md` |
| `docs/50-mesh/mesh_e2ee.md` | `docs/50-mesh/mesh_e2ee.md` |
| `docs/40-apis/oi_api.md` | `docs/40-apis/oi_api.md` |
| `docs/40-apis/openapi.md` | `docs/40-apis/openapi.md` |
| `docs/80-reference/patchlog.md` | `docs/80-reference/patchlog.md` |
| `docs/60-mobile/play_store.md` | `docs/60-mobile/play_store.md` |
| `docs/80-reference/rector_pack.md` | `docs/80-reference/rector_pack.md` |
| `docs/10-vision/roadmap_execution.md` | `docs/10-vision/roadmap_execution.md` |

### Subdirectory Reorganization

| Old Path | New Path |
|----------|----------|
| `docs/31-governance/governance_dataflow_spec.md` | `docs/31-governance/governance_dataflow_spec.md` |
| `docs/31-governance/governance_types.md` | `docs/31-governance/governance_types.md` |
| `docs/31-governance/specs/ethical-immune-system.md` | `docs/31-governance/specs/ethical-immune-system.md` |
| `docs/31-governance/specs/system-integrity-and-permissions.md` | `docs/31-governance/specs/system-integrity-and-permissions.md` |
| `docs/95-adr/0001-storage-backends.md` | `docs/95-adr/0001-storage-backends.md` |
| `docs/90-proposals/readme.md` | `docs/90-proposals/readme.md` |
| `docs/90-proposals/0001-example/rationale.md` | `docs/90-docs/90-proposals/0001-example/rationale.md` |

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
# Example: Update docs/00-start-here/quickstart.md references
sed -i 's|QUICKSTART\.md|docs/00-start-here/quickstart.md|g' README.md

# Example: Update docs/20-architecture/repo-architecture.md references
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
