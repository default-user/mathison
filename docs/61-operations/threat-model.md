# Threat Model

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Security engineers assessing Mathison risks
- Operators understanding attack surface
- Developers implementing security controls

## Why This Exists

This threat model identifies assets, trust boundaries, and threats with their mitigations. It provides an honest assessment of current security posture.

## Guarantees / Invariants

1. All identified threats have documented mitigations or explicit gaps
2. Risk levels are based on likelihood × impact
3. Quarterly review cycle is maintained
4. Production recommendations are actionable

## Non-Goals

- This model does NOT cover mobile deployments (separate model needed)
- This model does NOT cover browser runtime (Quadratic Monolith)
- This model does NOT assume compromised operators

---

## Scope

This threat model covers:
- Mathison server, storage, governance, and memory systems

**Current Status:** Prototype / Early Stage — Not production-ready without hardening.

## Assets

### High-Value Assets

| Asset | Location | Criticality |
|-------|----------|-------------|
| Memetic Genome | `genomes/*/genome.json` | CRITICAL |
| Signing Keys | HSM/secret manager (prod) | CRITICAL |
| Receipts | Storage backend | HIGH |
| Memory Graph | Storage backend | MEDIUM |
| Server Config | Environment variables | MEDIUM |

## Trust Boundaries

1. **Network → CIF Ingress**: Untrusted → Trusted
2. **CIF → CDI → Handler**: Request → Governed Execution
3. **Handler → Storage**: Application → Persistence
4. **CDI → CIF Egress**: Internal → Network Response

## Threat Summary

| Threat | Likelihood | Impact | Risk | Status |
|--------|------------|--------|------|--------|
| T1: Genome Compromise | LOW→HIGH | CRITICAL | HIGH | Partial |
| T2: Genome Tampering | MEDIUM | HIGH | MEDIUM | Partial |
| T3: Pipeline Bypass | LOW | CRITICAL | MEDIUM | Mitigated |
| T4: ActionGate Bypass | LOW | CRITICAL | MEDIUM | Mitigated |
| T5: Injection Attacks | MEDIUM | HIGH | MEDIUM | Partial |
| T6: Receipt Tampering | MEDIUM | MEDIUM | MEDIUM | Partial |
| T7: Denial of Service | HIGH | MEDIUM | MEDIUM | Minimal |
| T8: Dependency Vuln | MEDIUM | MEDIUM | MEDIUM | Minimal |
| T9: Credential Leakage | LOW→HIGH | HIGH | MEDIUM | Partial |
| T10: Prompt Injection | MEDIUM | MEDIUM | MEDIUM | Partial |
| T11: Supply Chain | LOW | HIGH | LOW | Minimal |

## Key Threats

### T1: Genome Compromise (CRITICAL)

**Attack:** Attacker obtains genome signing private key.
**Impact:** Complete governance bypass.
**Mitigations:**
- ✅ Test key documented as dev-only
- ✅ Ed25519 signature verification
- ❌ Key rotation mechanism (TODO)
- ❌ Multi-signature threshold (TODO)

### T3: Governance Pipeline Bypass (CRITICAL)

**Attack:** Route that bypasses CIF→CDI pipeline.
**Impact:** Injection attacks, consent violations.
**Mitigations:**
- ✅ Structural enforcement (Fastify hooks)
- ✅ Routes registered after hooks
- ✅ Tests verify pipeline active

### T7: Denial of Service (MEDIUM)

**Attack:** High-volume requests exhaust resources.
**Impact:** Server unavailability.
**Mitigations:**
- ✅ Request/response size limits (1MB)
- ❌ Rate limiting (TODO)
- ❌ Backpressure (TODO)

## Production Recommendations

1. Generate unique production genome signing keypair
2. Store private key in HSM or secret manager
3. Enable file integrity monitoring
4. Implement rate limiting
5. Run `pnpm audit` regularly
6. Set up immutable receipt storage
7. Add secret scanning to CI/CD
8. Automate governance pipeline tests
9. Harden CIF input validation
10. Establish incident response plan

---

## How to Verify

```bash
# Verify genome signature
npx tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Run security tests
pnpm -r test

# Check for dependency vulnerabilities
pnpm audit
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Governance pipeline | `packages/mathison-governance/` |
| Server hooks | `packages/mathison-server/src/index.ts` |
| Genome verification | `packages/mathison-genome/` |
| Security tests | `packages/*/src/__tests__/` |
