# ONE_PATH_LAW Specification v1.0

## Overview

The ONE_PATH_LAW is the foundational invariant of the Mathison governance system. It states:

> **All requests MUST flow through the single governed pipeline: CIF_INGRESS → CDI_DECIDE → HANDLER → CDI_DECIDE → CIF_EGRESS. There are no exceptions, no bypasses, and no alternative paths.**

This document codifies the law, its enforcement mechanisms, and conformance requirements.

## Source: MATHISON_ORACLE_OI_MONOLITH v1.1.0

From the crystal specification:

```yaml
GOVERNANCE:
  gate_pipeline:
    - "CIF_INGRESS (label + sanitize + classify + consent-check)"
    - "CDI_DECIDE (ALLOW/DENY/DEGRADE + receipt)"
    - "HANDLER (single execution chokepoint; capability minting)"
    - "CDI_DECIDE (output check + DECLASSIFY check)"
    - "CIF_EGRESS (redact/shape per leak budgets)"
  fail_closed: true
  unknown_behavior: "DENY or ASK_CLARIFY (never assume safe)"

ORACLE_KNOWLEDGE_BASE:
  SYSTEM_MODEL:
    one_path_law: "CIF ingress -> CDI decide -> handler -> CDI decide -> CIF egress"
  INVARIANTS:
    I1: "PATH: every tool/model call requires CDI_ALLOW + capability; adapters refuse without valid cap."
    I2: "CLOSED: missing/invalid governance/manifests/registries/posture => deny; no caps; no side effects."
```

## The Five Stages

### Stage 1: CIF_INGRESS

**Purpose**: Label, sanitize, classify, and consent-check incoming requests.

**Responsibilities**:
- Validate request schema against intent-specific Zod schemas
- Check payload size limits (default: 10MB)
- Check string length limits (default: 10,000 chars)
- Check array length limits (default: 1,000 items)
- Apply taint detection (XSS, SQL injection, secrets)
- Classify request origin and apply labels
- Verify consent if required by operation type

**Failure Mode**: DENY with `CIF_INGRESS_FAILED` error code.

**Output**: Sanitized payload + taint labels + classification.

### Stage 2: CDI_DECIDE (Action Check)

**Purpose**: Make ALLOW/DENY/DEGRADE decision with receipt.

**Responsibilities**:
- Check governance capsule status (valid, stale, missing)
- Apply degradation ladder based on capsule status and risk class
- Verify principal permissions against authority config
- Verify capabilities against capsule genome
- Check cross-namespace operation rules (default: DENY)
- Mint capability tokens for allowed operations
- Generate decision receipt for audit log

**Failure Mode**: DENY with `CDI_ACTION_DENIED` error code + reason.

**Output**: DecisionMeta with capability tokens OR denial reason.

**Degradation Ladder**:
| Capsule State | read_only | low_risk | medium_risk | high_risk |
|---------------|-----------|----------|-------------|-----------|
| Valid         | ALLOW     | ALLOW    | ALLOW       | ALLOW     |
| Stale         | ALLOW     | ALLOW    | DENY        | DENY      |
| Missing       | ALLOW     | DENY     | DENY        | DENY      |

### Stage 3: HANDLER

**Purpose**: Single execution chokepoint with capability enforcement.

**Responsibilities**:
- Verify handler exists for intent (no dynamic dispatch)
- Pass capability tokens to handler
- Execute handler with timeout enforcement
- Capture handler response or error
- All side effects (model calls, tool calls, memory writes) require valid capability tokens

**Failure Mode**: `HANDLER_ERROR` with error details.

**Critical Invariant**: Handlers CANNOT execute without:
1. Passing through CIF_INGRESS
2. Receiving CDI_ALLOW with capability tokens
3. Being registered in the HandlerRegistry

### Stage 4: CDI_DECIDE (Output Check)

**Purpose**: Validate output and apply DECLASSIFY rules.

**Responsibilities**:
- Verify capability tokens have not expired
- Check for cross-namespace data leakage
- Apply redaction rules (PII, secrets, sensitive data)
- Apply leak budget constraints
- Generate output validation receipt

**Failure Mode**: DENY with `CDI_OUTPUT_DENIED` error code.

**Output**: Redacted response + applied rules + validation receipt.

### Stage 5: CIF_EGRESS

**Purpose**: Final shaping per leak budgets before response.

**Responsibilities**:
- Validate response schema
- Check response size limits
- Ensure all taint labels are resolved or documented
- Package response with audit metadata
- Generate egress receipt

**Failure Mode**: DENY with `CIF_EGRESS_FAILED` error code.

**Output**: Final response ready for client.

## Enforcement Mechanisms

### 1. Type System Enforcement

```typescript
// The only way to get a PipelineResponse is through PipelineExecutor.execute()
// There is no public constructor for PipelineResponse with success=true

interface SealedPipelineResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: PipelineError;
  readonly decision_meta: DecisionMeta;
  readonly trace_id: string;
  readonly _seal: unique symbol; // Cannot be constructed externally
}
```

### 2. No Direct Handler Access

```typescript
// Handlers are ONLY accessible through the HandlerRegistry
// The registry is ONLY accessible to the PipelineExecutor
// There is no way to invoke a handler without going through the pipeline

class HandlerRegistry {
  private handlers: Map<string, RegisteredHandler>; // Private map

  // No public method to get the handler function directly
  // Only the PipelineExecutor can call handlers through execute()
}
```

### 3. Capability Token Gating

```typescript
// All side-effect operations require valid capability tokens
// Tokens can ONLY be minted by CDI_DECIDE
// Tokens expire after 5 minutes (default)
// STOP revokes all outstanding tokens immediately

interface CapabilityToken {
  token_id: string;
  capability: string;
  oi_id: string;
  principal_id: string;
  expires_at: Date;
  constraints: Record<string, unknown>;
  _issuer: 'CDI'; // Can only be issued by CDI
}
```

### 4. Adapter Enforcement

```typescript
// All model/tool adapters MUST verify capability tokens before execution
// Adapters MUST be registered in the signed AdapterRegistry
// Unregistered adapters are rejected at compile time (TypeScript)

interface AdapterContract {
  invoke(request: AdapterRequest): Promise<AdapterResponse>;

  // This method is called by the gateway before every invocation
  verifyCapability(token: CapabilityToken): boolean;
}
```

### 5. Receipt Chain

Every stage produces a receipt that is appended to the tamper-evident log:

```typescript
interface StageReceipt {
  receipt_id: string;
  stage: PipelineStage;
  trace_id: string;
  timestamp: Date;
  result: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
  previous_receipt_hash: string; // Hash chain
}
```

## Conformance Tests

### Test Suite: `one_path_law_conformance`

1. **no_bypass_handler_direct** - Verify handlers cannot be called directly
2. **no_bypass_adapter_direct** - Verify adapters require capability tokens
3. **no_bypass_memory_direct** - Verify memory store requires governance tags
4. **cif_ingress_required** - Verify requests fail without CIF validation
5. **cdi_action_required** - Verify handlers fail without CDI approval
6. **cdi_output_required** - Verify responses fail without output check
7. **cif_egress_required** - Verify responses fail without egress validation
8. **capability_token_required** - Verify side effects fail without tokens
9. **capability_token_expiry** - Verify expired tokens are rejected
10. **stop_revokes_tokens** - Verify STOP invalidates all tokens
11. **degradation_ladder_enforced** - Verify risk class vs capsule state
12. **cross_namespace_default_deny** - Verify cross-namespace ops denied by default
13. **receipt_chain_integrity** - Verify tamper-evident receipt chain
14. **unknown_intent_denied** - Verify unregistered intents are denied

## Build Priority

The ONE_PATH_LAW is **BUILD PRIORITY 0**. All other Mathison features depend on this invariant holding. The implementation order is:

1. Core types (`one-path-law.ts`)
2. Stage implementations (CIF, CDI, Handler)
3. Pipeline executor with enforcement
4. Conformance test suite
5. CI enforcement (tests must pass)

No other feature work proceeds until ONE_PATH_LAW conformance tests pass.

## Formal Verification Goals

Future work includes formal verification using:

1. **Property-based testing** with fast-check
2. **Mutation testing** to verify tests catch violations
3. **Type-level proofs** using TypeScript branded types
4. **Model checking** for state machine properties

## References

- MATHISON_ORACLE_OI_MONOLITH v1.1.0 (crystal specification)
- MATHISON_GOVERNANCE_PROOF_BOOK_KB v1.5.0 (axioms/invariants)
- ARCHITECTURE.md (v2.2 software architecture)
