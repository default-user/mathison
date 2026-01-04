# Documentation Style Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Documentation authors contributing to Mathison
- Reviewers evaluating documentation PRs
- Maintainers enforcing documentation standards

## Why This Exists

Consistent documentation reduces cognitive load, improves discoverability, and ensures that critical information (invariants, verification steps, implementation paths) is never omitted. This guide codifies the Mathison documentation standards.

## Guarantees / Invariants

1. All documents following this guide will pass the documentation linter
2. All required sections will be present in substantial documents
3. Filenames under `docs/` are lowercase with hyphens
4. Internal links use relative paths and are verified by CI

## Non-Goals

- This guide does not cover code documentation (JSDoc, TSDoc)
- This guide does not replace project-specific README conventions in packages
- This guide does not prescribe prose style beyond technical clarity

---

## Document Structure

### Required Sections (Substantial Documents)

Every substantial document (>200 words, not a stub or index) MUST include:

```markdown
# Document Title

**Version:** X.Y.Z (if versioned independently)
**Last Updated:** YYYY-MM-DD

---

## Who This Is For

[Target audience: developers, operators, evaluators, etc.]

## Why This Exists

[Problem being solved, context for existence]

## Guarantees / Invariants

[What the system/feature promises - numbered list]

## Non-Goals

[Explicit scope exclusions - what this is NOT]

---

[Main content...]

---

## How to Verify

[Tests, scripts, or manual verification steps]

## Implementation Pointers

[Paths to relevant source code]

## Examples

[Concrete usage patterns, code samples, or scenarios]
```

### Optional Sections

- **Prerequisites**: Required before following the document
- **Troubleshooting**: Common issues and solutions
- **Related Documents**: Links to related docs
- **Changelog**: Document-specific version history

---

## Naming Conventions

### Filenames

- **Lowercase only**: `system-architecture.md`, not `System-Architecture.md`
- **Hyphens for spaces**: `react-native-app-guide.md`, not `react_native_app_guide.md`
- **Descriptive names**: `governance-claims.md`, not `gc.md`
- **No special characters**: Alphanumeric and hyphens only

### Directory Structure

```
docs/
  00-start-here/     # Entry points and quickstart
  10-vision/         # Vision, roadmap, strategy
  20-architecture/   # System and repo architecture
  25-packages/       # Package-specific documentation
  31-governance/     # Governance specs and policies
  40-apis/           # API documentation
  45-integrations/   # Third-party integrations
  50-mesh/           # Mesh networking
  60-mobile/         # Mobile deployment
  61-operations/     # Deployment and operations
  70-dev/            # Development workflows
  80-reference/      # Reference materials
  90-proposals/      # Feature proposals
  95-adr/            # Architecture Decision Records
```

Numeric prefixes control ordering in file browsers. Use gaps (10, 20, 31) to allow insertions.

---

## Formatting Standards

### Headers

- Use ATX-style headers (`#`, `##`, `###`)
- Maximum depth: 4 levels (`####`)
- Blank line before and after headers
- No trailing punctuation in headers

### Code Blocks

Always specify the language:

````markdown
```typescript
const example: string = 'typed';
```
````

For shell commands, use `bash`:

````markdown
```bash
pnpm install
pnpm -r build
```
````

### Tables

Use GFM tables with alignment:

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|:--------:|---------:|
| Left     | Center   | Right    |
```

### Links

- **Internal links**: Relative paths from the current file
  ```markdown
  See [Architecture](./20-architecture/system-architecture.md)
  ```
- **External links**: Full URLs with descriptive text
  ```markdown
  See the [Fastify documentation](https://fastify.io/docs/)
  ```
- **Section links**: Use slugified header IDs
  ```markdown
  See [Invariants](#guarantees--invariants)
  ```

### Lists

- Use `-` for unordered lists
- Use `1.` for ordered lists (auto-numbering)
- Nest with 2-space indentation
- End list items with periods if they are complete sentences

---

## Content Guidelines

### Technical Accuracy

- **Verify all commands**: Run every shell command before documenting
- **Test all code samples**: Ensure code examples compile/run
- **Check all paths**: Verify file paths exist in the repository
- **Update versions**: Keep version numbers current

### Clarity

- **Active voice**: "The server validates requests" not "Requests are validated by the server"
- **Present tense**: "The CDI checks permissions" not "The CDI will check permissions"
- **Specific language**: "Returns HTTP 401" not "Returns an error"
- **No filler**: Remove "basically", "simply", "just", "obviously"

### Completeness

- **Include failure modes**: What happens when things go wrong?
- **Document edge cases**: Empty inputs, maximum sizes, concurrent access
- **Provide verification**: How can the reader confirm it works?
- **Link to source**: Where in the codebase is this implemented?

---

## How to Verify

### Linting

```bash
# Run documentation linter
pnpm run docs:lint

# Check for broken links
pnpm run docs:check-links

# Verify code samples
pnpm run docs:verify-code
```

### Manual Review Checklist

- [ ] All required sections present?
- [ ] Filename is lowercase with hyphens?
- [ ] All internal links relative and valid?
- [ ] Code blocks have language specified?
- [ ] Commands tested and working?
- [ ] File paths verified to exist?

---

## Implementation Pointers

| Component | Path |
|-----------|------|
| Documentation linter | `scripts/lint-docs.ts` |
| Link checker | `scripts/check-doc-links.ts` |
| Code sample verifier | `scripts/verify-doc-code.ts` |
| CI workflow | `.github/workflows/docs.yml` |

---

## Examples

### Good Document Header

```markdown
# Memory API Reference

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

Developers integrating with the Mathison memory graph via HTTP API.

## Why This Exists

The Memory API provides CRUD operations for nodes, edges, and hyperedges
in the Mathison memory graph, with full governance pipeline integration.

## Guarantees / Invariants

1. All write operations generate governance receipts
2. Read operations pass through CIF/CDI but do not generate receipts
3. Idempotency keys ensure safe retry behavior
4. All responses include correlation IDs for debugging

## Non-Goals

- This API does not support batch operations (use individual calls)
- This API does not provide streaming (use gRPC for streaming)
- This API does not bypass governance (structurally impossible)
```

### Bad Document Header

```markdown
# Memory API

This document describes the memory API.

## Endpoints

POST /memory/nodes - create a node
GET /memory/nodes/:id - get a node
...
```

The bad example lacks:
- Version and date
- Target audience
- Rationale
- Invariants
- Non-goals
- Verification steps
- Implementation pointers
