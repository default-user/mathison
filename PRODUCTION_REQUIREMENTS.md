# Production Deployment Requirements - REQUIRED READING

## CRITICAL: Replace Test Keys Before Production

The genome in `genomes/TOTK_ROOT_v1.0.0/genome.json` is signed with a **TEST KEY** that is publicly visible in the repository. This is acceptable for development, but **MUST BE REPLACED** before production deployment.

## Production Key Generation and Signing

### Step 1: Generate Production Keypair

```bash
# Generate a new production keypair
npx tsx scripts/genome-keygen.ts production-key-001 > production-key.json 2> production-key-secret.txt

# The private key is in production-key-secret.txt (KEEP SECRET!)
# The public key JSON is in production-key.json
```

### Step 2: Create Production Genome

1. Copy `genomes/TOTK_ROOT_v1.0.0/genome-unsigned.json` to a new version directory
2. Update the `authority.signers` array with the public key from `production-key.json`
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

Set the environment variable in your production environment:

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

## Genome Mutation Process (Production)

When you need to update the genome in production:

1. Create a proposal in `proposals/NNNN-description/`
2. Review proposal with security team
3. Create new genome version with updated invariants/capabilities
4. Sign with production key
5. Deploy new genome
6. Restart server (server will load new genome on boot)
7. Verify new genome is active via GET /genome endpoint

## Failure Recovery

If genome verification fails on production boot:

1. Server will refuse to start (fail-closed)
2. Check logs for specific error (GENOME_MISSING, GENOME_INVALID_SIGNATURE, etc.)
3. Verify MATHISON_GENOME_PATH points to correct file
4. Verify genome file is readable by application user
5. Verify genome signature is valid
6. If signature invalid, regenerate with correct key

## Monitoring

Monitor these metrics in production:

- Server boot failures due to genome errors
- Genome capability denials (actions blocked by capability ceiling)
- Genome mutations (changes to active genome)
- Time since last genome update

## Support

For questions about genome management in production, see:
- `genomes/TOTK_ROOT_v1.0.0/README.md` — Understanding invariants and capabilities
- `packages/mathison-genome/README.md` — Technical implementation details
- `proposals/README.md` — Genome mutation governance process
