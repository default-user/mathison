# Genome Mutation Proposals

This directory contains proposals for changes to Memetic Genomes.

## Process

1. **Create proposal directory**: `proposals/NNNN-short-name/`
2. **Write proposal.json**: Structured metadata (from_genome_id, to_genome_id, impacted invariants)
3. **Write rationale.md**: Human-readable explanation and impact analysis
4. **Create conformance tests**: Prove invariants still hold
5. **Submit for review**: Authority signers review and approve
6. **Generate new genome**: Create signed genome with updated version
7. **Deploy with lineage**: New genome records parent in `parents` array

## Proposal Structure

```
proposals/
├── 0001-example/
│   ├── proposal.json       # Structured metadata
│   ├── rationale.md        # Human-readable explanation
│   └── tests/              # Conformance tests (optional)
└── README.md               # This file
```

## Example: proposals/0001-example/

See `0001-example/` for a template demonstrating the expected structure.

## Governance Rules

- Mutations MUST NOT violate root invariants
- Breaking changes require explicit migration plan
- All proposals require tests proving safety
- Authority threshold signatures required before deployment
- Lineage MUST be traceable back to root genome
