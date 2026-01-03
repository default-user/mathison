# Governance Types (Canonical Contracts)

## Who This Is For

- **Backend developers** implementing governance data structures
- **Type system maintainers** ensuring contract consistency across languages
- **Integration engineers** building adapters and tools
- **Security reviewers** auditing governance data flow
- **Protocol designers** extending governance mechanisms

## Why This Exists

These types define the canonical contracts for governance data flow. They ensure that governance isn't "vibes-based" by providing precise, implementation-agnostic definitions of what flows through the system. Any implementation language can map to these semantics. Without these contracts, governance becomes implicit and untestable.

## Guarantees / Invariants

1. **Language-agnostic semantics** — Types define behavior, not syntax
2. **Minimal surface area** — Only essential fields included
3. **Explicit taint tracking** — All data labeled with trust/risk
4. **Capability tokens are signed** — Cannot be forged
5. **Receipts are tamper-evident** — All decisions recorded
6. **Intent canonicalization** — Every request becomes an Intent
7. **Decision atomicity** — One decision per intent

## Non-Goals

- **Implementation prescriptiveness** — Field names/types can vary by language
- **Wire format** — These are logical contracts, not serialization specs
- **UI concerns** — These are backend kernel types
- **Optimization** — Correctness over performance
- **Backward compatibility promises** — Pre-1.0, may change

---

These are the minimum contracts required to prevent governance from becoming "vibes".
Implementation language may differ; semantics MUST match.

---

## Envelope

Represents any inbound or outbound message at the boundary.

Fields:
- envelope_id: unique identifier
- source: http | grpc | ui | job | mesh | adapter
- received_at: monotonic timestamp or sequence
- raw: original payload (kept internal only)
- sanitized: CIF-sanitized payload or reference
- taint: labels (e.g. untrusted, user-supplied, mesh, tool-output)
- risk: risk class / action scope hints
- actor: authenticated identity context if known

---

## Intent

Canonical internal representation of what is being requested.

Fields:
- intent_id
- actor
- scope (route/interface/capability scope)
- operation (verb)
- params_ref (reference to sanitized params)
- taint
- risk
- needed_resolution: R0–R5
- requested_tools: list (optional)
- requested_memory: list (optional)

---

## Decision

Output of CDI evaluation.

Fields:
- decision_id
- outcome: ALLOW | DENY | REFUSE | DEGRADE | TRANSFORM
- transformed_intent_ref (optional)
- constraints:
  - allowed_tools + param constraints
  - allowed_memory_layers
  - output_constraints
- capability_tokens: list (optional)
- receipts:
  - minimal_receipt_ref
  - full_receipt_ref (optional internal)

---

## CapabilityToken

A signed, scoped permission to perform a specific action.

Fields:
- token_id
- actor
- scope
- tool_name (or memory operation)
- param_constraints
- posture_constraints
- credits_ceiling (optional)
- expiry
- signature

Rule:
- Adapters MUST verify signature and constraints before execution.

---

## Receipt

A tamper-evident record of what CDI decided and why.

Minimal receipt fields:
- receipt_id
- intent_id
- outcome
- policy_version (treaty hash / id)
- constraints summary
- timestamp/sequence
- signature (optional but recommended)

Full receipt fields (internal):
- evaluation trace (policy inputs/outputs)
- references to evidence used
- deny reasons or downgrade reasons
- tool calls permitted/denied
- redaction directives

---

## How to Verify

### Type Conformance Check
```bash
# Verify TypeScript implementations match spec
pnpm --filter mathison-governance test types-conformance.test.ts

# Check interface completeness
pnpm tsx scripts/check-governance-types.ts
```

### Manual Verification
1. **Envelope completeness**: Every request creates an Envelope with all required fields
2. **Intent canonicalization**: Confirm all requests become Intent objects
3. **Decision atomicity**: One Decision per Intent (no implicit decisions)
4. **CapabilityToken verification**: Adapters reject unsigned/expired tokens
5. **Receipt generation**: All decisions produce at least a minimal receipt

### Semantic Audit
- [ ] Envelope.taint labels present on all external inputs
- [ ] Intent.params_ref points to sanitized data, not raw
- [ ] Decision.outcome is one of: ALLOW | DENY | REFUSE | DEGRADE | TRANSFORM
- [ ] CapabilityToken.signature verified before adapter execution
- [ ] Receipt.policy_version matches loaded treaty version

### Cross-Language Check
If implementing in non-TypeScript language:
1. Map each field to native type
2. Verify semantics match (e.g., `taint` is a set of labels, not a boolean)
3. Write conformance tests against these contracts
4. Document any semantic differences (should be zero)

## Implementation Pointers

### TypeScript Implementations
- **Envelope**: `/home/user/mathison/packages/mathison-governance/src/types/envelope.ts`
- **Intent**: `/home/user/mathison/packages/mathison-governance/src/types/intent.ts`
- **Decision**: `/home/user/mathison/packages/mathison-governance/src/types/decision.ts`
- **CapabilityToken**: `/home/user/mathison/packages/mathison-governance/src/types/capability-token.ts`
- **Receipt**: `/home/user/mathison/packages/mathison-governance/src/types/receipt.ts`

### Example Usage

#### Envelope Creation (CIF Ingress)
```typescript
const envelope: Envelope = {
  envelope_id: uuidv4(),
  source: 'http',
  received_at: Date.now(),
  raw: request.body,  // Keep internal
  sanitized: sanitize(request.body),
  taint: ['untrusted', 'user-supplied'],
  risk: classifyRisk(request),
  actor: extractActor(request.headers)
};
```

#### Intent Canonicalization
```typescript
const intent: Intent = {
  intent_id: uuidv4(),
  actor: envelope.actor,
  scope: 'memory.write',
  operation: 'create_node',
  params_ref: envelope.sanitized,
  taint: envelope.taint,
  risk: envelope.risk,
  needed_resolution: 'R3',  // Episodic memory layer
  requested_tools: [],
  requested_memory: ['R3']
};
```

#### Decision Evaluation (CDI)
```typescript
const decision: Decision = {
  decision_id: uuidv4(),
  outcome: 'ALLOW',
  transformed_intent_ref: null,
  constraints: {
    allowed_tools: [],
    allowed_memory_layers: ['R3'],
    output_constraints: { max_size: 1024 }
  },
  capability_tokens: [createMemoryToken(intent)],
  receipts: {
    minimal_receipt_ref: createMinimalReceipt(intent, 'ALLOW'),
    full_receipt_ref: createFullReceipt(intent, 'ALLOW', trace)
  }
};
```

#### CapabilityToken Minting
```typescript
const token: CapabilityToken = {
  token_id: uuidv4(),
  actor: intent.actor,
  scope: intent.scope,
  tool_name: 'memory.write',
  param_constraints: {
    max_node_size: 1024,
    allowed_layers: ['R3']
  },
  posture_constraints: {
    strict_mode: true
  },
  credits_ceiling: null,  // No cost limit
  expiry: Date.now() + 60000,  // 1 minute
  signature: sign(canonical(token_without_sig), genome_key)
};
```

#### Receipt Generation
```typescript
// Minimal receipt (returned to client)
const minimalReceipt: Receipt = {
  receipt_id: uuidv4(),
  intent_id: intent.intent_id,
  outcome: decision.outcome,
  policy_version: genome.genome_id,
  constraints: decision.constraints,
  timestamp: Date.now(),
  signature: sign(canonical(receipt), genome_key)
};

// Full receipt (internal audit)
const fullReceipt: Receipt = {
  ...minimalReceipt,
  evaluation_trace: {
    rules_evaluated: ['treaty.rule.7', 'genome.capability.memory'],
    policy_inputs: { taint: intent.taint, risk: intent.risk },
    policy_outputs: { verdict: 'ALLOW', reason: 'Compliant' }
  },
  deny_reasons: [],
  tool_calls_permitted: [],
  tool_calls_denied: [],
  redaction_directives: []
};
```

### Type Guards
```typescript
// Validate Envelope
function isValidEnvelope(e: unknown): e is Envelope {
  return (
    typeof e === 'object' &&
    'envelope_id' in e &&
    'source' in e &&
    'sanitized' in e &&
    Array.isArray(e.taint)
  );
}

// Validate Decision outcome
function isValidOutcome(o: string): o is DecisionOutcome {
  return ['ALLOW', 'DENY', 'REFUSE', 'DEGRADE', 'TRANSFORM'].includes(o);
}

// Verify CapabilityToken
function verifyToken(token: CapabilityToken, publicKey: string): boolean {
  const canonical = canonicalizeToken(token);
  return crypto.verify(publicKey, canonical, token.signature);
}
```

### Test Coverage
- **Type conformance**: `packages/mathison-governance/tests/types-conformance.test.ts`
- **Envelope sanitization**: `packages/mathison-governance/tests/envelope.test.ts`
- **Intent canonicalization**: `packages/mathison-governance/tests/intent.test.ts`
- **Decision validation**: `packages/mathison-governance/tests/decision.test.ts`
- **Token verification**: `packages/mathison-governance/tests/capability-token.test.ts`
- **Receipt generation**: `packages/mathison-governance/tests/receipt.test.ts`

### Extension Guide

#### Adding New Taint Labels
```typescript
// Add to taint enum/type
type TaintLabel =
  | 'untrusted'
  | 'user-supplied'
  | 'mesh'
  | 'tool-output'
  | 'my-new-taint';  // Add here

// Update CIF ingress logic
function classifyTaint(envelope: Envelope): TaintLabel[] {
  const labels: TaintLabel[] = [];
  if (envelope.source === 'mesh') labels.push('mesh');
  if (isUserSupplied(envelope)) labels.push('user-supplied');
  // Add new classification logic
  return labels;
}
```

#### Adding New Decision Outcomes
```typescript
// Extend outcome enum
type DecisionOutcome =
  | 'ALLOW'
  | 'DENY'
  | 'REFUSE'
  | 'DEGRADE'
  | 'TRANSFORM'
  | 'QUARANTINE';  // New outcome

// Update CDI evaluation
function evaluateIntent(intent: Intent): Decision {
  // Add new outcome logic
  if (needsQuarantine(intent)) {
    return { outcome: 'QUARANTINE', ... };
  }
}
```

#### Adding New Resolution Layers
```typescript
// Extend resolution enum
type ResolutionLayer = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';

// Update memory layer mapping
const RESOLUTION_TO_LAYER = {
  'R0': 'charter',
  'R1': 'style',
  'R2': 'competence',
  'R3': 'episodic',
  'R4': 'micro-behavior',
  'R5': 'actuation',
  'R6': 'custom-layer'  // New layer
};
```
