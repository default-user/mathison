# Genome Audit Model

> Describes the security and integrity model for Memetic Genomes after audit hardening

---

## 1. Canonicalization Rules

**Purpose:** Produce stable, deterministic byte representation for signature verification

**Rules:**
1. **Recursive key sorting:** All object keys sorted lexicographically at every nesting level
2. **Array order preservation:** Arrays maintain declared order (they are ordered sequences)
3. **No whitespace:** JSON emitted with no indentation or spacing
4. **UTF-8 encoding:** Canonical bytes always UTF-8 encoded
5. **Signature exclusion:** `signature` and `signatures` fields removed before canonicalization

**Implementation:** `canonicalizeGenome(genome: Genome): string`

**Rationale:**
- Ensures byte-identical canonical form regardless of field ordering in source JSON
- Prevents signature breakage from non-semantic formatting changes
- Enables reproducible genome_id computation

---

## 2. Signature Model

**Supported algorithms:** ed25519 only

**Signature types:**

### Legacy single signature
```json
{
  "signature": {
    "alg": "ed25519",
    "signer_key_id": "key-001",
    "sig_base64": "..."
  }
}
```

### Multi-signature (threshold)
```json
{
  "signatures": [
    { "alg": "ed25519", "signer_key_id": "key-001", "sig_base64": "..." },
    { "alg": "ed25519", "signer_key_id": "key-002", "sig_base64": "..." }
  ]
}
```

**Signing process:**
1. Remove `signature` and `signatures` fields from genome
2. Compute canonical JSON: `canonicalizeGenome(genome)`
3. Compute signature: `ed25519.sign(canonical_bytes, private_key)`
4. Encode signature as base64
5. Add signature object to genome

---

## 3. Threshold Verification Rule

**Authority schema:**
```json
{
  "authority": {
    "signers": [
      { "key_id": "key-001", "alg": "ed25519", "public_key": "..." },
      { "key_id": "key-002", "alg": "ed25519", "public_key": "..." }
    ],
    "threshold": 2
  }
}
```

**Verification algorithm:**
1. Extract all signatures (from `signature` or `signatures` fields)
2. For each signature:
   - Find signer in `authority.signers` by `key_id`
   - Verify signature against canonical bytes using signer's public key
   - If valid, add signer to `valid_signers` set (deduplicated)
3. Check: `valid_signers.size >= authority.threshold`
4. If yes → verified; if no → fail-closed

**Constraints:**
- `threshold` must be >= 1 and <= `signers.length`
- Duplicate signatures from same signer counted once
- Unknown signers → verification fails
- Algorithm mismatch → verification fails

**Rationale:**
- Enables multi-party governance (requires M-of-N signers)
- Prevents single key compromise from authorizing genomes
- Deduplication prevents signer double-counting

---

## 4. Build Manifest Verification

**Manifest schema:**
```json
{
  "build_manifest": {
    "files": [
      { "path": "packages/foo/src/index.ts", "sha256": "abc123..." },
      { "path": "packages/bar/src/main.ts", "sha256": "def456..." }
    ]
  }
}
```

**Verification algorithm (when enabled):**
1. For each file in `build_manifest.files`:
   - Resolve absolute path: `join(repoRoot, file.path)`
   - Read file contents
   - Compute SHA-256 hash
   - Compare to declared `file.sha256`
2. If any mismatch or missing file → fail-closed
3. If all match → verification succeeds

**Modes:**
- **Production:** Manifest verification ON by default (`MATHISON_ENV=production`)
- **Development:** Manifest verification optional (pass `verifyManifest: true` explicitly)

**Rationale:**
- Proves genome was built from specific source code state
- Prevents runtime substitution attacks
- Enables reproducible builds and audit trails
- Fail-closed ensures integrity before boot

---

## 5. Failure Modes & Mitigations

### 5.1 Signature verification fails
**Failure:** Invalid signature, unknown signer, or threshold unmet
**Mitigation:** Fail-closed — refuse to load genome, return 503 on boot
**Test:** genome-boot-conformance.test.ts

### 5.2 Manifest verification fails
**Failure:** File hash mismatch or missing file
**Mitigation:** Fail-closed in production mode
**Test:** genome-conformance.test.ts + boot tests

### 5.3 Canonicalization instability
**Failure:** Different canonical bytes for same genome content
**Mitigation:** Deep key sorting + strict UTF-8 encoding + no whitespace
**Test:** Repeated canonicalization produces identical bytes

### 5.4 Threshold misconfiguration
**Failure:** `threshold > signers.length` or `threshold < 1`
**Mitigation:** Schema validation rejects invalid genomes
**Test:** validateGenomeSchema catches invalid thresholds

### 5.5 Key compromise (single signer)
**Failure:** Attacker signs malicious genome with compromised key
**Mitigation:** Multi-signature threshold (require M-of-N signers)
**Example:** threshold=2 requires two independent signers → single key compromise insufficient

---

## 6. Operational Workflows

### 6.1 Create new genome
```bash
# 1. Build manifest
pnpm genome:build-manifest genomes/MY_GENOME_v1.0.0

# 2. Sign genome (requires private key)
pnpm genome:sign genomes/MY_GENOME_v1.0.0/genome.json --key-file keys/my-key.pem

# 3. Verify genome
pnpm genome:verify genomes/MY_GENOME_v1.0.0/genome.json --verify-manifest
```

### 6.2 Re-sign after canonicalization change
```bash
# Migration script re-signs all genomes with new canonicalization
pnpm genome:migrate-signatures
```

### 6.3 Add second signature (threshold governance)
```bash
# Signer 1
pnpm genome:sign genomes/MY_GENOME_v1.0.0/genome.json --key-file keys/signer-1.pem

# Signer 2 (adds second signature)
pnpm genome:sign genomes/MY_GENOME_v1.0.0/genome.json --key-file keys/signer-2.pem --multi

# Verify threshold met
pnpm genome:verify genomes/MY_GENOME_v1.0.0/genome.json
```

---

## 7. Security Properties

**Integrity:** Canonical bytes + cryptographic signatures prevent tampering
**Authenticity:** Public keys in authority prove signer identity
**Auditability:** genome_id = sha256(canonical_bytes) enables content addressing
**Accountability:** Signer key_id traced in signatures
**Governance:** Threshold enforcement requires multi-party approval
**Build provenance:** Manifest verification proves source code state

---

## 8. Future Enhancements (Out of Scope)

- Timestamp verification (signature freshness)
- Key rotation / revocation registry
- Merkle tree for large file manifests
- Hardware security module (HSM) integration
- Transparency log (append-only genome registry)

---

**Version:** GENOME-AUDIT v1.0 (Hardening)
**Last updated:** 2025-12-31
