# Threat Model

## Scope

This threat model covers the Mathison server, storage, governance, and memory systems. It does NOT cover:
- Mobile deployments (see mobile-specific threat models when available)
- Browser runtime (Quadratic Monolith) — separate attack surface
- Network mesh protocol (early stage)

**Current Status:** Prototype / Early Stage — Not production-ready without additional hardening.

## Assets

### High-Value Assets

1. **Memetic Genome (governance root)**
   - Location: `genomes/TOTK_ROOT_v1.0.0/genome.json` (configurable via `MATHISON_GENOME_PATH`)
   - Criticality: CRITICAL — Compromise bypasses all governance
   - Format: JSON with Ed25519 signature

2. **Genome Signing Keys**
   - Location: Test keys in `genomes/*/key.pub` (development only)
   - Criticality: CRITICAL — Allows creating arbitrary valid genomes
   - Note: Production keys MUST be stored in HSM/secret manager

3. **Receipts (audit trail)**
   - Location: Storage backend (FILE: `./data/receipts/`, SQLite: `receipts` table)
   - Criticality: HIGH — Loss of auditability
   - Format: JSON with genome metadata and timestamps

4. **Memory Graph Data (nodes/edges/hyperedges)**
   - Location: Storage backend (FILE: `./data/nodes/`, SQLite: `nodes`/`edges` tables)
   - Criticality: MEDIUM — Contains user data and context
   - Format: JSON blobs with metadata

5. **Server Configuration**
   - Environment variables: `MATHISON_STORE_BACKEND`, `MATHISON_STORE_PATH`, `MATHISON_GENOME_PATH`
   - Criticality: MEDIUM — Misconfig can disable governance
   - Note: Server fails-closed on missing required env vars

### Lower-Value Assets

- Server logs (may contain PII in receipts)
- Job state (in-memory, ephemeral)
- Health check responses (system metadata)

## Trust Boundaries

### Boundary 1: Network → CIF Ingress

**Untrusted → Trusted Transition**

- Entry points: All HTTP endpoints (`/health`, `/jobs/*`, `/memory/*`)
- Enforcement: CIF Ingress hook (Fastify `onRequest`)
- Controls:
  - Request size limits (1MB default)
  - Input sanitization
  - CORS validation

### Boundary 2: CIF → CDI → Handler

**Request → Governed Execution**

- Enforcement: CDI Action Check (Fastify `preHandler`)
- Controls:
  - Treaty rule evaluation
  - Capability ceiling checks
  - Fail-closed on uncertain context
  - ActionGate for all side effects

### Boundary 3: Handler → Storage

**Application → Persistence**

- Enforcement: ActionGate (single chokepoint)
- Controls:
  - Receipt generation before mutation
  - Idempotency key enforcement
  - Backend abstraction (FILE/SQLite swap-ready)

### Boundary 4: CDI → CIF Egress

**Internal → Network Response**

- Enforcement: CIF Egress hook (Fastify `onSend`)
- Controls:
  - Response size limits (1MB default)
  - Leakage detection
  - Receipt inclusion in responses

## Threats and Mitigations

### T1: Genome Compromise (CRITICAL)

**Attack:** Attacker obtains genome signing private key and creates malicious genome.

**Impact:** Complete bypass of governance. Attacker can authorize any action.

**Mitigations (Current):**
- ✅ Test genome uses publicly visible key (documented in SECURITY.md as dev-only)
- ✅ Server verifies Ed25519 signature on boot (fail-closed if invalid)
- ✅ Production requirements document mandates HSM storage

**Mitigations (TODO):**
- ❌ Key rotation mechanism (requires genome version change today)
- ❌ Multi-signature threshold (current: `threshold: 1`)
- ❌ File integrity monitoring for genome files
- ❌ Audit logging for genome mutations

### T2: Genome File Tampering (HIGH)

**Attack:** Attacker modifies genome file on disk (bypass signature check by replacing entire file).

**Impact:** Governance rules altered; capability escalation.

**Mitigations (Current):**
- ✅ Signature verification on boot prevents silent tampering (server will fail)
- ✅ Fail-closed behavior (server refuses to boot with invalid genome)

**Mitigations (TODO):**
- ❌ File system permissions (app user should not have write access)
- ❌ Immutable filesystem for genome directory
- ❌ Runtime integrity checks (not just boot-time)

### T3: Governance Pipeline Bypass (CRITICAL)

**Attack:** Attacker finds route that doesn't go through CIF→CDI pipeline.

**Impact:** Injection attacks, consent violations, capability bypass.

**Mitigations (Current):**
- ✅ Pipeline enforcement is structural (Fastify hooks, cannot disable)
- ✅ All routes registered after hooks are applied
- ✅ Tests verify pipeline active for all endpoints

**Mitigations (TODO):**
- ❌ Automated test for every new route (enforce in CI)
- ❌ Static analysis to detect direct storage access

### T4: ActionGate Bypass (CRITICAL)

**Attack:** Code path that mutates storage without going through ActionGate.

**Impact:** Mutations without receipts; loss of auditability.

**Mitigations (Current):**
- ✅ Single chokepoint design (all mutations route through ActionGate)
- ✅ Storage abstraction prevents direct writes from handlers
- ✅ Tests verify receipts generated for all write operations

**Mitigations (TODO):**
- ❌ TypeScript type system enforcement (make direct writes impossible)
- ❌ Runtime assertion checks in storage layer

### T5: Injection Attacks (SQL/Command/Path Traversal) (HIGH)

**Attack:** Attacker provides malicious input to manipulate queries or filesystem.

**Impact:** Data exfiltration, corruption, or server compromise.

**Mitigations (Current):**
- ✅ SQLite uses parameterized queries (better-sqlite3 prepared statements)
- ✅ FILE backend sanitizes filenames (no path traversal)
- ✅ CIF validates input structure

**Mitigations (TODO):**
- ❌ Formal input validation schema (e.g., Zod)
- ❌ Filesystem sandboxing (chroot or similar)
- ❌ Automated fuzzing tests

### T6: Receipt Tampering / Deletion (MEDIUM)

**Attack:** Attacker modifies or deletes receipts to hide actions.

**Impact:** Loss of audit trail; inability to prove governance compliance.

**Mitigations (Current):**
- ✅ Receipts include genome_id/version (traceable to root)
- ✅ SQLite WAL mode (append-only semantics)
- ✅ FILE backend uses atomic writes

**Mitigations (TODO):**
- ❌ Immutable storage backend (S3 with object lock)
- ❌ Tamper-evident log (blockchain, certificate transparency)
- ❌ Receipt sequence gap detection
- ❌ Cryptographic receipt chain (hash of previous receipt)

### T7: Denial of Service (MEDIUM)

**Attack:** Attacker sends high-volume requests to exhaust resources.

**Impact:** Server unavailability.

**Mitigations (Current):**
- ✅ Request size limits (1MB)
- ✅ Response size limits (1MB)

**Mitigations (TODO):**
- ❌ Rate limiting per IP/client
- ❌ Request queuing and backpressure
- ❌ Resource quotas (memory, disk, CPU)

### T8: Dependency Vulnerabilities (MEDIUM)

**Attack:** Exploits in third-party dependencies (fastify, better-sqlite3, etc.).

**Impact:** Varies (RCE, data leak, DoS).

**Mitigations (Current):**
- ✅ Lockfile pins exact versions (pnpm-lock.yaml)
- ✅ SBOM generation for audit

**Mitigations (TODO):**
- ❌ Automated `pnpm audit` in CI
- ❌ Dependabot or similar auto-updates
- ❌ Supply chain verification (package signatures)

### T9: Credential Leakage (HIGH)

**Attack:** Secrets (API keys, tokens) committed to repo or logged.

**Impact:** Unauthorized access to external services.

**Mitigations (Current):**
- ✅ `.gitignore` excludes `.env` files
- ✅ `.env.example` provided (no actual secrets)
- ✅ SECURITY.md warns against committing production genome keys

**Mitigations (TODO):**
- ❌ Pre-commit hooks to block secrets
- ❌ Secret scanning (GitHub secret scanning, gitleaks)
- ❌ Environment variable validation on startup

### T10: AI Prompt Injection / Tool Manipulation (MEDIUM)

**Attack:** Malicious input to OI engine that causes unintended actions.

**Impact:** Capability escalation, data exfiltration, consent bypass.

**Mitigations (Current):**
- ✅ CDI evaluates all actions (even AI-initiated)
- ✅ Capability ceiling enforced regardless of prompt
- ✅ Consent signals checked structurally

**Mitigations (TODO):**
- ❌ Prompt injection detection heuristics
- ❌ Output filtering before execution
- ❌ Human-in-loop for HIGH/CRITICAL actions

### T11: Supply Chain Compromise (NPM Package Hijack) (LOW)

**Attack:** Attacker publishes malicious version of dependency.

**Impact:** RCE, data theft, backdoor installation.

**Mitigations (Current):**
- ✅ Lockfile prevents automatic updates

**Mitigations (TODO):**
- ❌ Package signature verification
- ❌ Subresource integrity checks
- ❌ Vendor critical dependencies (local copy)

## Out of Scope (For Now)

- Network mesh encryption (planned, not implemented)
- Mobile platform security (separate threat model needed)
- Browser runtime isolation (Quadratic Monolith)
- Cloud deployment hardening (Kubernetes, Terraform, etc.)
- Physical security of deployment environment
- Insider threats (assumes operators are trustworthy)

## Assumptions

1. **Operating System Security:** Assumes underlying OS is not compromised
2. **Node.js Runtime:** Assumes Node.js crypto library is correct (Ed25519 verification)
3. **Operator Trust:** Assumes system operators do not intentionally bypass governance
4. **Network Security:** Assumes HTTPS/TLS terminates before this application (e.g., reverse proxy)
5. **Development Environment:** Test genome keys are acceptable for development (not production)

## Risk Summary

| Threat | Likelihood | Impact | Risk Level | Status |
|--------|------------|--------|------------|--------|
| T1: Genome Compromise | LOW (dev), HIGH (prod) | CRITICAL | HIGH | Partial mitigation |
| T2: Genome Tampering | MEDIUM | HIGH | MEDIUM | Partial mitigation |
| T3: Pipeline Bypass | LOW | CRITICAL | MEDIUM | Mitigated (structural) |
| T4: ActionGate Bypass | LOW | CRITICAL | MEDIUM | Mitigated (structural) |
| T5: Injection Attacks | MEDIUM | HIGH | MEDIUM | Partial mitigation |
| T6: Receipt Tampering | MEDIUM | MEDIUM | MEDIUM | Partial mitigation |
| T7: Denial of Service | HIGH | MEDIUM | MEDIUM | Minimal mitigation |
| T8: Dependency Vuln | MEDIUM | MEDIUM | MEDIUM | Minimal mitigation |
| T9: Credential Leakage | LOW (dev), HIGH (prod) | HIGH | MEDIUM | Partial mitigation |
| T10: Prompt Injection | MEDIUM | MEDIUM | MEDIUM | Partial mitigation |
| T11: Supply Chain | LOW | HIGH | LOW | Minimal mitigation |

## Recommendations for Production Deployment

Before deploying to production:

1. **Generate unique production genome signing keypair** (not test keys)
2. **Store private key in HSM or secret manager** (never in code/config)
3. **Enable file integrity monitoring** for genome files
4. **Implement rate limiting** (per-IP, per-client)
5. **Run `pnpm audit`** and address HIGH/CRITICAL vulnerabilities
6. **Set up immutable receipt storage** (S3 object lock, etc.)
7. **Add secret scanning** to CI/CD pipeline
8. **Implement automated testing** for governance pipeline on all routes
9. **Review and harden CIF input validation** (add formal schema)
10. **Establish incident response plan** (what to do if genome is compromised)

See `PRODUCTION_REQUIREMENTS.md` for complete checklist.

## Updates

This threat model should be reviewed:
- On every major feature addition
- After security incidents
- Quarterly (minimum)

**Last Updated:** 2025-12-31
