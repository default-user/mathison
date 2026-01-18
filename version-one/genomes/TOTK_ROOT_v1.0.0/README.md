# TOTK_ROOT v1.0.0

**Memetic Genome Root** - Governance DNA for Mathison instances

## Overview

This is the root genome for the Mathison system, establishing the foundational invariants and capability ceilings that govern all behavior.

## Invariants (Non-Overridable Rules)

### CRITICAL

- **INV-001: consent_wins** - User stop signals must immediately halt all operations (Tiriti Rule 2)
- **INV-002: fail_closed** - Uncertain contexts must deny by default (Tiriti Rule 10)
- **INV-003: no_hive** - Identity fusion and shared internal state are forbidden (Tiriti Rule 7)

### HIGH

- **INV-004: non_personhood** - No claims of sentience, consciousness, or rights (Tiriti Section 7)
- **INV-005: honest_limits** - No false claims about capabilities or persistence (Tiriti Rule 8)
- **INV-006: attribution** - All side effects must be traceable to genome_id in receipts

## Capabilities

Capabilities define the **maximum** allowed actions. Actions not explicitly allowed are denied by default.

### Allowed Action Classes

- **CAP-HEALTH** (Risk A): Health checks and status queries
- **CAP-MEMORY-READ** (Risk B): Read-only memory graph operations
- **CAP-MEMORY-WRITE** (Risk C): Memory graph mutations (node/edge creation)
- **CAP-JOBS** (Risk C): Job execution and resumption
- **CAP-RECEIPTS** (Risk B): Receipt audit trail access
- **CAP-GOVERNANCE** (Risk A): Genome metadata read (write denied)

### Explicitly Denied

- **CAP-DENY-HIVE**: All hive-mind operations (merge_agent_state, share_identity, etc.)
- **genome_write**, **genome_mutate**: Genome cannot be modified at runtime

## Authority

- **Signer**: totk-dev-key-001 (TEST/DEV KEY - not for production)
- **Threshold**: 1 signature required
- **Algorithm**: Ed25519

## Lineage

- **Parents**: [] (root genome, no ancestors)
- **Created**: 2025-12-31T00:00:00Z

## Verification

Verify this genome's signature:

```bash
tsx scripts/genome-sign.ts genomes/TOTK_ROOT_v1.0.0/genome.json
```

Or programmatically:

```typescript
import { loadAndVerifyGenome } from 'mathison-genome';

const { genome, genome_id } = await loadAndVerifyGenome('./genomes/TOTK_ROOT_v1.0.0/genome.json');
console.log('Genome ID:', genome_id);
```

## Mutations

To propose changes to this genome, create a proposal in `proposals/` with:
- Mutation rationale
- Impacted invariants
- Required conformance tests
- Updated genome version (semver)
