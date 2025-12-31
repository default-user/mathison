# mathison-genome

Verifiable Memetic Genomes for Mathison governance.

## Overview

A **Memetic Genome** is a signed, immutable instruction bundle that serves as the governance root for a Mathison instance. It defines:

- **Invariants**: Non-overridable rules that must always hold
- **Capability Ceilings**: Maximum allowed actions (deny-by-default)
- **Authority**: Cryptographic signers and threshold requirements
- **Lineage**: Parent genome IDs for mutation tracking

## Key Features

- **Fail-closed**: Invalid or missing genome → server refuses to boot
- **Cryptographically verifiable**: Ed25519 signatures
- **Auditable**: Genome ID and version appear in all receipts
- **Mutation governance**: Changes require explicit proposal artifacts

## Usage

```typescript
import { loadAndVerifyGenome } from 'mathison-genome';

// Load and verify genome
const { genome, genome_id } = loadAndVerifyGenome('./genomes/TOTK_ROOT_v1.0.0/genome.json');

console.log('Loaded genome:', genome.name, genome.version);
console.log('Genome ID:', genome_id);
```

## Genome Format

See `src/types.ts` for the complete schema (v0.1).

## Security

- Private signing keys MUST NEVER be committed to the repository
- Use `GENOME_SIGNING_PRIVATE_KEY` environment variable for signing operations
- Test/dev genomes use ephemeral keys only
