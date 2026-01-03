# Production Requirements

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Operators preparing Mathison for production deployment
- Security engineers hardening the deployment
- DevOps teams setting up production infrastructure

## Why This Exists

The genome in `genomes/TOTK_ROOT_v1.0.0/genome.json` is signed with a **TEST KEY** that is publicly visible in the repository. This is acceptable for development, but **MUST BE REPLACED** before production deployment.

## Guarantees / Invariants

1. Server fails-closed with invalid genome (cannot start)
2. Ed25519 signature verification is mandatory
3. Missing environment variables cause boot failure
4. All side effects require valid governance context

## Non-Goals

- This guide does NOT cover HSM-specific configuration
- This guide does NOT provide key escrow procedures
- This guide does NOT configure multi-region deployment

---

## CRITICAL: Replace Test Keys Before Production

### Step 1: Generate Production Keypair

```bash
# Generate a new production keypair
npx tsx scripts/genome-keygen.ts production-key-001 > production-key.json 2> production-key-secret.txt

# The private key is in production-key-secret.txt (KEEP SECRET!)
# The public key JSON is in production-key.json
```

### Step 2: Create Production Genome

1. Copy `genomes/TOTK_ROOT_v1.0.0/genome-unsigned.json` to a new version directory
2. Update the `authority.signers` array with the public key
3. Update the `created_at` timestamp
4. Increment the version if needed

### Step 3: Sign Production Genome

```bash
# Set the private key as an environment variable
export GENOME_SIGNING_PRIVATE_KEY="<paste from production-key-secret.txt>"

# Sign the genome
npx tsx scripts/genome-sign.ts \
  genomes/TOTK_PROD_v1.0.0/genome-unsigned.json \
  genomes/TOTK_PROD_v1.0.0/genome.json \
  production-key-001

# IMMEDIATELY delete production-key-secret.txt
rm production-key-secret.txt
```

### Step 4: Deploy Production Genome

```bash
export MATHISON_GENOME_PATH=/path/to/genomes/TOTK_PROD_v1.0.0/genome.json
```

## Security Checklist

- [ ] Generated new production keypair
- [ ] Stored private key in secure secret manager (Vault, AWS Secrets Manager, etc.)
- [ ] Removed private key from local filesystem
- [ ] Updated genome with production public key
- [ ] Signed production genome
- [ ] Verified genome signature: `npx tsx scripts/genome-verify.ts <genome-path>`
- [ ] Set MATHISON_GENOME_PATH in production environment
- [ ] Confirmed server boots successfully in production
- [ ] **NEVER committed private key to git**

## Key Storage Recommendations

### DO:
- Store private keys in a dedicated secret management system
- Use hardware security modules (HSMs) for key storage if available
- Implement key rotation policies
- Audit all genome signing operations
- Use separate keys for dev/staging/production

### DON'T:
- Commit private keys to version control
- Share private keys via email/Slack/etc.
- Store private keys in application configuration files
- Use the same key across environments

## Failure Recovery

If genome verification fails on production boot:

1. Server will refuse to start (fail-closed)
2. Check logs for specific error (GENOME_MISSING, GENOME_INVALID_SIGNATURE, etc.)
3. Verify MATHISON_GENOME_PATH points to correct file
4. Verify genome file is readable by application user
5. Verify genome signature is valid
6. If signature invalid, regenerate with correct key

---

## How to Verify

```bash
# Verify genome signature
npx tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Test boot with production genome
MATHISON_GENOME_PATH=/path/to/production/genome.json pnpm server

# Verify server health
curl http://localhost:3000/health | jq '.governance'
```

## Implementation Pointers

| Component | Path |
|-----------|------|
| Keygen script | `scripts/genome-keygen.ts` |
| Sign script | `scripts/genome-sign.ts` |
| Verify script | `scripts/genome-verify.ts` |
| Genome loader | `packages/mathison-genome/src/genome-loader.ts` |
| Test genome | `genomes/TOTK_ROOT_v1.0.0/` |
