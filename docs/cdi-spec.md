# CDI (Conscience Decision Interface) — Specification v0.1

**Component:** Governance Layer
**Purpose:** Kernel-level enforcement of Tiriti o te Kai governance rules

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
