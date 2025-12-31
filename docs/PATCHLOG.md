# Genome Audit Hardening - Patchlog

> Internal tracking for patch-sequenced implementation
> NO COMMITS until final patch complete

---

## PATCH-0001 — Deep Canonicalization (Stable Bytes)

**Goal:** Replace shallow canonicalization with deterministic deep canonicalization

**Status:** Pending

**Files to touch:**
- packages/mathison-genome/src/canonicalization.ts
- packages/mathison-genome/src/__tests__/genome-conformance.test.ts

**Tests to add:**
- Nested object key ordering produces stable bytes
- Array ordering preserved
- No whitespace in canonical JSON
- UTF-8 encoding stable

**Notes:**
- Current implementation only sorts top-level keys
- Need recursive key sorting for all nested objects
- Preserve array order (arrays are ordered sequences)
- Remove whitespace (currently uses indent=2)
- Migration: old signatures will break; provide re-signing script

---

## PATCH-0002 — Multi-Signature + Threshold Enforcement

**Goal:** Support multiple signatures and enforce threshold verification

**Status:** Pending

**Files to touch:**
- packages/mathison-genome/src/types.ts
- packages/mathison-genome/src/loader.ts
- packages/mathison-genome/src/validation.ts
- packages/mathison-genome/src/__tests__/genome-conformance.test.ts

**Tests to add:**
- Threshold unmet → verification fails
- Duplicate signer counted once → still fails if threshold unmet
- threshold > signers.length → validation error
- Unknown signer in signatures → verification fails

**Notes:**
- Extend Genome type: `signatures?: GenomeSignature[]` (in addition to legacy `signature?`)
- Verification: check both fields, collect all valid signatures, enforce threshold
- Backward compat: single `signature` field still works if threshold=1

---

## PATCH-0003 — Enforce Build Manifest SHA-256 (Audit Mode)

**Goal:** Verify build_manifest file hashes match actual files

**Status:** Pending

**Files to touch:**
- packages/mathison-genome/src/loader.ts
- packages/mathison-genome/src/__tests__/genome-conformance.test.ts
- scripts/genome-build-manifest.ts (NEW)
- scripts/genome-sign.ts (UPDATE)

**Tests to add:**
- Manifest hash mismatch → fail-closed
- Missing file → fail-closed
- Valid manifest → verification succeeds

**Notes:**
- Add option: `loadAndVerifyGenome(filePath, { verifyManifest: true, repoRoot?: string })`
- Compute SHA-256 of each file in build_manifest.files
- Compare to declared sha256
- New script: `genome-build-manifest.ts` to recompute hashes and update genome.json
- Update signing workflow: build manifest → sign genome

---

## PATCH-0004 — Boot Wiring + Conformance Tests

**Goal:** Ensure Mathison server boot verifies genome and fails closed on errors

**Status:** Pending

**Files to touch:**
- packages/mathison-server/src/index.ts
- packages/mathison-server/src/__tests__/genome-boot-conformance.test.ts
- packages/mathison-server/src/health.ts (if exists, or update /health route)

**Tests to add:**
- Missing genome file → server unhealthy / 503
- Invalid signature → server fails to boot
- Manifest mismatch (production mode) → server fails to boot
- /health includes genome verification status

**Notes:**
- Production mode (MATHISON_ENV=production): manifest verification ON by default
- Dev mode: manifest verification optional
- Boot verification: signature ALWAYS, manifest depends on mode
- /health endpoint reports genome verification status explicitly

---

## Final Verification

**Commands to run:**
- `pnpm test` — all tests must pass
- `pnpm build` — build must succeed

**Final commit:**
- Message: "P4-C: Genome audit hardening (deep canonicalization, threshold signatures, manifest verification, conformance)"
- Push to: claude/genome-audit-hardening-UkVQ3

---
