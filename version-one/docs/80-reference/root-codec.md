# Root Codec Reference

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Developers working with binary encoding
- Protocol implementers
- Integration engineers

## Why This Exists

Documents the root codec for binary encoding of Mathison data structures.

---

## Overview

The root codec provides consistent binary serialization for:
- Genome structures
- Receipt chains
- Memory graph nodes

## Encoding Format

All structures use little-endian byte ordering with length-prefixed fields.

---

## Implementation Pointers

| Component | Path |
|-----------|------|
| Codec implementation | `packages/mathison-governance/src/codec.ts` |
| Tests | `packages/mathison-governance/src/__tests__/codec.test.ts` |
