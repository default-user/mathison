# Genome Audit Model

> Describes the security and integrity model for Memetic Genomes after audit hardening

## Who This Is For

- **Security auditors** verifying genome integrity mechanisms
- **DevOps engineers** implementing genome signing workflows
- **Build engineers** setting up manifest verification
- **Compliance officers** requiring cryptographic provenance
- **System administrators** managing genome deployment and verification

## Why This Exists

Memetic Genomes define the governance root and capability ceiling for an OI system. Without cryptographic integrity, an attacker could substitute a malicious genome, bypass governance, and gain unauthorized capabilities. This audit model ensures genomes are tamper-evident, multi-party governed, and traceable to specific source code states.

## Guarantees / Invariants

1. **Canonical byte stability** — Same genome content always produces identical canonical bytes
2. **Signature verification required** — Invalid signatures prevent system boot (fail-closed)
3. **Threshold enforcement** — M-of-N signers required when threshold > 1
4. **Build manifest integrity** — Production mode verifies source code hashes
5. **Tamper detection** — Any modification breaks signature verification
6. **Reproducible genome_id** — SHA-256 of canonical bytes enables content addressing
7. **No runtime modification** — Loaded genomes are immutable

## Non-Goals

- **Timestamp verification** — Signature freshness not enforced (future enhancement)
- **Key revocation** — No revocation registry (future enhancement)
- **HSM integration** — Standard file-based keys only (future enhancement)
- **Transparency log** — No global genome registry (future enhancement)
- **Automated key rotation** — Manual process only

---

## 1) Canonicalization Rules

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

## 2) Signature Model

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

## 3) Threshold Verification Rule

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

## 4) Build Manifest Verification

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

## 5) Failure Modes & Mitigations

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

## 6) Operational Workflows

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

## 7) Security Properties

**Integrity:** Canonical bytes + cryptographic signatures prevent tampering
**Authenticity:** Public keys in authority prove signer identity
**Auditability:** genome_id = sha256(canonical_bytes) enables content addressing
**Accountability:** Signer key_id traced in signatures
**Governance:** Threshold enforcement requires multi-party approval
**Build provenance:** Manifest verification proves source code state

---

## 8) Future Enhancements (Out of Scope)

- Timestamp verification (signature freshness)
- Key rotation / revocation registry
- Merkle tree for large file manifests
- Hardware security module (HSM) integration
- Transparency log (append-only genome registry)

---

**Version:** GENOME-AUDIT v1.0 (Hardening)
**Last updated:** 2025-12-31

---

## How to Verify

### Automated Verification
```bash
# Verify genome signature
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Verify with build manifest
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json --verify-manifest

# Run genome boot tests
pnpm --filter mathison-server test genome-boot-conformance.test.ts

# Test canonicalization stability
pnpm --filter mathison-genome test canonicalization.test.ts
```

### Manual Verification
1. **Signature tampering test**: Modify genome.json, verify fails
2. **Threshold test**: Create 2-of-3 genome, verify with only 1 signature fails
3. **Manifest test**: Modify source file, verify fails in production mode
4. **Canonicalization test**: Reformat genome.json, verify signature still valid
5. **Unknown signer test**: Add signature from unknown key, verify fails

### Audit Checklist
- [ ] All genomes in `/genomes` directory have valid signatures
- [ ] Production genomes have `threshold >= 2` for critical systems
- [ ] Build manifests present and verified for production genomes
- [ ] Canonicalization produces identical bytes on repeated calls
- [ ] Boot fails when genome signature invalid
- [ ] Boot fails when manifest verification fails (production mode)

## Implementation Pointers

### Core Components
- **Genome loader**: `/home/user/mathison/packages/mathison-genome/src/genome-loader.ts`
  - Signature verification
  - Threshold enforcement
  - Manifest verification

- **Canonicalization**: `/home/user/mathison/packages/mathison-genome/src/canonicalize.ts`
  - Deep key sorting
  - Signature field exclusion
  - UTF-8 encoding

- **Signing scripts**: `/home/user/mathison/scripts/genome-sign.ts`
- **Verification scripts**: `/home/user/mathison/scripts/genome-verify.ts`
- **Manifest builder**: `/home/user/mathison/scripts/genome-build-manifest.ts`

### Genome Structure
```typescript
interface Genome {
  genome_id: string;           // sha256(canonical_bytes)
  version: string;
  authority: {
    signers: Array<{
      key_id: string;
      alg: "ed25519";
      public_key: string;      // base64 encoded
    }>;
    threshold: number;
  };
  capabilities: { /* ... */ };
  build_manifest?: {
    files: Array<{
      path: string;
      sha256: string;
    }>;
  };
  signature?: {                // Legacy single signature
    alg: "ed25519";
    signer_key_id: string;
    sig_base64: string;
  };
  signatures?: Array<{         // Multi-signature
    alg: "ed25519";
    signer_key_id: string;
    sig_base64: string;
  }>;
}
```

### Verification Flow
```typescript
// 1. Load genome
const genome = await loadGenome('path/to/genome.json');

// 2. Canonicalize (removes signatures)
const canonical = canonicalizeGenome(genome);

// 3. Extract signatures
const sigs = genome.signatures || [genome.signature];

// 4. Verify each signature
const validSigners = new Set();
for (const sig of sigs) {
  const signer = genome.authority.signers.find(s => s.key_id === sig.signer_key_id);
  if (!signer) continue;

  const valid = crypto.verify(
    null,
    Buffer.from(canonical),
    {
      key: Buffer.from(signer.public_key, 'base64'),
      format: 'der',
      type: 'spki'
    },
    Buffer.from(sig.sig_base64, 'base64')
  );

  if (valid) validSigners.add(signer.key_id);
}

// 5. Check threshold
if (validSigners.size < genome.authority.threshold) {
  throw new Error('Threshold not met');
}

// 6. Verify manifest (if enabled)
if (verifyManifest && genome.build_manifest) {
  for (const file of genome.build_manifest.files) {
    const content = await fs.readFile(file.path);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    if (hash !== file.sha256) {
      throw new Error(`Manifest verification failed: ${file.path}`);
    }
  }
}
```

### Test Coverage
- **Boot conformance**: `packages/mathison-server/src/__tests__/genome-boot-conformance.test.ts`
- **Canonicalization**: `packages/mathison-genome/tests/canonicalization.test.ts`
- **Signature verification**: `packages/mathison-genome/tests/signature.test.ts`
- **Threshold verification**: `packages/mathison-genome/tests/threshold.test.ts`
- **Manifest verification**: `packages/mathison-genome/tests/manifest.test.ts`

### Key Management
- **Development keys**: `/home/user/mathison/keys/dev/` (public keys in genomes)
- **Production keys**: NOT in repo (external key management)
- **Key generation**: `ssh-keygen -t ed25519 -f keys/my-key`
- **Public key extraction**: `ssh-keygen -f keys/my-key.pub -e -m PKCS8`

### Extension Guide
1. **Add new signer**: Add entry to `authority.signers` array
2. **Increase threshold**: Set `authority.threshold` to desired M-of-N
3. **Add manifest files**: Run `pnpm genome:build-manifest` to generate hashes
4. **Multi-signature workflow**: Each signer runs `genome:sign --multi` sequentially
5. **Custom signing algorithm**: Extend `alg` enum (currently ed25519 only)
