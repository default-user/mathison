# Governance Dataflow Spec (Canonical)

## Who This Is For

- **System architects** designing governance-enforced systems
- **Backend developers** implementing the governance pipeline
- **Security engineers** auditing enforcement paths
- **Integration engineers** connecting new interfaces to governance
- **Compliance officers** verifying fail-closed behavior

## Why This Exists

This document defines the single source of truth for how governance is enforced. It ensures that all interfaces (HTTP, gRPC, UI, jobs, mesh) traverse the same enforcement chain. Without this canonical flow, bypass paths emerge, governance becomes inconsistent, and security guarantees fail. This spec makes enforcement structural and auditable.

## Guarantees / Invariants

1. **No bypass paths** — All interfaces must traverse CIF → CDI → handler → CDI → CIF
2. **Fail-closed boot** — Missing prerequisites prevent system startup
3. **Capability-gated adapters** — All tools/memory require valid tokens
4. **Stratified memory access** — R0-R5 layers with permission checks
5. **Anti-hive enforcement** — Cross-OI messages treated as untrusted
6. **Receipt generation** — All decisions produce audit records
7. **Hash-chained audit** — Immutable, append-only decision log
8. **Deterministic denials** — Same invalid request always produces same denial

## Non-Goals

- **Performance optimization** — Correctness over speed
- **Degraded operation modes** — Fail-closed only (no partial bypass)
- **Interface-specific rules** — Same governance for all interfaces
- **External anchoring** — No blockchain/external timestamping required
- **Backward compatibility** — Pre-1.0, flow may change

---

This document is the single source of truth for how governance is enforced.
All interfaces MUST traverse the same chain:

CIF (ingress) → CDI (pre) → handler/runtime → CDI (post) → CIF (egress)

If any governance prerequisite is missing or invalid, the system MUST fail-closed
with deterministic DENY/REFUSE.

---

## 1. Boot Sequence (Fail-Closed)

On startup the system MUST:

1) Load config
2) Load and verify treaty/policy artifacts (schema + signature)
3) Load and verify genome / OI profile (schema + signature)
4) Initialize crypto / keystore access
5) Initialize receipt store + hash-chained audit log
6) Initialize adapters in LOCKED state (no capabilities)
7) Start interfaces (HTTP/gRPC/UI/jobs/mesh)

If any required step fails → REFUSE (deterministic).
Optional degraded modes (if implemented) MUST be explicit and narrow (e.g. read-only diagnostics).

---

## 2. Request Lifecycle (All Interfaces)

Every inbound event becomes an Envelope and traverses:

1) **CIF Ingress**
   - parse, sanitize, canonicalize
   - taint-label and risk-classify
   - quarantine/strip unsafe payloads

2) **Intent Canonicalization**
   Convert to:
   `Intent { actor, scope, operation, payload_ref, taint, risk, needed_resolution }`

3) **CDI Pre-Check (Kernel Judge)**
   - verify prerequisites still valid (treaty/genome/config/crypto)
   - evaluate treaty as runnable policy object
   - decision outcomes:
     - ALLOW
     - DENY / REFUSE
     - DEGRADE (answer-only / no actuation / no memory)
     - TRANSFORM (rewrite intent safely)
   - if allowing any external action or retrieval:
     - mint CapabilityToken(s) binding: actor + scope + tool + constraints + expiry
   - emit receipt (minimal always; full optional internal)

4) **Handler Execution**
   - handler performs pure business logic
   - any tool/memory call must present a valid CapabilityToken

5) **CDI Post-Check**
   - validate output against treaty/risk class
   - enforce output constraints (format, content, redaction requirements)
   - emit receipt (minimal always; full optional internal)

6) **CIF Egress**
   - redact secrets/sensitive memory
   - prevent policy leakage/export
   - shape response for channel

7) Return response

---

## 3. Capability Token Rule (No Bypass)

Adapters MUST deny any call without a valid token.

Tokens MUST bind:
- actor identity
- scope / route / interface
- tool name + parameter constraints
- posture constraints
- credits ceiling (if costed)
- expiry

No token → deterministic deny.
Invalid token → deterministic deny.

---

## 4. Memory Rule (Stratified + Permissioned)

Memory is layered:

- R0: Charter/invariants (tiny, protected)
- R1: Style preferences
- R2: Competence modules/workflows
- R3: Episodic memory (indexed retrieval)
- R4: Micro-behavior deltas (optional; bounded)
- R5: Actuation policy state

Access policy:
- R0–R2 may be local and small.
- R3+ retrieval MUST be mediated by CDI and require a token.
- All surfaced memory is subject to CIF egress constraints.

Memory retrieval is treated as a tool call.

---

## 5. Cost Rule (Credits)

High-cost actions (cloud inference, large retrieval, backups) are costed.
CDI MUST consult credits policy before allowing the action:
- allow
- downgrade
- refuse

This prevents runaway cost and silent cloud dependence.

---

## 6. Anti-Hive Rule (Mesh / Multi-OI)

Cross-OI messages MUST be treated as untrusted input:
Mesh inbound → CIF ingress → CDI → handler → CDI → CIF egress

No raw self-model export/import.
Cross-OI interaction occurs only via governed envelopes and explicit intents.

---

## 7. Evidence Rule (Receipts + Audit)

CDI emits receipts for decisions:
- minimal receipt: compact, logistics-friendly
- full receipt: internal audit/debugging/dispute resolution

Audit log is hash-chained.
Receipt signing/anchoring MAY be added, but governance correctness MUST NOT depend on external anchoring availability.

---

## 8. Global Invariants

- CIF is always first and last.
- CDI is the kernel judge; handlers have no authority.
- All adapters are capability-gated.
- Fail-closed on missing governance prerequisites.
- Memory and tool access are mediated actions, not implicit privileges.

---

## How to Verify

### Pipeline Flow Test
```bash
# Run server conformance tests (verifies all hooks run)
pnpm --filter mathison-server test server-conformance.test.ts

# Trace request through pipeline
MATHISON_DEBUG=true pnpm --filter mathison-server start
curl -X POST http://localhost:3000/api/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{"content": "test"}'
# Check logs for: CIF ingress → CDI pre → handler → CDI post → CIF egress
```

### Bypass Attempt Test
```bash
# Attempt direct storage access (should fail)
pnpm tsx scripts/test-direct-storage-access.ts
# Expected: Error or denial (no bypass)

# Attempt to skip CIF (should fail)
pnpm tsx scripts/test-skip-cif.ts
# Expected: Structural impossibility (hooks always run)
```

### Fail-Closed Boot Test
```bash
# Missing genome (should refuse to boot)
rm genomes/TOTK_ROOT_v1.0.0/genome.json
pnpm --filter mathison-server start
# Expected: Boot failure with error message

# Invalid treaty signature (should refuse to boot)
echo "tampered" >> docs/31-governance/tiriti.md
pnpm --filter mathison-server start
# Expected: Boot failure
```

### Capability Token Test
```bash
# Attempt adapter call without token
pnpm tsx scripts/test-adapter-no-token.ts
# Expected: Denial

# Attempt with expired token
pnpm tsx scripts/test-expired-token.ts
# Expected: Denial
```

### Memory Stratification Test
```bash
# Attempt R3 access without CDI permission
pnpm tsx scripts/test-r3-bypass.ts
# Expected: Denial

# Verify R0-R2 accessible without token (if designed that way)
pnpm tsx scripts/test-r0-r2-access.ts
```

### Anti-Hive Test
```bash
# Send mesh message with raw state export
pnpm tsx scripts/test-mesh-state-export.ts
# Expected: CIF ingress blocks or CDI denies
```

### Audit Trail Test
```bash
# Verify receipts generated for all decisions
cat logs/cdi-audit.log | jq '.receipt_id' | sort | uniq | wc -l
# Expected: Count matches decision count

# Verify hash chain integrity
pnpm tsx scripts/verify-audit-chain.ts
# Expected: All hashes valid
```

## Implementation Pointers

### Boot Sequence Implementation
- **Server boot**: `/home/user/mathison/packages/mathison-server/src/server.ts`
  - Config loading
  - Treaty verification
  - Genome verification
  - Adapter initialization

```typescript
// Boot sequence
async function boot() {
  // 1. Load config
  const config = await loadConfig();

  // 2. Verify treaty
  const treaty = await loadTreaty(config.treatyPath);
  verifyTreatySignature(treaty);

  // 3. Verify genome
  const genome = await loadGenome(config.genomePath);
  verifyGenomeSignature(genome);

  // 4. Initialize crypto
  await initializeCrypto(genome.authority);

  // 5. Initialize audit log
  await initializeAuditLog(config.auditLogPath);

  // 6. Initialize adapters (LOCKED)
  const adapters = await initializeAdapters({ locked: true });

  // 7. Start interfaces
  await startServer(config);
}
```

### Pipeline Hook Registration
```typescript
// packages/mathison-server/src/server.ts

// 1. CIF Ingress (first)
fastify.addHook('onRequest', async (request, reply) => {
  const envelope = await cif.ingress({
    clientId: request.ip,
    endpoint: request.url,
    payload: request.body,
    headers: request.headers,
    timestamp: Date.now()
  });

  if (!envelope.allowed) {
    throw new Error('CIF ingress denied');
  }

  request.envelope = envelope;
});

// 2. CDI Pre-Check
fastify.addHook('preHandler', async (request, reply) => {
  const intent = canonicalizeIntent(request.envelope);
  const decision = await cdi.checkAction(intent);

  if (decision.outcome === 'DENY' || decision.outcome === 'REFUSE') {
    throw new Error(`CDI denied: ${decision.reason}`);
  }

  request.decision = decision;
  request.tokens = decision.capability_tokens;
});

// 3. Handler runs (business logic)

// 4. CDI Post-Check
fastify.addHook('onSend', async (request, reply, payload) => {
  const outputDecision = await cdi.checkOutput({
    content: payload,
    metadata: request.decision.constraints.output_constraints
  });

  if (!outputDecision.allowed) {
    throw new Error('CDI output check failed');
  }

  return outputDecision.sanitizedContent || payload;
});

// 5. CIF Egress (last)
fastify.addHook('onSend', async (request, reply, payload) => {
  const egressResult = await cif.egress({
    clientId: request.ip,
    endpoint: request.url,
    payload: JSON.parse(payload)
  });

  if (!egressResult.allowed) {
    throw new Error('CIF egress denied');
  }

  return JSON.stringify(egressResult.sanitizedPayload);
});
```

### Capability Token Enforcement
```typescript
// packages/mathison-governance/src/adapters/memory-adapter.ts

async function writeMemory(token: CapabilityToken, data: unknown) {
  // 1. Verify token signature
  if (!verifyTokenSignature(token)) {
    throw new Error('Invalid token signature');
  }

  // 2. Check expiry
  if (token.expiry < Date.now()) {
    throw new Error('Token expired');
  }

  // 3. Verify scope
  if (token.scope !== 'memory.write') {
    throw new Error('Token scope mismatch');
  }

  // 4. Check parameter constraints
  if (!meetsConstraints(data, token.param_constraints)) {
    throw new Error('Parameter constraints violated');
  }

  // 5. Perform action
  return await storage.write(data);
}
```

### Memory Stratification
```typescript
// packages/mathison-memory/src/memory-layers.ts

const LAYER_ACCESS_RULES = {
  R0: { requiresToken: false, readOnly: true },   // Charter (always accessible)
  R1: { requiresToken: false, readOnly: false },  // Style (local)
  R2: { requiresToken: false, readOnly: false },  // Competence (local)
  R3: { requiresToken: true, readOnly: false },   // Episodic (CDI-mediated)
  R4: { requiresToken: true, readOnly: false },   // Micro-behavior (CDI-mediated)
  R5: { requiresToken: true, readOnly: false }    // Actuation (CDI-mediated)
};

async function accessLayer(layer: string, token?: CapabilityToken) {
  const rules = LAYER_ACCESS_RULES[layer];

  if (rules.requiresToken && !token) {
    throw new Error(`Layer ${layer} requires capability token`);
  }

  if (token && !verifyToken(token)) {
    throw new Error('Invalid capability token');
  }

  return await retrieveLayer(layer);
}
```

### Anti-Hive Enforcement
```typescript
// packages/mathison-mesh/src/mesh-handler.ts

async function handleMeshMessage(envelope: Envelope) {
  // 1. Treat as untrusted (CIF ingress already ran)
  if (!envelope.taint.includes('mesh')) {
    envelope.taint.push('mesh');
  }

  // 2. Canonicalize to intent
  const intent = canonicalizeIntent(envelope);

  // 3. CDI evaluation
  const decision = await cdi.checkAction(intent);

  // 4. Block raw state export
  if (intent.operation === 'export_state' || intent.operation === 'share_identity') {
    return { outcome: 'DENY', reason: 'Anti-hive rule violation' };
  }

  // 5. Allow only message-passing
  if (intent.operation === 'send_message') {
    return await handleMessage(intent, decision.capability_tokens);
  }

  return { outcome: 'DENY', reason: 'Unsupported mesh operation' };
}
```

### Audit Log Hash Chain
```typescript
// packages/mathison-governance/src/audit-log.ts

interface AuditEntry {
  receipt_id: string;
  intent_id: string;
  outcome: string;
  timestamp: number;
  prev_hash: string;
  entry_hash: string;
}

async function appendAuditEntry(receipt: Receipt): Promise<void> {
  const lastEntry = await getLastAuditEntry();

  const entry: AuditEntry = {
    receipt_id: receipt.receipt_id,
    intent_id: receipt.intent_id,
    outcome: receipt.outcome,
    timestamp: receipt.timestamp,
    prev_hash: lastEntry?.entry_hash || '0'.repeat(64),
    entry_hash: ''  // Computed below
  };

  entry.entry_hash = computeHash(entry);

  await auditLog.append(entry);
}

function verifyAuditChain(): boolean {
  const entries = await auditLog.getAll();

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].prev_hash !== entries[i-1].entry_hash) {
      return false;
    }
  }

  return true;
}
```

### Test Coverage
- **Boot sequence**: `packages/mathison-server/src/__tests__/genome-boot-conformance.test.ts`
- **Pipeline flow**: `packages/mathison-server/src/__tests__/server-conformance.test.ts`
- **Capability tokens**: `packages/mathison-governance/tests/capability-token.test.ts`
- **Memory stratification**: `packages/mathison-memory/tests/memory-layers.test.ts`
- **Anti-hive**: `packages/mathison-mesh/tests/anti-hive.test.ts`
- **Audit chain**: `packages/mathison-governance/tests/audit-log.test.ts`

### Extension Guide

#### Adding New Interface
```typescript
// 1. Create interface handler
// packages/mathison-server/src/interfaces/my-interface.ts

async function handleMyInterfaceRequest(rawRequest: unknown) {
  // 2. Create Envelope (CIF ingress)
  const envelope = await cif.ingress({
    source: 'my-interface',
    payload: rawRequest,
    ...
  });

  // 3. Canonicalize to Intent
  const intent = canonicalizeIntent(envelope);

  // 4. CDI pre-check
  const decision = await cdi.checkAction(intent);

  // 5. Execute handler
  const result = await myHandler(intent, decision.capability_tokens);

  // 6. CDI post-check
  const outputCheck = await cdi.checkOutput(result);

  // 7. CIF egress
  const egressResult = await cif.egress(outputCheck.sanitizedContent);

  return egressResult;
}
```

#### Adding New Memory Layer
```typescript
// Update LAYER_ACCESS_RULES
const LAYER_ACCESS_RULES = {
  ...existingLayers,
  R6: { requiresToken: true, readOnly: false }  // New layer
};

// Update CDI to recognize R6
// Update memory adapter to handle R6 access
```
