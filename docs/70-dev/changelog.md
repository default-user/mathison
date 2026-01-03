# Changelog

**Last Updated:** 2026-01-03

---

## Who This Is For

- Developers tracking changes between versions
- Operators planning upgrades
- Contributors understanding project evolution

## Format

This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Documentation
- Reorganized docs into canonical folder structure (docs v2)
- Added style guide and migration map
- Enhanced all docs with operational invariants

## [1.0.0] - 2025-12-31

### Added
- **mathison-memory**: Graph traversal, shortest path, query DSL, hypergraph operations
- **mathison-mesh**: Node discovery (proximity, broadcast, manual)
- **mathison-sdk-generator**: TypeScript, Python, Rust SDK generation
- **TypeScript SDK**: Complete API client with type safety
- **Python SDK**: Complete API client with dataclasses
- **Rust SDK**: Async API client with reqwest

### Fixed
- Graph operation correctness (P2 TODOs)
- SDK implementations (P4 TODOs)
- Hypergraph operations (P5 TODOs)

---

## How to Verify

```bash
# Check version
cat package.json | jq '.version'

# View git log
git log --oneline -20

# Check for breaking changes
git diff v0.9.0..v1.0.0 -- packages/*/src/index.ts
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Version file | `package.json` |
| Git tags | `git tag -l` |
| Release notes | `docs/70-dev/releases/` |
