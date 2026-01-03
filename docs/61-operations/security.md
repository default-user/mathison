# Security Policy

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Security researchers reporting vulnerabilities
- Operators hardening Mathison deployments
- Developers understanding security architecture

## Why This Exists

Mathison handles governance-sensitive operations. This document defines security reporting procedures, critical components, and secure defaults.

## Guarantees / Invariants

1. Fail-closed by default (deny uncertain actions)
2. All side effects generate receipts
3. Genome signature verification is mandatory
4. Pipeline enforcement is structural (cannot be disabled)

## Non-Goals

- This document does NOT provide legal compliance advice
- This document does NOT cover penetration testing procedures
- This document does NOT define incident response beyond initial reporting

---

## Reporting Security Vulnerabilities

If you discover a security vulnerability in Mathison:

1. **DO NOT** create a public GitHub issue
2. Email security details to your designated security contact
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fixes (if any)

We will respond within 48 hours.

## Security-Critical Components

### Memetic Genome System

The Memetic Genome is the **governance root**. Compromising it bypasses all safety constraints.

**Threat Model:**

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Key Compromise | Arbitrary valid genomes | Store keys in HSM/secret managers |
| Genome Tampering | Altered invariants | Signature verification (fail-closed) |
| Capability Escalation | Unauthorized actions | CDI capability ceiling checks |

### CIF/CDI Governance Pipeline

Every request passes through: CIF Ingress → CDI Action Check → Handler → CDI Output Check → CIF Egress

**Protections:**
- Pipeline enforcement is structural (Fastify hooks)
- All side effects route through ActionGate
- Tests verify pipeline for all routes

### Receipt Auditability

**Protections:**
- Receipts include genome_id/genome_version
- Receipt store is append-only
- Atomic writes prevent corruption

## Secure Defaults

- Missing/invalid genome → server refuses to boot
- Uncertain action context → deny by default
- Unknown routes → 404 with explicit denial
- Side effects without receipts → execution fails

## Production Security Checklist

- [ ] Generated unique production genome signing keypair
- [ ] Stored private key in HSM or secret manager
- [ ] Deployed production genome with valid signature
- [ ] Verified MATHISON_GENOME_PATH points to production genome
- [ ] Confirmed server fails with invalid genome
- [ ] Set up file integrity monitoring
- [ ] Configured append-only receipt storage
- [ ] Enabled audit logging for genome mutations
- [ ] Established key rotation schedule
- [ ] Reviewed capability ceiling
- [ ] Confirmed all side effects generate receipts

---

## How to Verify

```bash
# Test fail-closed behavior
MATHISON_STORE_BACKEND= pnpm --filter mathison-server start
# Expected: Boot failure

# Verify genome signature
npx tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Run security-focused tests
pnpm --filter mathison-governance test
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| CDI enforcement | `packages/mathison-governance/src/cdi.ts` |
| CIF boundary | `packages/mathison-governance/src/cif.ts` |
| ActionGate | `packages/mathison-governance/src/action-gate.ts` |
| Genome loader | `packages/mathison-genome/src/genome-loader.ts` |
