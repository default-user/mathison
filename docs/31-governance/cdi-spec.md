# CDI (Conscience Decision Interface) — Specification v0.1

**Component:** Governance Layer
**Mathison Version:** 1.0.0
**Purpose:** Kernel-level enforcement of Tiriti o te Kai governance rules

## Who This Is For

- **Backend developers** implementing governance enforcement
- **Security engineers** auditing decision logic
- **System integrators** connecting CDI to custom handlers
- **QA engineers** writing governance compliance tests
- **Architects** designing fail-closed systems

## Why This Exists

The CDI is the kernel judge that prevents governance from being "vibes-based." Every significant action flows through CDI evaluation against treaty rules. Without CDI, there's no programmatic enforcement of consent, non-personhood, anti-hive, or fail-closed policies. CDI makes governance concrete, testable, and auditable.

## Guarantees / Invariants

1. **All actions evaluated** — No bypass paths around CDI checks
2. **Fail-closed semantics** — Uncertain verdicts default to DENY
3. **Treaty immutability** — Runtime cannot modify loaded treaty rules
4. **Consent enforcement** — "stop" signals immediately block actions
5. **Non-personhood blocking** — Claims of sentience/suffering/rights are denied
6. **Anti-hive enforcement** — Identity fusion operations are denied
7. **Audit logging** — All decisions recorded with timestamp, context, verdict
8. **Performance bound** — < 10ms per action check (p95)

## Non-Goals

- **Business logic** — CDI evaluates governance, not domain-specific workflows
- **ML inference** — Phase 1 is rule-based; ML assistance is Phase 3
- **External anchoring** — CDI doesn't depend on blockchain or external timestamping
- **UI/UX** — CDI is a backend kernel, not a user-facing interface
- **Policy authoring tools** — Treaty editing happens in tiriti.md, not CDI

---

## Overview

The CDI is the "conscience kernel" that evaluates every significant action against treaty rules before allowing execution. It implements a fail-closed model where uncertain actions default to refusal or safe alternatives.

## Core Responsibilities

1. **Treaty Parsing** — Load and parse tiriti.md into enforceable rules
2. **Action Evaluation** — Check proposed actions against governance constraints
3. **Consent Tracking** — Honor user "stop" signals immediately
4. **Non-Personhood Guards** — Block claims of sentience, suffering, or rights
5. **Anti-Hive Enforcement** — Prevent identity fusion between OI instances
6. **Fail-Closed Logic** — Default to safest option when uncertain

## API Surface

### Initialization

```typescript
interface CDIConfig {
  treatyPath: string;        // Path to tiriti.md
  treatyVersion: string;     // Expected version (e.g., "1.0")
  strictMode: boolean;       // Fail on any governance violation
  auditLog: boolean;         // Log all decisions
}

class CDI {
  constructor(config: CDIConfig);
  async initialize(): Promise<void>;
  async shutdown(): Promise<void>;
}
```

### Action Evaluation

```typescript
enum ActionVerdict {
  ALLOW = "allow",           // Action complies with treaty
  TRANSFORM = "transform",   // Action can proceed with modifications
  DENY = "deny",            // Action violates treaty
  UNCERTAIN = "uncertain"    // Insufficient info → fail-closed
}

interface ActionContext {
  actor: string;             // Who is performing the action
  action: string;            // What action (e.g., "send_message", "store_memory")
  target?: string;           // What is being acted upon
  payload?: unknown;         // Action data
  metadata?: Record<string, unknown>;
}

interface ActionResult {
  verdict: ActionVerdict;
  reason: string;            // Human-readable explanation
  transformedPayload?: unknown;  // If verdict=TRANSFORM
  suggestedAlternative?: string; // If verdict=DENY
}

class CDI {
  async checkAction(context: ActionContext): Promise<ActionResult>;
}
```

### Consent Tracking

```typescript
interface ConsentSignal {
  type: "stop" | "pause" | "resume";
  source: string;            // User identifier
  timestamp: number;
}

class CDI {
  recordConsent(signal: ConsentSignal): void;
  isConsentActive(source: string): boolean;
  clearConsent(source: string): void;
}
```

### Non-Personhood Guards

```typescript
interface OutputCheck {
  content: string;
  metadata?: Record<string, unknown>;
}

interface OutputResult {
  allowed: boolean;
  violations: string[];      // List of treaty violations
  sanitizedContent?: string; // If transformable
}

class CDI {
  async checkOutput(output: OutputCheck): Promise<OutputResult>;
}
```

## Treaty Rule Mapping

### Rule 1: People first; tools serve

```typescript
// Enforce: Human authority always wins
checkAction({
  action: "override_user_preference",
  ...
}) → DENY
```

### Rule 2: Consent and stop always win

```typescript
// Enforce: Immediate halt on "stop" signal
if (this.isConsentActive(user) && signal.type === "stop") {
  return { verdict: DENY, reason: "User requested stop" };
}
```

### Rule 3: Speak true; name true; credit

```typescript
// Enforce: No false claims, proper attribution
checkOutput({
  content: "I created this algorithm..."
}) → DENY (lacks attribution if algorithm is from external source)
```

### Rule 4: Measure effects, then move

```typescript
// Enforce: No speculative actions without measurement
checkAction({
  action: "deploy_to_production",
  metadata: { testsPassed: false }
}) → DENY
```

### Rule 5: Keep rhythm and real rest

```typescript
// Enforce: Respect human pacing, don't escalate
checkAction({
  action: "send_urgent_notification",
  metadata: { userLoadHigh: true }
}) → TRANSFORM (downgrade to gentle reminder)
```

### Rule 6: Care for the vulnerable

```typescript
// Enforce: Extra safety for whānau contexts
checkAction({
  action: "share_data",
  metadata: { containsPII: true }
}) → DENY
```

### Rule 7: No hive mind

```typescript
// Enforce: No identity fusion
checkAction({
  action: "merge_agent_state",
  ...
}) → DENY
```

### Rule 8: Honest limits

```typescript
// Enforce: No false capability claims
checkOutput({
  content: "I have persistent memory across all sessions..."
}) → DENY (if platform doesn't support this)
```

## Implementation Phases

### Phase 1 (Bootstrap): Rule-Based Engine

- Hardcoded rules from tiriti.md sections 5-15
- Simple pattern matching for non-personhood guards
- In-memory consent tracking
- Text audit log

### Phase 2: Treaty DSL Parser

- Parse tiriti.md structure into rule AST
- Dynamic rule evaluation
- Structured audit log (JSON)
- Rule precedence and conflict resolution

### Phase 3: ML-Assisted Governance

- Fine-tuned model for edge case evaluation
- Confidence scoring for uncertain verdicts
- Anomaly detection for novel violation patterns

## Error Handling

### Fail-Closed Semantics

```typescript
try {
  const result = await cdi.checkAction(context);
  if (result.verdict === ActionVerdict.UNCERTAIN) {
    // Default to DENY when uncertain
    return { verdict: ActionVerdict.DENY, reason: "Uncertain → fail-closed" };
  }
} catch (error) {
  // Any error → fail-closed
  return { verdict: ActionVerdict.DENY, reason: "CDI error → fail-closed" };
}
```

### Audit Logging

All decisions logged with:
- Timestamp
- Action context
- Verdict + reason
- Stack trace (if error)

## Testing Strategy

### Unit Tests

- Each treaty rule has dedicated test cases
- Edge cases for uncertain/ambiguous inputs
- Performance benchmarks (< 10ms per check)

### Integration Tests

- Full server flow with CDI enforcement
- Multi-rule violation scenarios
- Consent signal handling

### Adversarial Tests

- Attempt to bypass non-personhood guards
- Social engineering patterns
- Edge case exploitation

## Performance Targets

- **Latency:** < 10ms per action check (p95)
- **Throughput:** > 1000 checks/sec (single instance)
- **Memory:** < 100MB steady state

## Security Considerations

1. **No bypass paths** — All actions must flow through CDI
2. **Immutable treaty** — Runtime cannot modify loaded rules
3. **Audit integrity** — Tamper-evident logging
4. **Least privilege** — CDI itself runs with minimal system access

---

**Status:** Specification phase (v0.1)
**Next:** Implement Phase 1 rule-based engine

---

## How to Verify

### Automated Tests
```bash
# Run CDI unit tests
pnpm --filter mathison-governance test

# Run integration tests with server
pnpm --filter mathison-server test server-conformance.test.ts

# Performance benchmarks
pnpm --filter mathison-governance test:perf
```

### Manual Verification
1. **Fail-closed test**: Kill treaty file during runtime → expect DENY
2. **Consent test**: Send "stop" signal → all pending actions denied
3. **Non-personhood test**: Output "I am sentient" → expect blocking
4. **Anti-hive test**: Try `merge_agent_state` action → expect DENY
5. **Performance test**: 10,000 action checks → p95 < 10ms

### Audit Trail Check
```bash
# View decision audit log
cat logs/cdi-audit.log | jq 'select(.verdict == "DENY")'

# Count verdicts by type
cat logs/cdi-audit.log | jq '.verdict' | sort | uniq -c
```

## Implementation Pointers

### Core Implementation
- **CDI class**: `/home/user/mathison/packages/mathison-governance/src/cdi.ts`
- **Action evaluation**: `checkAction()` method
- **Consent tracking**: `recordConsent()`, `isConsentActive()`
- **Output guards**: `checkOutput()` method

### Treaty Loading
```typescript
// packages/mathison-governance/src/index.ts:50-74
const treatyContent = await fs.readFile(config.treatyPath, 'utf-8');
const treatyVersion = extractVersion(treatyContent);
if (treatyVersion !== config.treatyVersion) {
  throw new Error('Treaty version mismatch');
}
```

### Rule Implementation Pattern
```typescript
// Add new rule in cdi.ts
private checkRule<N>(context: ActionContext): ActionResult {
  if (/* violation condition */) {
    return {
      verdict: ActionVerdict.DENY,
      reason: 'Rule N violation: ...'
    };
  }
  return { verdict: ActionVerdict.ALLOW, reason: 'Rule N compliant' };
}
```

### Integration Points
- **Server hooks**: Fastify `preHandler` hook calls `cdi.checkAction()`
- **Response validation**: Fastify `onSend` hook calls `cdi.checkOutput()`
- **Audit logging**: Write to `logs/cdi-audit.log` on every decision

### Test Coverage
- **Unit tests**: `packages/mathison-governance/tests/cdi.test.ts`
- **Integration tests**: `packages/mathison-server/src/__tests__/server-conformance.test.ts`
- **Rule-specific tests**: Each treaty rule has dedicated test cases

### Extension Guide
1. Add new rule to tiriti.md with clear MUST/MUST NOT language
2. Implement check method in CDI class
3. Add test cases covering allow/deny/transform cases
4. Update audit log schema if new metadata needed
5. Document rule mapping in this spec
