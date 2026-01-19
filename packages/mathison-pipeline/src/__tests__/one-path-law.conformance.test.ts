/**
 * ONE_PATH_LAW Conformance Test Suite
 * =============================================================================
 *
 * This test suite proves the ONE_PATH_LAW invariants hold:
 * 1. All requests flow through 5 stages in order
 * 2. No bypass is possible
 * 3. Capability tokens are required for side effects
 * 4. STOP revokes all tokens immediately
 * 5. Receipt chain is tamper-evident
 *
 * These tests are MANDATORY for CI - no code ships without passing.
 */

// Jest test suite - using Jest globals
import {
  onePathLaw,
  tokenStore,
  generateReceipt,
  verifyReceiptChain,
  createPipelineState,
  canTransitionTo,
  transitionTo,
  DEGRADATION_LADDER,
  type PipelineState,
  type ReceiptChain,
} from '../one-path-law';
import {
  GovernedExecutor,
  HandlerRegistry,
  createGovernedExecutor,
  buildContext,
  type GovernanceProvider,
  type CapsuleStatus,
  type IngressResult,
  type ActionResult,
  type OutputResult,
  type EgressResult,
  type PipelineContext,
  type DecisionMeta,
  type CapabilityToken,
} from '../governed-executor';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockGovernance(overrides: Partial<GovernanceProvider> = {}): GovernanceProvider {
  return {
    getCapsuleStatus: jest.fn().mockReturnValue({
      state: 'valid',
      capsule_id: 'test-capsule',
      degradation_level: 'none',
    } as CapsuleStatus),

    validateIngress: jest.fn().mockResolvedValue({
      valid: true,
      sanitized_payload: { test: 'data' },
      taint_labels: [],
    } as IngressResult),

    checkAction: jest.fn().mockResolvedValue({
      allowed: true,
      reason: 'Action allowed',
      capabilities: [
        {
          token_id: 'cap-1',
          capability: 'test_action',
          oi_id: 'test-oi',
          principal_id: 'test-principal',
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 300000),
          constraints: {},
          revoked: false,
        } as CapabilityToken,
      ],
      redaction_rules: [],
    } as ActionResult),

    checkOutput: jest.fn().mockResolvedValue({
      valid: true,
      redacted_response: { result: 'success' },
    } as OutputResult),

    validateEgress: jest.fn().mockResolvedValue({
      valid: true,
      final_response: { result: 'success' },
    } as EgressResult),

    ...overrides,
  };
}

function createTestContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return buildContext({
    principal_id: 'test-principal',
    oi_id: 'test-oi',
    intent: 'test.action',
    origin: {
      source: 'cli',
      labels: ['test'],
      purpose: 'testing',
    },
    ...overrides,
  });
}

// =============================================================================
// 1. Stage Transition Tests
// =============================================================================

describe('ONE_PATH_LAW: Stage Transitions', () => {
  it('should only allow valid stage transitions', () => {
    // INIT -> CIF_INGRESS (valid)
    expect(canTransitionTo('INIT', 'CIF_INGRESS')).toBe(true);
    expect(canTransitionTo('INIT', 'CDI_ACTION')).toBe(false);
    expect(canTransitionTo('INIT', 'HANDLER')).toBe(false);

    // CIF_INGRESS -> CDI_ACTION (valid)
    expect(canTransitionTo('CIF_INGRESS', 'CDI_ACTION')).toBe(true);
    expect(canTransitionTo('CIF_INGRESS', 'HANDLER')).toBe(false);
    expect(canTransitionTo('CIF_INGRESS', 'CIF_EGRESS')).toBe(false);

    // CDI_ACTION -> HANDLER (valid)
    expect(canTransitionTo('CDI_ACTION', 'HANDLER')).toBe(true);
    expect(canTransitionTo('CDI_ACTION', 'CIF_INGRESS')).toBe(false);
    expect(canTransitionTo('CDI_ACTION', 'CDI_OUTPUT')).toBe(false);

    // HANDLER -> CDI_OUTPUT (valid)
    expect(canTransitionTo('HANDLER', 'CDI_OUTPUT')).toBe(true);
    expect(canTransitionTo('HANDLER', 'CIF_EGRESS')).toBe(false);

    // CDI_OUTPUT -> CIF_EGRESS (valid)
    expect(canTransitionTo('CDI_OUTPUT', 'CIF_EGRESS')).toBe(true);
    expect(canTransitionTo('CDI_OUTPUT', 'HANDLER')).toBe(false);

    // COMPLETE/FAILED -> nothing
    expect(canTransitionTo('COMPLETE', 'CIF_INGRESS')).toBe(false);
    expect(canTransitionTo('FAILED', 'CIF_INGRESS')).toBe(false);
  });

  it('should throw on invalid transition', () => {
    const state = createPipelineState('test-trace');
    const receipt = generateReceipt('CIF_INGRESS', 'test-trace', 'PASS', {}, 'GENESIS');

    // Valid transition
    const newState = transitionTo(state, 'CIF_INGRESS', receipt);
    expect(newState.current_stage).toBe('CIF_INGRESS');

    // Invalid transition - should throw
    const receipt2 = generateReceipt('HANDLER', 'test-trace', 'PASS', {}, receipt.hash);
    expect(() => transitionTo(newState, 'HANDLER', receipt2)).toThrow(
      /Invalid stage transition/
    );
  });
});

// =============================================================================
// 2. No Bypass Tests
// =============================================================================

describe('ONE_PATH_LAW: No Bypass', () => {
  let registry: HandlerRegistry;
  let governance: GovernanceProvider;
  let executor: GovernedExecutor;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registry.register({
      id: 'test-handler',
      intent: 'test.action',
      risk_class: 'low_risk',
      required_capabilities: ['test_action'],
      handler: async () => ({ result: 'success' }),
    });

    governance = createMockGovernance();
    executor = createGovernedExecutor(governance, registry);
  });

  it('should not allow handler execution without CIF_INGRESS', async () => {
    // Make ingress fail
    governance.validateIngress = jest.fn().mockResolvedValue({
      valid: false,
      errors: ['Ingress validation failed'],
      taint_labels: [],
    });

    const context = createTestContext();
    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('CIF_INGRESS_FAILED');

    // Handler should NOT have been called
    expect(governance.checkAction).not.toHaveBeenCalled();
  });

  it('should not allow handler execution without CDI_ACTION approval', async () => {
    // Make CDI deny the action
    governance.checkAction = jest.fn().mockResolvedValue({
      allowed: false,
      reason: 'Action denied by CDI',
    });

    const context = createTestContext();
    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('CDI_ACTION_DENIED');
    expect(response.error?.message).toBe('Action denied by CDI');
  });

  it('should not return response without CDI_OUTPUT check', async () => {
    // Make CDI output check fail
    governance.checkOutput = jest.fn().mockResolvedValue({
      valid: false,
      errors: ['Output validation failed'],
    });

    const context = createTestContext();
    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('CDI_OUTPUT_DENIED');
  });

  it('should not return response without CIF_EGRESS validation', async () => {
    // Make egress fail
    governance.validateEgress = jest.fn().mockResolvedValue({
      valid: false,
      errors: ['Egress validation failed'],
    });

    const context = createTestContext();
    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('CIF_EGRESS_FAILED');
  });

  it('should deny unknown intents', async () => {
    const context = createTestContext({ intent: 'unknown.action' });
    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('UNKNOWN_INTENT');
  });
});

// =============================================================================
// 3. Handler Registry Protection
// =============================================================================

describe('ONE_PATH_LAW: Handler Registry Protection', () => {
  it('should not allow direct handler execution', () => {
    const registry = new HandlerRegistry();
    const mockHandler = jest.fn().mockResolvedValue({ result: 'success' });

    registry.register({
      id: 'protected-handler',
      intent: 'protected.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: mockHandler,
    });

    // Attempt to execute handler directly with wrong token
    expect(() =>
      registry._execute(
        'protected.action',
        createTestContext(),
        {},
        [],
        Symbol('FAKE_TOKEN') // Wrong token
      )
    ).toThrow('Direct handler execution is forbidden');

    // Handler should NOT have been called
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should not allow handler registration after sealing', () => {
    const registry = new HandlerRegistry();
    registry.register({
      id: 'first-handler',
      intent: 'first.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: async () => ({ result: 'first' }),
    });

    registry.seal();

    expect(() =>
      registry.register({
        id: 'second-handler',
        intent: 'second.action',
        risk_class: 'low_risk',
        required_capabilities: [],
        handler: async () => ({ result: 'second' }),
      })
    ).toThrow('Handler registry is sealed');
  });

  it('should not expose handler function through getMetadata', () => {
    const registry = new HandlerRegistry();
    const secretHandler = jest.fn();

    registry.register({
      id: 'secret-handler',
      intent: 'secret.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: secretHandler,
    });

    const metadata = registry.getMetadata('secret.action');

    // Metadata should NOT contain the handler function
    expect(metadata).toBeDefined();
    expect((metadata as any).handler).toBeUndefined();
    expect(metadata?.id).toBe('secret-handler');
  });
});

// =============================================================================
// 4. Capability Token Tests
// =============================================================================

describe('ONE_PATH_LAW: Capability Tokens', () => {
  beforeEach(() => {
    // Clean up token store between tests
    tokenStore.cleanup();
  });

  it('should issue tokens with correct expiry', () => {
    const token = tokenStore.issue(
      'test_capability',
      'test-oi',
      'test-principal',
      60000 // 1 minute
    );

    expect(token.capability).toBe('test_capability');
    expect(token.oi_id).toBe('test-oi');
    expect(token.principal_id).toBe('test-principal');
    expect(token.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('should verify valid tokens', () => {
    const token = tokenStore.issue('test_capability', 'test-oi', 'test-principal');

    const result = tokenStore.verify(token.token_id);
    expect(result.valid).toBe(true);
  });

  it('should reject expired tokens', async () => {
    const token = tokenStore.issue(
      'test_capability',
      'test-oi',
      'test-principal',
      1 // 1ms TTL
    );

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = tokenStore.verify(token.token_id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Token has expired');
  });

  it('should reject revoked tokens', () => {
    const token = tokenStore.issue('test_capability', 'test-oi', 'test-principal');

    tokenStore.revoke(token.token_id);

    const result = tokenStore.verify(token.token_id);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Token has been revoked');
  });

  it('should reject unknown tokens', () => {
    const result = tokenStore.verify('unknown-token-id');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Token not found');
  });
});

// =============================================================================
// 5. STOP Command Tests
// =============================================================================

describe('ONE_PATH_LAW: STOP Command', () => {
  it('should revoke all tokens for an OI', () => {
    // Issue multiple tokens for the same OI
    const token1 = tokenStore.issue('cap1', 'target-oi', 'principal1');
    const token2 = tokenStore.issue('cap2', 'target-oi', 'principal2');
    const token3 = tokenStore.issue('cap3', 'other-oi', 'principal1');

    // Revoke all tokens for target-oi
    const revoked = tokenStore.revokeAllForOI('target-oi');

    expect(revoked).toBe(2);

    // Tokens for target-oi should be invalid
    expect(tokenStore.verify(token1.token_id).valid).toBe(false);
    expect(tokenStore.verify(token2.token_id).valid).toBe(false);

    // Token for other-oi should still be valid
    expect(tokenStore.verify(token3.token_id).valid).toBe(true);
  });

  it('should fail execution on STOP', () => {
    const registry = new HandlerRegistry();
    registry.register({
      id: 'test-handler',
      intent: 'test.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: async () => ({ result: 'success' }),
    });

    const governance = createMockGovernance();
    const executor = createGovernedExecutor(governance, registry);

    const context = createTestContext();
    const stopResult = executor.stop(context.trace_id, context.oi_id);

    expect(stopResult.state.current_stage).toBe('FAILED');
    expect(stopResult.state.error?.code).toBe('STOP_COMMAND');
  });
});

// =============================================================================
// 6. Receipt Chain Tests
// =============================================================================

describe('ONE_PATH_LAW: Receipt Chain', () => {
  it('should generate valid receipt chain for successful execution', async () => {
    const registry = new HandlerRegistry();
    registry.register({
      id: 'test-handler',
      intent: 'test.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: async () => ({ result: 'success' }),
    });

    const governance = createMockGovernance();
    const executor = createGovernedExecutor(governance, registry);

    const context = createTestContext();
    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(true);
    expect(response.receipt_chain).toBeDefined();
    expect(response.receipt_chain.complete).toBe(true);
    expect(response.receipt_chain.receipts.length).toBe(5); // All 5 stages

    // Verify chain integrity
    expect(verifyReceiptChain(response.receipt_chain)).toBe(true);
  });

  it('should detect tampering in receipt chain', () => {
    const receipt1 = generateReceipt('CIF_INGRESS', 'test', 'PASS', {}, 'GENESIS');
    const receipt2 = generateReceipt('CDI_ACTION', 'test', 'PASS', {}, receipt1.hash);

    const validChain: ReceiptChain = {
      trace_id: 'test',
      receipts: [receipt1, receipt2],
      complete: false,
      final_hash: receipt2.hash,
    };

    expect(verifyReceiptChain(validChain)).toBe(true);

    // Tamper with the chain
    const tamperedReceipt = {
      ...receipt2,
      details: { tampered: true }, // Changed details
    };

    const tamperedChain: ReceiptChain = {
      trace_id: 'test',
      receipts: [receipt1, tamperedReceipt],
      complete: false,
      final_hash: receipt2.hash, // Hash doesn't match tampered content
    };

    expect(verifyReceiptChain(tamperedChain)).toBe(false);
  });

  it('should include partial receipt chain on failure', async () => {
    const registry = new HandlerRegistry();
    registry.register({
      id: 'test-handler',
      intent: 'test.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: async () => ({ result: 'success' }),
    });

    const governance = createMockGovernance({
      checkAction: jest.fn().mockResolvedValue({
        allowed: false,
        reason: 'Denied',
      }),
    });

    const executor = createGovernedExecutor(governance, registry);
    const context = createTestContext();

    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(false);
    expect(response.receipt_chain.complete).toBe(false);
    // Should have CIF_INGRESS (pass) and CDI_ACTION (fail)
    expect(response.receipt_chain.receipts.length).toBe(2);
  });
});

// =============================================================================
// 7. Degradation Ladder Tests
// =============================================================================

describe('ONE_PATH_LAW: Degradation Ladder', () => {
  it('should allow all risk classes when capsule is valid', () => {
    expect(DEGRADATION_LADDER.valid.read_only).toBe('ALLOW');
    expect(DEGRADATION_LADDER.valid.low_risk).toBe('ALLOW');
    expect(DEGRADATION_LADDER.valid.medium_risk).toBe('ALLOW');
    expect(DEGRADATION_LADDER.valid.high_risk).toBe('ALLOW');
  });

  it('should restrict medium/high risk when capsule is stale', () => {
    expect(DEGRADATION_LADDER.stale.read_only).toBe('ALLOW');
    expect(DEGRADATION_LADDER.stale.low_risk).toBe('ALLOW');
    expect(DEGRADATION_LADDER.stale.medium_risk).toBe('DENY');
    expect(DEGRADATION_LADDER.stale.high_risk).toBe('DENY');
  });

  it('should only allow read_only when capsule is missing', () => {
    expect(DEGRADATION_LADDER.missing.read_only).toBe('ALLOW');
    expect(DEGRADATION_LADDER.missing.low_risk).toBe('DENY');
    expect(DEGRADATION_LADDER.missing.medium_risk).toBe('DENY');
    expect(DEGRADATION_LADDER.missing.high_risk).toBe('DENY');
  });
});

// =============================================================================
// 8. Cross-Namespace Default Deny
// =============================================================================

describe('ONE_PATH_LAW: Cross-Namespace Default Deny', () => {
  it('should deny cross-namespace operations by default', async () => {
    const registry = new HandlerRegistry();
    registry.register({
      id: 'test-handler',
      intent: 'test.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: async () => ({ result: 'success' }),
    });

    // Governance provider that detects cross-namespace and denies
    const governance = createMockGovernance({
      checkAction: jest.fn().mockImplementation(async (context: PipelineContext) => {
        // Simulate cross-namespace check
        const targetNamespace = (context.metadata as any)?.target_namespace;
        if (targetNamespace && targetNamespace !== context.oi_id) {
          return {
            allowed: false,
            reason: 'Cross-namespace operations are denied by default',
          };
        }
        return {
          allowed: true,
          reason: 'Action allowed',
          capabilities: [],
        };
      }),
    });

    const executor = createGovernedExecutor(governance, registry);

    // Request with different target namespace
    const context = createTestContext({
      metadata: { target_namespace: 'other-namespace' },
    });

    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(false);
    expect(response.error?.message).toContain('Cross-namespace');
  });
});

// =============================================================================
// 9. Complete Pipeline Flow
// =============================================================================

describe('ONE_PATH_LAW: Complete Pipeline Flow', () => {
  it('should execute all 5 stages in order for successful request', async () => {
    const stages: string[] = [];

    const registry = new HandlerRegistry();
    registry.register({
      id: 'test-handler',
      intent: 'test.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: async () => {
        stages.push('HANDLER');
        return { result: 'success' };
      },
    });

    const governance = createMockGovernance({
      validateIngress: jest.fn().mockImplementation(async () => {
        stages.push('CIF_INGRESS');
        return { valid: true, sanitized_payload: {}, taint_labels: [] };
      }),
      checkAction: jest.fn().mockImplementation(async () => {
        stages.push('CDI_ACTION');
        return { allowed: true, reason: 'ok', capabilities: [] };
      }),
      checkOutput: jest.fn().mockImplementation(async () => {
        stages.push('CDI_OUTPUT');
        return { valid: true, redacted_response: {} };
      }),
      validateEgress: jest.fn().mockImplementation(async () => {
        stages.push('CIF_EGRESS');
        return { valid: true, final_response: {} };
      }),
    });

    const executor = createGovernedExecutor(governance, registry);
    const context = createTestContext();

    const response = await executor.execute({
      context,
      payload: { test: 'data' },
    });

    expect(response.success).toBe(true);
    expect(stages).toEqual([
      'CIF_INGRESS',
      'CDI_ACTION',
      'HANDLER',
      'CDI_OUTPUT',
      'CIF_EGRESS',
    ]);
  });
});
