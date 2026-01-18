# Genome Mutation Proposals

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Contributors proposing genome changes
- Authority signers reviewing proposals
- Auditors tracing governance lineage

## Why This Exists

Genome mutations follow a governed process to maintain invariant integrity and provide full traceability from root genome through all changes.

---

## Process

1. **Create proposal directory**: `docs/90-proposals/NNNN-short-name/`
2. **Write proposal.json**: Structured metadata
3. **Write rationale.md**: Human-readable explanation
4. **Create conformance tests**: Prove invariants still hold
5. **Submit for review**: Authority signers review
6. **Generate new genome**: Create signed genome
7. **Deploy with lineage**: New genome records parent

## Proposal Structure

```
90-proposals/
├── 0001-example/
│   ├── proposal.json       # Structured metadata
│   ├── rationale.md        # Human-readable explanation
│   └── tests/              # Conformance tests (optional)
└── readme.md               # This file
```

## Governance Rules

- Mutations MUST NOT violate root invariants
- Breaking changes require migration plan
- All proposals require safety tests
- Authority signatures required before deployment

---

## Implementation Pointers

| Component | Path |
|-----------|------|
| Example proposal | `docs/90-proposals/0001-example/` |
| Genome system | `packages/mathison-genome/` |
