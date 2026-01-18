/**
 * Mathison v2.1 Pipeline Enforcement Tests
 *
 * INVARIANT: Every request/action path runs through ONE shared governed pipeline.
 * INVARIANT: Fail-closed is mandatory.
 */

import {
  PipelineExecutor,
  HandlerRegistry,
  createPipeline,
  buildContext,
  PipelineContext,
  PipelineRequest,
  GovernanceProvider,
  GovernanceCapsuleStatus,
  StageResult,
  DecisionMeta,
  CapabilityToken,
  RedactionRule,
} from '../src';

// Mock governance provider
class MockGovernanceProvider implements GovernanceProvider {
  private shouldAllowAction: boolean = true;
  private capsuleValid: boolean = true;
  private degradationLevel: 'none' | 'partial' | 'full' = 'none';

  setAllowAction(allow: boolean) {
    this.shouldAllowAction = allow;
  }

  setCapsuleValid(valid: boolean) {
    this.capsuleValid = valid;
  }

  setDegradationLevel(level: 'none' | 'partial' | 'full') {
    this.degradationLevel = level;
  }

  getCapsuleStatus(): GovernanceCapsuleStatus {
    return {
      valid: this.capsuleValid,
      capsule_id: 'test-capsule',
      expires_at: new Date(Date.now() + 3600000),
      stale: false,
      degradation_level: this.degradationLevel,
    };
  }

  async validateCifIngress(context: PipelineContext, payload: unknown): Promise<StageResult> {
    return { passed: true, duration_ms: 1 };
  }

  async checkCdiAction(
    context: PipelineContext,
    intent: string,
    riskClass: string,
    requestedCapabilities: string[]
  ): Promise<StageResult<DecisionMeta>> {
    const decisionMeta: DecisionMeta = {
      allowed: this.shouldAllowAction,
      reason: this.shouldAllowAction ? 'Action allowed' : 'Action denied by CDI',
      risk_class: riskClass as any,
      capability_tokens: this.shouldAllowAction
        ? [
            {
              token_id: 'test-token',
              capability: intent,
              oi_id: context.oi_id,
              principal_id: context.principal_id,
              expires_at: new Date(Date.now() + 300000),
              constraints: {},
            },
          ]
        : [],
      redaction_rules: [],
      required_confirmation: false,
      decided_at: new Date(),
    };

    return {
      passed: this.shouldAllowAction,
      data: decisionMeta,
      error: this.shouldAllowAction
        ? undefined
        : { code: 'ACTION_DENIED', message: 'Action denied by CDI', stage: 'cdi_action_check' },
      duration_ms: 1,
    };
  }

  async checkCdiOutput(
    context: PipelineContext,
    response: unknown,
    decisionMeta: DecisionMeta
  ): Promise<StageResult<{ redacted_response: unknown; applied_rules: RedactionRule[] }>> {
    return {
      passed: true,
      data: { redacted_response: response, applied_rules: [] },
      duration_ms: 1,
    };
  }

  async validateCifEgress(context: PipelineContext, response: unknown): Promise<StageResult> {
    return { passed: true, duration_ms: 1 };
  }
}

describe('Pipeline Enforcement Invariants', () => {
  let governance: MockGovernanceProvider;
  let registry: HandlerRegistry;
  let pipeline: PipelineExecutor;

  beforeEach(() => {
    governance = new MockGovernanceProvider();
    registry = new HandlerRegistry();
    pipeline = createPipeline(governance, registry);

    // Register a test handler
    registry.register({
      id: 'test_handler',
      intent: 'test.action',
      risk_class: 'low_risk',
      required_capabilities: [],
      handler: async (ctx, payload, caps) => {
        return { success: true, data: payload };
      },
    });
  });

  describe('INVARIANT: All requests flow through pipeline stages', () => {
    it('should execute CIF ingress before CDI action check', async () => {
      const stageOrder: string[] = [];

      // Create a custom provider that tracks stage order
      const trackingProvider: GovernanceProvider = {
        getCapsuleStatus: () => governance.getCapsuleStatus(),
        validateCifIngress: async (ctx, payload) => {
          stageOrder.push('cif_ingress');
          return { passed: true, duration_ms: 1 };
        },
        checkCdiAction: async (ctx, intent, risk, caps) => {
          stageOrder.push('cdi_action_check');
          return governance.checkCdiAction(ctx, intent, risk, caps);
        },
        checkCdiOutput: async (ctx, response, meta) => {
          stageOrder.push('cdi_output_check');
          return governance.checkCdiOutput(ctx, response, meta);
        },
        validateCifEgress: async (ctx, response) => {
          stageOrder.push('cif_egress');
          return { passed: true, duration_ms: 1 };
        },
      };

      const trackingPipeline = createPipeline(trackingProvider, registry);

      const request: PipelineRequest = {
        context: buildContext({
          principal_id: 'test-principal',
          oi_id: 'test-namespace',
          intent: 'test.action',
          origin: { source: 'http', labels: [], purpose: 'test' },
        }),
        payload: { test: true },
      };

      await trackingPipeline.execute(request);

      expect(stageOrder).toEqual([
        'cif_ingress',
        'cdi_action_check',
        'cdi_output_check',
        'cif_egress',
      ]);
    });

    it('should stop at CIF ingress if validation fails', async () => {
      const failingProvider: GovernanceProvider = {
        getCapsuleStatus: () => governance.getCapsuleStatus(),
        validateCifIngress: async () => ({
          passed: false,
          error: { code: 'CIF_FAILED', message: 'Validation failed', stage: 'cif_ingress' },
          duration_ms: 1,
        }),
        checkCdiAction: async () => {
          throw new Error('Should not reach CDI action');
        },
        checkCdiOutput: async () => {
          throw new Error('Should not reach CDI output');
        },
        validateCifEgress: async () => {
          throw new Error('Should not reach CIF egress');
        },
      };

      const failingPipeline = createPipeline(failingProvider, registry);

      const request: PipelineRequest = {
        context: buildContext({
          principal_id: 'test-principal',
          oi_id: 'test-namespace',
          intent: 'test.action',
          origin: { source: 'http', labels: [], purpose: 'test' },
        }),
        payload: {},
      };

      const response = await failingPipeline.execute(request);

      expect(response.success).toBe(false);
      expect(response.error?.stage).toBe('cif_ingress');
    });
  });

  describe('INVARIANT: Handlers cannot be called directly', () => {
    it('should deny unknown intents', async () => {
      const request: PipelineRequest = {
        context: buildContext({
          principal_id: 'test-principal',
          oi_id: 'test-namespace',
          intent: 'unknown.action',
          origin: { source: 'http', labels: [], purpose: 'test' },
        }),
        payload: {},
      };

      const response = await pipeline.execute(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('UNKNOWN_INTENT');
    });

    it('should only call handler if CDI allows', async () => {
      governance.setAllowAction(false);

      const request: PipelineRequest = {
        context: buildContext({
          principal_id: 'test-principal',
          oi_id: 'test-namespace',
          intent: 'test.action',
          origin: { source: 'http', labels: [], purpose: 'test' },
        }),
        payload: { data: 'test' },
      };

      const response = await pipeline.execute(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('ACTION_DENIED');
    });

    it('should call handler when CDI allows', async () => {
      governance.setAllowAction(true);

      const request: PipelineRequest = {
        context: buildContext({
          principal_id: 'test-principal',
          oi_id: 'test-namespace',
          intent: 'test.action',
          origin: { source: 'http', labels: [], purpose: 'test' },
        }),
        payload: { data: 'test' },
      };

      const response = await pipeline.execute(request);

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ success: true, data: { data: 'test' } });
    });
  });

  describe('INVARIANT: Context validation is mandatory', () => {
    it('should reject missing principal_id', async () => {
      const request: PipelineRequest = {
        context: {
          trace_id: 'test',
          principal_id: '', // Missing
          oi_id: 'test-namespace',
          intent: 'test.action',
          requested_capabilities: [],
          origin: { source: 'http', labels: [], purpose: 'test' },
          created_at: new Date(),
        },
        payload: {},
      };

      const response = await pipeline.execute(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('INVALID_CONTEXT');
    });

    it('should reject missing oi_id', async () => {
      const request: PipelineRequest = {
        context: {
          trace_id: 'test',
          principal_id: 'test-principal',
          oi_id: '', // Missing
          intent: 'test.action',
          requested_capabilities: [],
          origin: { source: 'http', labels: [], purpose: 'test' },
          created_at: new Date(),
        },
        payload: {},
      };

      const response = await pipeline.execute(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('INVALID_CONTEXT');
    });

    it('should reject missing intent', async () => {
      const request: PipelineRequest = {
        context: {
          trace_id: 'test',
          principal_id: 'test-principal',
          oi_id: 'test-namespace',
          intent: '', // Missing
          requested_capabilities: [],
          origin: { source: 'http', labels: [], purpose: 'test' },
          created_at: new Date(),
        },
        payload: {},
      };

      const response = await pipeline.execute(request);

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('INVALID_CONTEXT');
    });
  });
});
