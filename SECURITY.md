# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in Mathison, please report it privately:

1. **DO NOT** create a public GitHub issue
2. Email security details to your designated security contact
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fixes (if any)

We will respond within 48 hours and work with you to address the issue.

## Security-Critical Components

### Memetic Genome System

The Memetic Genome is the **governance root** of Mathison. Compromising it would bypass all safety constraints.

**Threat Model:**

1. **Key Compromise**: If an attacker obtains the genome signing private key, they can create arbitrary genomes that the server will accept as valid.
   - **Mitigation**: Store private keys in HSMs or secret managers, never in code/configs
   - **Detection**: Audit all genome mutations, monitor for unexpected genome changes

2. **Genome Tampering**: If an attacker can modify genome files on disk, they can alter invariants/capabilities.
   - **Mitigation**: Server verifies Ed25519 signature on every boot (fail-closed)
   - **Detection**: File integrity monitoring, unexpected boot failures

3. **Capability Escalation**: If an attacker can bypass capability ceiling checks, they can perform actions the genome denies.
   - **Mitigation**: Capability checks happen in CDI layer before action execution
   - **Detection**: Monitor receipts for unexpected actions

**Production Requirements:**

- [ ] Genome signing keys stored in dedicated secret management system
- [ ] File system permissions prevent genome file modification by application user
- [ ] Genome mutations require multi-party approval
- [ ] All genome changes audited and logged
- [ ] Key rotation policy in place (recommend yearly minimum)

### CIF/CDI Governance Pipeline

Every request passes through: CIF Ingress → CDI Action Check → Handler → CDI Output Check → CIF Egress

**Bypassing this pipeline would allow:**
- Injection attacks
- Consent violations
- Capability ceiling bypass
- Treaty rule violations

**Protections:**
- Pipeline enforcement is structural (Fastify hooks, cannot be disabled)
- All side effects route through ActionGate (single chokepoint)
- Tests verify pipeline is active for all routes

### Receipt Auditability

Receipts are the permanent audit trail. If receipts can be tampered with or deleted, auditability is lost.

**Protections:**
- Receipts include genome_id/genome_version (traceable to governance root)
- Receipt store is append-only (SQLite backend uses WAL mode)
- File backend uses atomic writes

**Production Recommendations:**
- Use immutable storage backends for receipts (S3 with object lock, etc.)
- Export receipts to tamper-evident log (blockchain, certificate transparency, etc.)
- Monitor for gaps in receipt sequence

## Known Limitations

1. **Node.js Dependency**: This implementation relies on Node.js Web Crypto API for Ed25519. If the Node.js crypto implementation has vulnerabilities, signature verification may be compromised.

2. **Test Keys in Repository**: The test genome (`genomes/TOTK_ROOT_v1.0.0/genome.json`) is signed with a publicly visible key. **This is intentional for development** but MUST be replaced before production. See `PRODUCTION_REQUIREMENTS.md`.

3. **No Key Rotation Mechanism**: Currently, rotating genome signing keys requires creating a new genome version with updated authority.signers. Future versions should support key rotation without genome version changes.

4. **Single Signer**: The current implementation uses `threshold: 1`, meaning a single signer can authorize genome mutations. Production deployments should consider multi-signature requirements.

## Secure Defaults

Mathison is designed with fail-closed defaults:

- Missing/invalid genome → server refuses to boot
- Uncertain action context → deny by default (CDI strict mode)
- Unknown routes → 404 with explicit denial
- Side effects without receipts → execution fails

**Configuration that weakens security:**
- Setting `cdiStrictMode: false` (allows uncertain actions)
- Using test genome in production
- Disabling signature verification (not possible without code changes)

## Dependency Security

Run `pnpm audit` regularly to check for vulnerabilities in dependencies.

Critical dependencies:
- `better-sqlite3` (receipt/checkpoint storage)
- `fastify` (HTTP server, governance hooks)
- Node.js built-in `crypto` (signature verification)

## Compliance

### Privacy

- User consent signals are stored in-memory only (not persisted)
- Receipts may contain PII depending on action payloads (review before logging)
- No telemetry or external data transmission by default

### Auditability

- All side effects generate receipts with genome metadata
- Genome mutations require explicit proposal artifacts
- Receipt stores are append-only

### Non-Repudiation

- Genome signatures provide cryptographic proof of authorization
- Ed25519 is quantum-resistant (NIST PQC candidate)
- Receipts include timestamp, actor, and genome version

## Security Checklist for Production

- [ ] Generated unique production genome signing keypair
- [ ] Stored private key in HSM or secret manager (NOT in code/configs)
- [ ] Deployed production genome with valid signature
- [ ] Verified MATHISON_GENOME_PATH points to production genome
- [ ] Confirmed server fails to boot with missing/invalid genome
- [ ] Set up file integrity monitoring for genome files
- [ ] Configured append-only receipt storage
- [ ] Enabled audit logging for all genome mutations
- [ ] Established key rotation schedule
- [ ] Reviewed capability ceiling allows only required actions
- [ ] Confirmed all side effects generate receipts
- [ ] Tested fail-closed behavior (missing env vars, invalid configs, etc.)

## Contact

For security concerns, contact your designated security team or maintainer.

Last Updated: 2025-12-31
