# ADR-0002: Establish THE_WHY_PROTOCOL as Operational Doctrine
Date: 2026-01-03  
Status: Accepted

## Context

Mathison already contains a strong governance spine (Tiriti, CIF/CDI specs, threat model, governance claims, conformance tests).
However, the **operational “why”** is currently spread across multiple documents and conversations.

This creates a predictable drift risk:
- future contributors optimize for speed or “helpfulness,”
- new routes/integrations appear with implicit authority,
- exceptions accumulate (“internal only”),
- and the charter becomes symbolic instead of mechanical.

We want a single, small, canonical artifact that:
- states non‑negotiables in executable terms,
- defines authority precedence,
- provides alignment tests,
- and is easy for coding agents to ingest before changes.

## Decision

Add **THE_WHY_PROTOCOL.md** at repo root as the canonical operational doctrine that:
1) is explicitly **subordinate to `docs/31-governance/tiriti.md`** (charter precedence),
2) codifies the **Prime Loop** requirement (CIF→CDI→handler→CDI→CIF),
3) mandates **fail‑closed**, capability‑only authority, oracle‑not‑sovereign models,
4) preserves anti‑hive identity integrity and human‑paced care defaults,
5) provides “WHY tests” as regression alignment checks,
6) includes a meta‑why section explaining why protocolization is necessary.

## Consequences

**Positive**
- Contributors and coding agents have a single “north star” file.
- Governance becomes harder to bypass by accident.
- The charter gets translated into engineering behaviour.
- Drift is easier to detect and discuss.

**Tradeoffs**
- Adds an additional canonical document to maintain.
- If the protocol becomes too verbose, agents may stop reading it.
  Mitigation: keep it tight; link outward to deeper specs.

## References

- Charter: `docs/31-governance/tiriti.md`
- Governance specs: `docs/31-governance/cif-spec.md`, `docs/31-governance/cdi-spec.md`
- Threat model: `docs/61-operations/threat-model.md`
- Governance claims: `docs/31-governance/governance-claims.md`
- Conformance tests: `packages/mathison-server/src/__tests__/server-conformance.test.ts`
