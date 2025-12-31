# Governance Claims

## Purpose

This document provides a truth table for governance claims. Claims are only marked as "Implemented" if they are enforced in code and verified by tests.

**Evaluation Criteria:**
- ✅ **Implemented:** Code exists AND tests verify behavior
- ⚠️ **Partial:** Code exists but not fully tested OR enforcement is incomplete
- ❌ **Not Implemented:** No code, no enforcement, or tests show it doesn't work

## Treaty-Based Governance (Tiriti o te Kai v1.0)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Treaty Loading** | ✅ | `packages/mathison-governance/src/index.ts:50-74` | Loads `docs/tiriti.md` on boot, parses version |
| **People First Authority** | ⚠️ | `packages/mathison-governance/src/index.ts:136` | Metadata tracked, no runtime enforcement |
| **Consent Wins** | ✅ | `packages/mathison-governance/src/index.ts:78-88` | Rule denies actions when `userSignal === 'stop'` |
| **Fail-Closed by Default** | ✅ | `packages/mathison-governance/src/cdi.ts` | CDI denies uncertain actions in strict mode |
| **No Hive Mind** | ✅ | `packages/mathison-governance/src/index.ts:91-101` | Blocks `merge_agent_state` and `share_identity` actions |
| **Non-Personhood Clause** | ✅ | `packages/mathison-governance/src/index.ts:104-120` | Regex-based output filtering for sentience claims |
| **Honest Limits** | ⚠️ | Manual review | No automated enforcement |

## Governance Pipeline (Structural Enforcement)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **CIF Ingress on All Requests** | ✅ | `packages/mathison-server` (Fastify `onRequest` hook) | Tests: `server-conformance.test.ts` |
| **CDI Action Check on All Requests** | ✅ | `packages/mathison-server` (Fastify `preHandler` hook) | Tests: `server-conformance.test.ts` |
| **CDI Output Check on All Responses** | ✅ | `packages/mathison-server` (Fastify `onSend` hook) | Tests: `server-conformance.test.ts` |
| **CIF Egress on All Responses** | ✅ | `packages/mathison-server` (Fastify `onSend` hook) | Tests: `server-conformance.test.ts` |
| **Pipeline Cannot Be Bypassed** | ✅ | Fastify hooks (structural) | Hooks registered at boot, cannot be removed |
| **All Routes Governed** | ✅ | Routes registered after hooks | Tests verify pipeline runs for all endpoints |

## ActionGate (Side Effect Control)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **All Mutations Via ActionGate** | ✅ | `packages/mathison-governance/src/cdi.ts` (ActionGate) | Write API routes call ActionGate |
| **Receipts Generated for All Writes** | ✅ | ActionGate + storage tests | Tests: `memory-write-conformance.test.ts` |
| **Idempotency Enforcement** | ✅ | ActionGate idempotency key checks | Duplicate requests return cached response |
| **Direct Storage Access Prevented** | ⚠️ | Convention (not type-enforced) | No TypeScript enforcement; relies on code review |

## Memetic Genome (Governance Root)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Genome Signature Verification** | ✅ | `packages/mathison-genome/src/genome-loader.ts` | Ed25519 verification on boot |
| **Boot Fails with Invalid Genome** | ✅ | Server boot logic + tests | Tests: `genome-boot-conformance.test.ts` |
| **Genome Includes Capability Ceiling** | ✅ | Genome JSON schema | Tests: `genome-capability.test.ts` |
| **Capability Ceiling Enforced** | ✅ | CDI checks capabilities before allowing actions | Tests verify denials for exceeded caps |
| **Multi-Signature Support** | ⚠️ | Genome schema has `threshold` field | Always set to `1` (single signer); multi-sig not tested |
| **Key Rotation Mechanism** | ❌ | Not implemented | Requires new genome version |

## Receipts (Auditability)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Receipts Include Genome Metadata** | ✅ | Receipt schema includes `genome_id`, `genome_version` | Tests verify fields present |
| **Receipts Include Timestamp** | ✅ | Receipt schema | ISO 8601 timestamps |
| **Receipts Include Action + Decision** | ✅ | Receipt schema | `action`, `decision`, `policy_id` fields |
| **Receipts Stored in Backend** | ✅ | FILE/SQLite storage | Tests: `memory-write-conformance.test.ts` |
| **Receipts Returned to Client** | ✅ | API responses include `receipt` field | Tests verify receipt in response |
| **Receipt Append-Only Storage** | ⚠️ | SQLite WAL mode (partial) | No hard guarantee; depends on backend config |
| **Receipt Hash Chain** | ❌ | Not implemented | Planned; no cryptographic linking yet |
| **Receipt Tampering Detection** | ❌ | Not implemented | No integrity checks on stored receipts |

## Memory Graph (Storage Layer)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Nodes, Edges, Hyperedges Supported** | ✅ | `packages/mathison-memory/src/memory-graph.ts` | Full CRUD operations |
| **Backend Abstraction (FILE/SQLite)** | ✅ | `packages/mathison-storage/src/` | Conformance tests ensure equivalence |
| **Conformance Tests for Backends** | ✅ | `packages/mathison-storage/tests/conformance.test.ts` | Both backends pass identical suite |
| **Text Search** | ✅ | `GET /memory/search` API | Simple substring search |
| **Graph Traversal** | ⚠️ | Basic implementation | No shortest-path, BFS, or advanced algorithms |
| **Indexing for Performance** | ⚠️ | SQLite has indexes; FILE does not | FILE backend is O(n) for scans |

## CIF (Context Integrity Firewall)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Request Size Limits** | ✅ | `packages/mathison-governance/src/cif.ts` | Default: 1MB |
| **Response Size Limits** | ✅ | `packages/mathison-governance/src/cif.ts` | Default: 1MB |
| **Input Sanitization** | ⚠️ | Basic validation | No formal schema (e.g., Zod) |
| **CORS Enforcement** | ✅ | Fastify CORS plugin | Configured in server |
| **Leakage Detection** | ⚠️ | Placeholder implementation | No deep content inspection |

## CDI (Conscience Decision Interface)

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Strict Mode (Deny Uncertain Actions)** | ✅ | `packages/mathison-governance/src/cdi.ts` | Default: `strictMode: true` |
| **Consent Signal Validation** | ✅ | CDI checks `ConsentSignal` enum | EXPLICIT, IMPLIED, NONE, WITHDRAWN |
| **Locked Reason Codes** | ✅ | `GovernanceReasonCode` enum | 17 codes (TREATY_VIOLATION, CAPABILITY_EXCEEDED, etc.) |
| **Policy ID Tracking** | ✅ | Receipts include `policy_id` | Links decision to genome rule |
| **Context Enrichment** | ⚠️ | Basic context object | No deep contextual reasoning |

## Security Features

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Ed25519 Signature Verification** | ✅ | `packages/mathison-genome/` | Node.js crypto library |
| **Fail-Closed on Missing Env Vars** | ✅ | Server boot logic | Refuses to start without `MATHISON_STORE_BACKEND`, etc. |
| **No Secrets in Repo** | ✅ | `.gitignore` excludes `.env` | Dev genome keys are intentionally public (documented) |
| **SBOM Generation** | ⚠️ | Added in this PR | Not previously available |
| **Dependency Pinning** | ✅ | `pnpm-lock.yaml` | Frozen lockfile |
| **Rate Limiting** | ❌ | Not implemented | High DoS risk |
| **Secret Scanning** | ❌ | Not implemented | No pre-commit hooks |

## LLM Integration

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **GitHub Models Support** | ✅ | `packages/mathison-mesh/src/model-bus.ts` | Free tier: 15 req/min, 150/day |
| **Anthropic API Support** | ✅ | Fallback provider | Requires `ANTHROPIC_API_KEY` |
| **On-Device Inference (Mobile)** | ⚠️ | `packages/mathison-mobile/` | Spec exists; no native implementation yet |
| **Model Provider Abstraction** | ✅ | ModelBus interface | Swappable providers |

## Mesh & Distribution

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **MeshCoordinator** | ✅ | `packages/mathison-mesh/src/mesh-coordinator.ts` | Task distribution logic |
| **BeamEnvelope Messaging** | ✅ | `packages/mathison-mesh/src/beam-envelope.ts` | Privacy-preserving message format |
| **Proximity Mesh (Mobile)** | ⚠️ | `packages/mathison-mobile/src/mobile-mesh.ts` | Spec exists; no native modules |
| **End-to-End Encryption** | ❌ | Not implemented | Planned |
| **Mesh Discovery Protocols** | ❌ | Not implemented | Planned |

## Testing & Verification

| Claim | Implemented? | Where in Code? | Notes |
|-------|--------------|----------------|-------|
| **Governance Pipeline Tests** | ✅ | `packages/mathison-server/src/__tests__/server-conformance.test.ts` | Verifies CIF/CDI run on all routes |
| **Storage Conformance Tests** | ✅ | `packages/mathison-storage/tests/conformance.test.ts` | FILE/SQLite equivalence |
| **Genome Boot Tests** | ✅ | `packages/mathison-server/src/__tests__/genome-boot-conformance.test.ts` | Fail-closed behavior |
| **Memory Write Tests** | ✅ | `packages/mathison-server/src/__tests__/memory-write-conformance.test.ts` | ActionGate + receipts |
| **Capability Ceiling Tests** | ✅ | `packages/mathison-server/src/__tests__/genome-capability.test.ts` | Denials for exceeded caps |
| **E2E Integration Tests** | ⚠️ | Some coverage | No full E2E suite |
| **Fuzzing / Security Tests** | ❌ | Not implemented | No automated security testing |

## Known Gaps

1. **No Type-Level Enforcement:** Storage can be accessed directly (relies on convention, not TypeScript types)
2. **No Receipt Hash Chain:** Receipts are not cryptographically linked (tamper detection missing)
3. **No Rate Limiting:** DoS attacks not mitigated
4. **No Multi-Signature:** Genome threshold always 1 (single signer)
5. **No Key Rotation:** Requires new genome version
6. **No Formal Input Validation:** CIF does basic checks, but no schema validation (e.g., Zod)
7. **No Automated Security Testing:** No fuzzing, SAST, or penetration testing

## How to Verify

To verify these claims yourself:

```bash
# Run all tests
pnpm -r test

# Verify genome signature
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Run demo (exercises governance pipeline)
pnpm demo

# Check for missing env vars (should fail-closed)
MATHISON_STORE_BACKEND= pnpm --filter mathison-server start
```

## Updating This Document

When adding new governance features:

1. Add claim to relevant section
2. Mark as ❌ if not implemented
3. Implement the feature + tests
4. Update to ✅ and add code location
5. Link to test file that verifies the claim

**Last Updated:** 2025-12-31
