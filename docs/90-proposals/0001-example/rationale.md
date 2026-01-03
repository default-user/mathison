# Proposal 0001: Example Genome Mutation

**Version:** 1.0.0
**Status:** Template Only
**Last Updated:** 2026-01-03

---

## Who This Is For

- Contributors learning the proposal format
- Reviewers understanding proposal structure

## Why This Exists

This is a template demonstrating the expected structure for genome mutation proposals.

---

## Rationale

This is an **example proposal** demonstrating the structure for proposing changes to a Memetic Genome.

## Proposed Changes

### Add New Capability

```json
{
  "cap_id": "CAP-EXAMPLE",
  "risk_class": "B",
  "allow_actions": ["example_action"],
  "deny_actions": []
}
```

## Impact Analysis

### Invariants Still Hold

- **INV-001 (consent_wins)**: Not affected ✓
- **INV-002 (fail_closed)**: Not affected ✓
- **INV-003 (no_hive)**: Not affected ✓

### Breaking Changes

None. Backwards-compatible addition.

## Approval Status

- [ ] Technical review
- [ ] Security review
- [ ] Authority signature
- [ ] Deployed to production

---

## Implementation Pointers

| Component | Path |
|-----------|------|
| Proposals readme | `docs/90-proposals/readme.md` |
| Genome system | `packages/mathison-genome/` |
