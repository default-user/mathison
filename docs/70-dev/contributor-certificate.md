# Contributor Certificate of Origin

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Contributors submitting code to Mathison
- Maintainers reviewing contributions
- Legal teams verifying contribution rights

## Why This Exists

This certificate ensures contributors have the legal right to submit their code and clarifies ownership and licensing.

## Guarantees / Invariants

1. All contributions are submitted under Apache License 2.0
2. Contributors attest to having rights to submit code
3. AI-assisted code must be human-reviewed
4. Contributions become part of the public record

---

## Certificate Template

By submitting a contribution, you certify that:

1. **Ownership:** You have the legal right to contribute under Apache License 2.0
2. **Original Work:** The contribution is original or properly attributed open-source
3. **No Proprietary Code:** You haven't copied proprietary code
4. **AI-Assisted Work:** You've reviewed all AI-generated code
5. **License Agreement:** You agree to license under Apache License 2.0
6. **Public Record:** You understand this becomes public record

## How to Attest

### Option 1: Inline (Preferred)

Add to your PR description:

```
I certify that this contribution complies with the Contributor Certificate
as specified in CONTRIBUTOR_CERTIFICATE.md.

Signed: [Your Name] <your.email@example.com>
Date: YYYY-MM-DD
```

### Option 2: Signed File

Create `CONTRIBUTOR_ATTESTATION_<username>.txt` with full attestation.

## What NOT to Contribute

- Proprietary code
- GPL/AGPL code (incompatible with Apache 2.0)
- Unreviewed AI output
- Credentials or secrets
- PII or confidential data

---

## How to Verify

Check for attestation in PRs:
```bash
gh pr view <pr-number> --json body | jq '.body' | grep -i "certify"
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| This certificate | `docs/70-dev/contributor-certificate.md` |
| License | `LICENSE` |
| Provenance | `docs/61-operations/provenance.md` |
