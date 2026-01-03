# TOTK_ROOT v1.0.0 Genome

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Security engineers reviewing genome configuration
- Operators understanding default governance
- Developers working with genome verification

## Why This Exists

Documents the root governance genome for Mathison, including invariants, capabilities, and signing authority.

---

## Overview

TOTK_ROOT is the default governance genome shipped with Mathison. It establishes:

- Core invariants (consent wins, fail-closed, no-hive, etc.)
- Capability ceilings for all actions
- Signing authority for governance updates

## Location

```
genomes/TOTK_ROOT_v1.0.0/
├── genome.json           # Signed genome
├── genome-unsigned.json  # Template for signing
├── key.pub              # Public key (test only)
├── key.priv             # Private key (test only, DO NOT USE IN PRODUCTION)
└── README.md            # Genome documentation
```

## Core Invariants

| ID | Name | Description |
|----|------|-------------|
| INV-001 | consent_wins | User stop signals are immediately honored |
| INV-002 | fail_closed | Uncertain actions default to denial |
| INV-003 | no_hive | No identity fusion between OI instances |
| INV-004 | non_personhood | No claims of sentience or suffering |
| INV-005 | honest_limits | No false capability claims |
| INV-006 | attribution | Credit and provenance tracked |

---

## How to Verify

```bash
# Verify genome signature
npx tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Check genome contents
cat genomes/TOTK_ROOT_v1.0.0/genome.json | jq '.invariants'
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Genome directory | `genomes/TOTK_ROOT_v1.0.0/` |
| Genome loader | `packages/mathison-genome/src/genome-loader.ts` |
| Verification script | `scripts/genome-verify.ts` |
