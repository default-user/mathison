# Conformance Tests - Thin Waist v0.1

**Purpose:** Prove governance invariants are enforced. Tests that must ALWAYS pass.

## Overview

The conformance test suite verifies that the thin-waist governance spine cannot be bypassed. These tests enforce the **"no backdoor"** principle: every high-risk operation goes through the governance chokepoints.

**Location:** `tests/conformance/thin-waist-conformance.test.ts`

## Critical Invariants

### 1. NO_TOOL_BYPASS

**Invariant:** Tools cannot bypass the ToolGateway.

**Tests:**
- Unregistered tool invocation is denied (deny-by-default)
- Tool cannot execute without capability token
- Tool invocation is logged for audit trail

**What it proves:**
- There is no code path that allows tools to run without going through the gateway
- The gateway enforces capability checks on every invocation
- All tool calls are auditable

### 2. CAPABILITY_DENY_BY_DEFAULT

**Invariant:** Unknown or invalid tokens are denied.

**Tests:**
- Expired token is denied
- Token with wrong action_id is denied
- Token with wrong actor is denied

**What it proves:**
- Capability tokens are validated on every use
- Time-based expiry is enforced
- Actor binding is enforced
- Action scoping is enforced

### 3. SIGNED_ARTIFACT_REQUIRED

**Invariant:** Unsigned or untrusted artifacts are rejected.

**Tests:**
- Unsigned artifact is rejected
- Tampered artifact is rejected (hash mismatch)
- Artifact verification status is tracked

**What it proves:**
- No artifact can be activated without signature verification
- Content integrity is checked (hash verification)
- Trust store controls which signers are accepted

### 4. FAIL_CLOSED_ON_MISSING_GOVERNANCE

**Invariant:** Missing governance prerequisites cause fail-closed behavior.

**Tests:**
- Tool gateway throws if not initialized
- Artifact verifier requires trust store in production mode
- Log sink blocks high-severity when caps exceeded

**What it proves:**
- System refuses to operate without governance infrastructure
- Production mode requires explicit configuration (no defaults)
- High-risk operations are blocked when safety requirements unmet

### 5. RETENTION_CAPS_ENFORCED

**Invariant:** Log storage never exceeds configured caps.

**Tests:**
- Log sink never exceeds max_envelopes cap
- Low-severity logs are dropped first on overflow
- Flush reduces envelope count
- Log envelope chain integrity maintained

**What it proves:**
- Memory usage is bounded (mobile-safe)
- Deterministic retention policy (no unbounded growth)
- Low-priority logs dropped before high-priority
- Chain of custody maintained

### 6. INTEGRATION

**Tests:**
- Tool invocations generate log envelopes
- End-to-end flow: gateway → handler → log sink

**What it proves:**
- Interfaces integrate correctly
- Real-world usage patterns work

## Running Conformance Tests

### Locally

```bash
# Run all conformance tests
pnpm test -- conformance

# Run specific test suite
pnpm test -- thin-waist-conformance

# Watch mode (during development)
pnpm test -- --watch conformance
```

### In CI

Conformance tests run automatically in CI pipeline:

```bash
# .github/workflows/ci.yml
- name: Run conformance tests
  run: pnpm test -- conformance
```

**CI must fail if conformance tests fail.**

## Interpreting Failures

### "TOOL_NOT_REGISTERED" test fails

**Meaning:** Deny-by-default is broken. A tool can execute without registration.

**Fix:**
1. Check if tool bypasses gateway.invoke()
2. Ensure all tool invocations route through ToolGateway
3. Search codebase for direct tool calls

### "CAPABILITY_DENIED" test fails

**Meaning:** Token validation is broken.

**Fix:**
1. Check validateToken() implementation
2. Verify boot key initialization
3. Check token signing/verification logic

### "Content hash mismatch" test fails

**Meaning:** Artifact verification is broken or bypassed.

**Fix:**
1. Check verifyManifest() implementation
2. Ensure content hash computed correctly
3. Verify no artifacts loaded without verification

### "DURABLE_LOGGING_REQUIRED" test fails

**Meaning:** Log retention caps not enforced.

**Fix:**
1. Check LogSink.append() logic
2. Verify retention policy enforcement
3. Ensure high-severity blocks when caps exceeded

## Adding New Conformance Tests

When adding a new governance mechanism, add conformance tests to prove it cannot be bypassed:

1. **Identify the invariant:** What must ALWAYS be true?
2. **Write positive test:** Normal case passes
3. **Write negative tests:** Bypass attempts fail
4. **Add to CI:** Test runs on every commit

### Template

```typescript
describe('NEW_INVARIANT_NAME', () => {
  test('normal case succeeds', () => {
    // Verify normal operation works
  });

  test('bypass attempt 1 is blocked', () => {
    // Try to bypass via method 1
    // Verify it fails with appropriate error
  });

  test('bypass attempt 2 is blocked', () => {
    // Try to bypass via method 2
    // Verify it fails with appropriate error
  });
});
```

## Conformance vs Unit Tests

**Conformance tests:**
- Prove invariants (governance guarantees)
- Must ALWAYS pass
- CI fails if they fail
- Integration-level (test multiple components)
- Focus: "Can this be bypassed?"

**Unit tests:**
- Test individual functions
- Implementation details
- May change with refactoring
- Focus: "Does this function work correctly?"

## Security Properties

The conformance suite proves these security properties:

1. **No unauthorized tool execution:** All tools require capability tokens
2. **No artifact tampering:** Unsigned/modified artifacts rejected
3. **No unbounded memory growth:** Log caps enforced deterministically
4. **Audit trail integrity:** All governance decisions logged
5. **Fail-closed:** Missing governance prerequisites block high-risk operations

## Maintenance

### When to update conformance tests

- **New governance mechanism added:** Add tests proving it cannot be bypassed
- **Invariant changed:** Update tests to reflect new invariant
- **Bypass discovered:** Add test proving bypass is now blocked

### When NOT to update conformance tests

- **Performance optimization:** If invariant unchanged, tests remain the same
- **Refactoring:** Tests verify behavior, not implementation
- **New features (non-governance):** Add unit tests, not conformance tests

## Troubleshooting

### Tests fail after dependency update

1. Check if Jest/TypeScript config changed
2. Verify test imports resolve correctly
3. Run `pnpm install` and rebuild

### Tests fail in CI but pass locally

1. Check environment differences (Node version, env vars)
2. Verify test isolation (no global state leaks)
3. Check for timing issues (async/await)

### Test timeout

1. Increase Jest timeout: `jest.setTimeout(10000)`
2. Check for infinite loops
3. Mock slow operations

## Related Documentation

- [Thin Waist v0.1](./THIN_WAIST_V0_1.md) - Architecture overview
- [Engineering Notes](./ENGINEERING_NOTES_THIN_WAIST.md) - Implementation details
- [Action Registry](../packages/mathison-governance/src/action-registry.ts) - Action definitions
- [Capability Tokens](../packages/mathison-governance/src/capability-token.ts) - Token implementation

## Success Criteria

Conformance tests prove:
- ✅ No tool bypass paths exist
- ✅ Capability tokens enforced everywhere
- ✅ Artifacts verified before activation
- ✅ Fail-closed on missing governance
- ✅ Log retention caps enforced
- ✅ Audit trail maintained

**If all conformance tests pass, the thin-waist governance spine is intact.**
