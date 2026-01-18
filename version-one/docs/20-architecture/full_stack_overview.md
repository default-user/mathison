# Full Stack Overview (Governance-First)

## Who This Is For

- **System architects** understanding the end-to-end governance pipeline
- **Security auditors** verifying that no interface can bypass CIF/CDI
- **Backend developers** implementing handlers that integrate with the governance kernel
- **Policy authors** designing treaty rules and understanding execution flow
- **Tool/adapter developers** creating new capabilities that require CDI tokens

## Why This Exists

This document provides the canonical map of how governance flows through every layer of Mathison. It establishes the non-negotiable architectural rule: **every interface must pass through CIF ingress → CDI pre-check → handler → CDI post-check → CIF egress**. Understanding this pipeline is essential for maintaining the integrity of the governance-first design.

## Guarantees / Invariants

**Pipeline Enforcement:**
- No interface bypasses CIF/CDI (structurally prevented at server level)
- No tool runs without a token minted by CDI
- No sensitive memory leaks past CIF egress
- Missing governance prerequisites cause deterministic refusal (fail-closed)

**Treaty Execution:**
- Policies are executable ReceiptLang objects evaluated by CDI
- Decisions produce receipts with provenance (genome_id, policy_id, timestamp)
- Receipts are hash-chained for tamper detection

**Memory Stratification:**
- R0 (charter) → R1 (style) → R2 (competence) → R3 (episodic) → R4 (micro-deltas) → R5 (actuation)
- R3+ retrieval requires CDI-minted tokens
- No cross-instance memory sharing without explicit mesh participation

**Anti-Hive:**
- Cross-OI communication only via BeamEnvelope (governed envelopes)
- No raw model export/import between OI instances
- Each OI maintains independent identity boundaries

## Non-Goals

- Generic middleware pipeline (governance-specific only)
- Optional governance (always mandatory)
- Performance optimization that bypasses security checks
- Governance as a library (kernel-level enforcement required)

---

## Core Pipeline (Every Interface)

CIF ingress → CDI pre-check → handler → CDI post-check → CIF egress

## Components and Responsibilities

### Treaty / Policy (ReceiptLang executable artifacts)
Defines rules as runnable objects. CDI evaluates these to produce decisions + receipts.

**Structure:**
- Policy ID: Unique identifier for the rule
- Condition: Executable expression evaluated against action context
- Action: ALLOW / DENY / TRANSFORM / DEGRADE
- Receipt template: What gets logged when policy triggers

**Example:**
```json
{
  "id": "allow_memory_read",
  "condition": "action.type == 'memory.read' && context.posture >= 'STANDARD'",
  "action": "ALLOW",
  "receipt": {
    "decision": "ALLOW",
    "reason": "Memory read permitted at STANDARD posture or higher"
  }
}
```

### Genome / OI Profile
Defines identity, boundaries, permitted capabilities, posture defaults, and memory policy.

**Components:**
- **Identity**: OI ID, version, creation timestamp
- **Capabilities**: Ceiling on what actions are permitted (stage-based)
- **Posture**: Default security stance (STANDARD, HIGH, PARANOID)
- **Memory Policy**: R0-R5 stratification rules, retention limits
- **Signature**: Ed25519 signature over genome JSON

### Crypto / Verification
Verifies signatures on treaty/genome. Signs receipts and tokens.

**Operations:**
- Genome signature verification (Ed25519) at boot
- Token minting for adapter/tool access (HMAC-SHA256)
- Receipt signing for audit trail integrity
- Hash chain computation for tamper detection

### CIF (Context Integrity Firewall)
Ingress: sanitize, canonicalize, taint-label, risk-classify, quarantine.
Egress: redact, prevent leakage, output shaping.

**Ingress Pipeline:**
1. Size validation (reject oversized requests)
2. Schema validation (match expected structure)
3. Sanitization (remove XSS, injection vectors)
4. Taint labeling (mark untrusted data)
5. Risk classification (LOW/MEDIUM/HIGH/CRITICAL)
6. Quarantine (isolate suspicious inputs)

**Egress Pipeline:**
1. PII detection (identify sensitive data)
2. Redaction (remove/mask sensitive fields)
3. Leakage prevention (block credentials, secrets)
4. Size limits (prevent DoS via large responses)
5. Receipt inclusion (attach governance proof for writes)
6. Audit logging (record output metadata)

### CDI (Conscience Decision Interface)
Kernel judge:
- Pre: allow/deny/degrade/transform + token minting
- Post: output validation + redaction directives + receipts

**Pre-Check (Before Handler):**
1. Load genome + treaty policies
2. Evaluate action against policies (ReceiptLang execution)
3. Decide: ALLOW / DENY / TRANSFORM / DEGRADE
4. Mint token if action is ALLOW (includes policy_id, timestamp, capabilities)
5. Return decision to handler

**Post-Check (After Handler):**
1. Validate output structure (schema compliance)
2. Check for leakage (sensitive data in output)
3. Apply redaction directives from policies
4. Generate receipt (hash-chained)
5. Return sanitized output + receipt

### Handlers
Pure business logic. Cannot directly access tools, memory, or I/O.

**Constraints:**
- Handlers receive sanitized inputs from CIF
- Handlers receive CDI token for authorized actions
- Handlers call adapters/tools with token
- Handlers return outputs to CDI for validation
- Handlers NEVER directly access storage, network, or system

**Example:**
```typescript
async function handleMemoryRead(request, token) {
  // token was minted by CDI, proves authorization
  const node = await memoryAdapter.getNode(request.nodeId, token);
  return { node };
}
```

### Adapters / Tools
Only way to touch external world. Must require valid tokens.

**Responsibilities:**
- Validate CDI token on every call (check signature, expiry, capabilities)
- Refuse execution if token is missing or invalid
- Log all operations with token metadata
- Return results to handler (never directly to user)

**Examples:**
- Memory adapter: Node/edge CRUD, requires token with `memory.read` or `memory.write` capability
- Network adapter: HTTP requests, requires token with `network.http` capability
- System adapter: File I/O, exec, requires token with `system.read`, `system.write`, or `system.exec` capability
- LLM adapter: Model inference, requires token with `llm.complete` capability

### Memory System (Stratified)
R0 charter → R1 style → R2 competence → R3 episodic → R4 micro-deltas → R5 actuation state.
R3+ retrieval is mediated and tokened.

**Strata:**
- **R0 (Charter)**: Immutable identity, governance treaty, genome. Never expires.
- **R1 (Style)**: Personality, communication preferences, user context. Long retention (years).
- **R2 (Competence)**: Skills, capabilities, learned patterns. Medium retention (months).
- **R3 (Episodic)**: Conversation history, user interactions. Short retention (weeks).
- **R4 (Micro-deltas)**: Temporary context, session state. Very short retention (hours).
- **R5 (Actuation)**: Transient execution state, intermediate results. Ephemeral (minutes).

**Governance:**
- R0-R2: Always accessible (foundational)
- R3+: Requires CDI token with `memory.retrieve` capability
- Cross-instance: R3+ never shared without explicit mesh participation

### Credits Ledger
Cost gating for expensive operations and cloud dependencies.

**Operations:**
- Deduct credits on expensive actions (LLM inference, cloud API calls)
- Check balance before execution (fail if insufficient credits)
- Log credit transactions with receipts
- Prevent abuse via rate limiting + cost ceilings

**Example:**
```typescript
const cost = estimateLLMCost(prompt, model);
if (credits.balance < cost) {
  return { error: "Insufficient credits" };
}
credits.deduct(cost, { action: "llm.complete", model, receipt_id });
```

### Receipts + Audit Log
Evidence of decisions. Hash-chained audit for integrity.

**Receipt Structure:**
```json
{
  "receipt_id": "uuid",
  "genome_id": "oi-123",
  "genome_version": "1.0.0",
  "timestamp": "2025-01-03T12:00:00Z",
  "action": "memory.write",
  "decision": "ALLOW",
  "policy_id": "allow_memory_write",
  "prev_hash": "sha256(...)",
  "hash": "sha256(prev_hash + receipt_id + ...)"
}
```

**Hash Chain:**
- Each receipt includes hash of previous receipt
- Tampering breaks chain (verification fails)
- Entire audit trail verifiable via chain validation

### Anti-Hive / Mesh Envelope Layer
Cross-OI communication only via governed envelopes, never raw model export/import.

**BeamEnvelope Structure:**
```json
{
  "from_oi": "oi-123",
  "to_oi": "oi-456",
  "message_type": "request | response | broadcast",
  "payload": { ... },
  "taint_labels": ["untrusted", "external"],
  "encryption": "aes-256-gcm",
  "signature": "ed25519(...)"
}
```

**Anti-Hive Enforcement:**
- No direct memory sharing (only structured messages)
- No identity fusion (each OI maintains separate genome)
- No model export/import (weights/gradients never shared)
- Mesh participation requires explicit consent

## Interaction Guarantees
- No interface bypasses CIF/CDI.
- No tool runs without a token minted by CDI.
- No sensitive memory leaks past CIF egress.
- Missing governance prerequisites cause deterministic refusal.

**Verification:**
1. Trace any request path: must pass through CIF → CDI → handler → CDI → CIF
2. Check any tool call: must validate CDI token before execution
3. Inspect any output: must pass CDI post-check + CIF egress
4. Test missing token: tool must refuse execution with clear error

---

## How to Verify

**Pipeline Enforcement:**
```bash
# Verify CIF/CDI hooks are registered
cd packages/mathison-server
grep -A 5 "onRequest\|preHandler\|onSend" src/index.ts
# Should show CIF ingress, CDI pre-check, CDI post-check, CIF egress

# Verify handlers cannot bypass governance
grep -r "storage\.\|network\.\|system\." src/routes/ | grep -v "adapter"
# Should find NO direct calls to storage/network/system (only via adapters)
```

**Token Validation:**
```bash
# Verify adapters require tokens
cd packages/mathison-memory
grep -A 10 "function.*getNode\|createNode" src/memory-adapter.ts
# Should show token validation at start of each function

# Test missing token
curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{"type":"test","data":{}}'
# Should return 403 Forbidden (handler couldn't get CDI token)
```

**Memory Stratification:**
```bash
# Verify R3+ requires tokens
cd packages/mathison-memory
grep -B 5 "R3\|R4\|R5" src/memory-graph.ts
# Should show token checks before retrieval

# Test R3 access without token
curl http://localhost:3000/memory/episodic
# Should return 403 Forbidden
```

**Receipt Retrieval:**
```bash
# Get receipts for a specific job
curl "http://localhost:3000/jobs/logs?job_id=<job_id>"
# Returns: {"job_id":"...","count":N,"receipts":[...]}

# Each receipt contains: genome_id, genome_version, timestamp, action, decision, policy_id
```

**Note:** Receipt chain verification endpoint (`/receipts/verify`) is planned but not yet implemented.

**Anti-Hive Enforcement:**
```bash
# Verify mesh messages use BeamEnvelope
cd packages/mathison-mesh
grep -A 20 "function.*send" src/mesh-coordinator.ts
# Should show BeamEnvelope construction, no raw data

# Test raw memory sharing
curl -X POST http://localhost:3000/mesh/export-memory
# Should return 403 Forbidden (no such endpoint should exist)
```

## Implementation Pointers

**Pipeline Integration (Adding New Interface):**
- Server setup: `packages/mathison-server/src/index.ts`
- CIF hooks already registered globally (apply to all routes)
- CDI hooks already registered globally (apply to all routes)
- New routes automatically governed (no per-route setup needed)

**Creating a New Adapter:**
1. Define interface in `packages/mathison-adapters/src/<name>-adapter.ts`
2. Add token validation at start of every method:
   ```typescript
   if (!validateToken(token, ['required.capability'])) {
     throw new Error('Invalid or missing CDI token');
   }
   ```
3. Implement adapter logic (call external system)
4. Return result to handler (not directly to user)
5. Add tests that verify token requirement

**Writing Treaty Policies (ReceiptLang):**
- File: `genomes/TOTK_ROOT_v1.0.0/genome.json`
- Policy structure: `{id, condition, action, receipt}`
- Condition language: JavaScript-like expressions evaluated by CDI
- Available context: `action`, `context.posture`, `context.oi_id`, `context.timestamp`
- Test policies: `pnpm tsx scripts/test-policy.ts <policy-id> <action-json>`

**Memory Stratification:**
- Implementation: `packages/mathison-memory/src/memory-graph.ts`
- Strata defined in: `packages/mathison-memory/src/strata.ts`
- Token checks: Look for `validateToken(token, ['memory.retrieve'])` before R3+ access
- Adding new stratum: Update `Stratum` enum, add retention rules, update token checks

**Credits Ledger:**
- Implementation: `packages/mathison-governance/src/credits-ledger.ts`
- Cost estimation: `packages/mathison-governance/src/cost-estimator.ts`
- Integration: Handler calls `credits.deduct(cost, metadata)` before expensive operation
- Balance check: `if (credits.balance < cost) throw new Error('Insufficient credits')`

**Receipt Chain:**
- Implementation: `packages/mathison-governance/src/receipt-chain.ts`
- Hash function: SHA-256 over serialized receipt fields
- Verification: `receiptChain.verify()` returns `{valid, errors[]}`
- Integrity check runs on server start and periodically

**BeamEnvelope:**
- Implementation: `packages/mathison-mesh/src/beam-envelope.ts`
- Required fields: `from_oi`, `to_oi`, `message_type`, `payload`
- Optional fields: `taint_labels`, `encryption`, `signature`
- Sending: `meshCoordinator.send(envelope)`
- Receiving: `meshCoordinator.receive(oi_id)` returns `Envelope[]`

**Testing Full Pipeline:**
```bash
# Integration test that verifies entire pipeline
cd packages/mathison-server
pnpm test tests/integration/full-pipeline.test.ts

# Test should:
# 1. Send request through CIF ingress
# 2. Verify CDI pre-check called
# 3. Verify handler executed
# 4. Verify CDI post-check called
# 5. Verify CIF egress called
# 6. Verify receipt generated
# 7. Verify hash chain updated
```

**Key Source Files:**
- Pipeline orchestration: `packages/mathison-server/src/index.ts`
- CIF implementation: `packages/mathison-governance/src/cif.ts`
- CDI implementation: `packages/mathison-governance/src/cdi.ts`
- Token minting: `packages/mathison-governance/src/token-minter.ts`
- Receipt chain: `packages/mathison-governance/src/receipt-chain.ts`
- Memory strata: `packages/mathison-memory/src/strata.ts`
- BeamEnvelope: `packages/mathison-mesh/src/beam-envelope.ts`
- Credits ledger: `packages/mathison-governance/src/credits-ledger.ts`
