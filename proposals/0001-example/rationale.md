# Proposal 0001: Example Genome Mutation

## Rationale

This is an **example proposal** demonstrating the structure for proposing changes to a Memetic Genome.

In production, genome mutations would follow this process:

1. **Draft proposal** with clear rationale
2. **Identify impacted invariants** and verify they still hold
3. **Create required conformance tests** proving the mutation is safe
4. **Review and approval** by governance authority
5. **Create new genome version** with updated signature
6. **Deploy with lineage tracking** (parent genome_id recorded)

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

### Update Invariant Enforcement

Enhance INV-006 (attribution) to include proposal_id in mutation receipts, enabling full audit trail from root genome through all mutations.

## Impact Analysis

### Invariants Still Hold

- **INV-001 (consent_wins)**: Not affected ✓
- **INV-002 (fail_closed)**: Not affected ✓
- **INV-003 (no_hive)**: Not affected ✓
- **INV-004 (non_personhood)**: Not affected ✓
- **INV-005 (honest_limits)**: Not affected ✓
- **INV-006 (attribution)**: Enhanced (proposal tracking added) ✓

### Breaking Changes

None. This is a backwards-compatible addition.

## Required Tests

1. Validate proposal structure against schema
2. Verify lineage from TOTK_ROOT to proposed genome
3. Confirm all invariants still pass conformance tests
4. Test new capability does not violate existing denials

## Approval Status

- [ ] Technical review
- [ ] Security review
- [ ] Authority signature
- [ ] Deployed to production

## Notes

This is a **template only**. Real proposals would include:
- Specific technical details
- Security impact assessment
- Performance implications
- Migration plan if needed
