/**
 * GOVERNED_EXECUTOR - Pipeline executor with ONE_PATH_LAW enforcement
 * =============================================================================
 *
 * This is THE ONLY way to execute requests in Mathison. It enforces:
 * 1. All 5 stages execute in order: CIF_INGRESS → CDI_ACTION → HANDLER → CDI_OUTPUT → CIF_EGRESS
 * 2. Tamper-evident receipt chain for every execution
 * 3. Capability token lifecycle management
 * 4. STOP command support with immediate token revocation
 *
 * INVARIANTS:
 * - No handler can execute without passing through all prior stages
 * - No response can be returned without passing through all stages
 * - All side effects require valid capability tokens
 * - STOP revokes all tokens immediately
 */

import { randomUUID } from 'crypto';
import {
  onePathLaw,
  tokenStore,
  DEGRADATION_LADDER,
  type PipelineState,
  type PipelineError,
  type ReceiptChain,
  type CapabilityToken,
  type RiskClass,
  type DegradationLevel,
} from './one-path-law';

// =============================================================================
// Types
// =============================================================================

/**
 * Request origin for taint tracking
 */
export interface RequestOrigin {
  source: 'http' | 'grpc' | 'cli' | 'worker';
  labels: string[];
  purpose: string;
  client_id?: string;
}

/**
 * Pipeline context - required for every request
 */
export interface PipelineContext {
  trace_id: string;
  principal_id: string;
  oi_id: string;
  intent: string;
  requested_capabilities: string[];
  origin: RequestOrigin;
  created_at: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Pipeline request
 */
export interface PipelineRequest<T = unknown> {
  context: PipelineContext;
  payload: T;
}

/**
 * Decision metadata from CDI
 */
export interface DecisionMeta {
  allowed: boolean;
  reason: string;
  risk_class: RiskClass;
  capability_tokens: CapabilityToken[];
  redaction_rules: RedactionRule[];
  degradation_level: DegradationLevel;
  decided_at: Date;
}

/**
 * Redaction rule
 */
export interface RedactionRule {
  pattern: string;
  replacement: string;
  reason: string;
}

/**
 * Pipeline response - sealed type that can only be produced by the executor
 */
export interface PipelineResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: PipelineError;
  readonly decision_meta: DecisionMeta;
  readonly trace_id: string;
  readonly receipt_chain: ReceiptChain;
}

/**
 * Handler function signature
 */
export type PipelineHandler<TReq = unknown, TRes = unknown> = (
  context: PipelineContext,
  payload: TReq,
  capabilities: CapabilityToken[]
) => Promise<TRes>;

/**
 * Registered handler with metadata
 */
export interface RegisteredHandler<TReq = unknown, TRes = unknown> {
  id: string;
  intent: string;
  risk_class: RiskClass;
  required_capabilities: string[];
  handler: PipelineHandler<TReq, TRes>;
}

/**
 * Governance capsule status
 */
export interface CapsuleStatus {
  state: 'valid' | 'stale' | 'missing';
  capsule_id?: string;
  expires_at?: Date;
  degradation_level: DegradationLevel;
}

/**
 * Governance provider interface
 */
export interface GovernanceProvider {
  getCapsuleStatus(): CapsuleStatus;
  validateIngress(context: PipelineContext, payload: unknown): Promise<IngressResult>;
  checkAction(
    context: PipelineContext,
    intent: string,
    risk_class: RiskClass,
    capabilities: string[]
  ): Promise<ActionResult>;
  checkOutput(
    context: PipelineContext,
    response: unknown,
    decision: DecisionMeta
  ): Promise<OutputResult>;
  validateEgress(context: PipelineContext, response: unknown): Promise<EgressResult>;
}

export interface IngressResult {
  valid: boolean;
  sanitized_payload?: unknown;
  taint_labels: string[];
  errors?: string[];
}

export interface ActionResult {
  allowed: boolean;
  reason: string;
  capabilities?: CapabilityToken[];
  redaction_rules?: RedactionRule[];
}

export interface OutputResult {
  valid: boolean;
  redacted_response?: unknown;
  errors?: string[];
}

export interface EgressResult {
  valid: boolean;
  final_response?: unknown;
  errors?: string[];
}

// =============================================================================
// Handler Registry
// =============================================================================

/**
 * Registry for pipeline handlers - no direct access to handlers
 */
export class HandlerRegistry {
  private handlers: Map<string, RegisteredHandler> = new Map();
  private sealed: boolean = false;

  /**
   * Register a handler for an intent
   */
  register<TReq, TRes>(handler: RegisteredHandler<TReq, TRes>): void {
    if (this.sealed) {
      throw new Error('Handler registry is sealed - no new handlers can be registered');
    }
    if (this.handlers.has(handler.intent)) {
      throw new Error(`Handler already registered for intent: ${handler.intent}`);
    }
    this.handlers.set(handler.intent, handler as RegisteredHandler);
  }

  /**
   * Seal the registry - no more handlers can be registered
   */
  seal(): void {
    this.sealed = true;
  }

  /**
   * Check if a handler exists (internal use only)
   */
  has(intent: string): boolean {
    return this.handlers.has(intent);
  }

  /**
   * Get handler metadata (internal use only - does not expose handler function)
   */
  getMetadata(intent: string): Omit<RegisteredHandler, 'handler'> | undefined {
    const handler = this.handlers.get(intent);
    if (!handler) return undefined;
    return {
      id: handler.id,
      intent: handler.intent,
      risk_class: handler.risk_class,
      required_capabilities: handler.required_capabilities,
    };
  }

  /**
   * Execute a handler (ONLY callable by GovernedExecutor)
   * @internal
   */
  _execute<TReq, TRes>(
    intent: string,
    context: PipelineContext,
    payload: TReq,
    capabilities: CapabilityToken[],
    _executorToken: symbol // Proves caller is GovernedExecutor
  ): Promise<TRes> {
    if (_executorToken !== EXECUTOR_TOKEN) {
      throw new Error('Direct handler execution is forbidden - use GovernedExecutor');
    }
    const handler = this.handlers.get(intent);
    if (!handler) {
      throw new Error(`No handler registered for intent: ${intent}`);
    }
    return handler.handler(context, payload, capabilities) as Promise<TRes>;
  }

  /**
   * List all registered intents
   */
  listIntents(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Private token that only GovernedExecutor can use
const EXECUTOR_TOKEN = Symbol('GOVERNED_EXECUTOR');

// =============================================================================
// Governed Executor
// =============================================================================

/**
 * Configuration for the governed executor
 */
export interface GovernedExecutorConfig {
  governance: GovernanceProvider;
  strict_mode: boolean;
  max_payload_size: number;
  timeout_ms: number;
}

/**
 * The governed pipeline executor - THE ONLY path for request execution
 *
 * This class enforces the ONE_PATH_LAW by:
 * 1. Requiring all 5 stages to execute in order
 * 2. Recording tamper-evident receipts for each stage
 * 3. Managing capability token lifecycle
 * 4. Supporting immediate STOP with token revocation
 */
export class GovernedExecutor {
  private config: GovernedExecutorConfig;
  private registry: HandlerRegistry;

  constructor(config: GovernedExecutorConfig, registry: HandlerRegistry) {
    this.config = config;
    this.registry = registry;
  }

  /**
   * Execute a request through the governed pipeline
   *
   * This is the ONLY way to execute a request in Mathison.
   * All 5 stages MUST pass for a successful response.
   */
  async execute<TReq, TRes>(
    request: PipelineRequest<TReq>
  ): Promise<PipelineResponse<TRes>> {
    const { context, payload } = request;
    const { trace_id } = context;

    // Start execution tracking
    onePathLaw.startExecution(trace_id);

    try {
      // ========================================================================
      // STAGE 1: CIF_INGRESS
      // ========================================================================
      const ingressResult = await this.config.governance.validateIngress(context, payload);

      if (!ingressResult.valid) {
        const error: PipelineError = {
          code: 'CIF_INGRESS_FAILED',
          message: ingressResult.errors?.join('; ') || 'Ingress validation failed',
          stage: 'CIF_INGRESS',
        };
        onePathLaw.recordCifIngress(trace_id, 'FAIL', { errors: ingressResult.errors });
        return this.buildErrorResponse(trace_id, error);
      }

      onePathLaw.recordCifIngress(trace_id, 'PASS', {
        taint_labels: ingressResult.taint_labels,
      });

      // ========================================================================
      // STAGE 2: CDI_ACTION
      // ========================================================================
      const handlerMeta = this.registry.getMetadata(context.intent);
      if (!handlerMeta) {
        const error: PipelineError = {
          code: 'UNKNOWN_INTENT',
          message: `No handler registered for intent: ${context.intent}`,
          stage: 'CDI_ACTION',
        };
        onePathLaw.recordCdiAction(trace_id, 'FAIL', { intent: context.intent });
        return this.buildErrorResponse(trace_id, error);
      }

      const actionResult = await this.config.governance.checkAction(
        context,
        context.intent,
        handlerMeta.risk_class,
        context.requested_capabilities
      );

      if (!actionResult.allowed) {
        const error: PipelineError = {
          code: 'CDI_ACTION_DENIED',
          message: actionResult.reason,
          stage: 'CDI_ACTION',
        };
        onePathLaw.recordCdiAction(trace_id, 'FAIL', { reason: actionResult.reason });
        return this.buildErrorResponse(trace_id, error);
      }

      const capabilities = actionResult.capabilities || [];
      const redactionRules = actionResult.redaction_rules || [];
      const capsuleStatus = this.config.governance.getCapsuleStatus();

      const decisionMeta: DecisionMeta = {
        allowed: true,
        reason: actionResult.reason,
        risk_class: handlerMeta.risk_class,
        capability_tokens: capabilities,
        redaction_rules: redactionRules,
        degradation_level: capsuleStatus.degradation_level,
        decided_at: new Date(),
      };

      onePathLaw.recordCdiAction(trace_id, 'PASS', {
        capabilities: capabilities.map(c => c.token_id),
        degradation_level: capsuleStatus.degradation_level,
      });

      // ========================================================================
      // STAGE 3: HANDLER
      // ========================================================================
      let handlerResponse: TRes;

      try {
        handlerResponse = await this.registry._execute<TReq, TRes>(
          context.intent,
          context,
          ingressResult.sanitized_payload as TReq,
          capabilities,
          EXECUTOR_TOKEN
        );
      } catch (err) {
        const error: PipelineError = {
          code: 'HANDLER_ERROR',
          message: err instanceof Error ? err.message : 'Handler execution failed',
          stage: 'HANDLER',
          details: { error: String(err) },
        };
        onePathLaw.recordHandler(trace_id, 'FAIL', { error: String(err) });
        return this.buildErrorResponse(trace_id, error, decisionMeta);
      }

      onePathLaw.recordHandler(trace_id, 'PASS', {
        handler_id: handlerMeta.id,
      });

      // ========================================================================
      // STAGE 4: CDI_OUTPUT
      // ========================================================================
      const outputResult = await this.config.governance.checkOutput(
        context,
        handlerResponse,
        decisionMeta
      );

      if (!outputResult.valid) {
        const error: PipelineError = {
          code: 'CDI_OUTPUT_DENIED',
          message: outputResult.errors?.join('; ') || 'Output validation failed',
          stage: 'CDI_OUTPUT',
        };
        onePathLaw.recordCdiOutput(trace_id, 'FAIL', { errors: outputResult.errors });
        return this.buildErrorResponse(trace_id, error, decisionMeta);
      }

      onePathLaw.recordCdiOutput(trace_id, 'PASS', {
        redacted: outputResult.redacted_response !== handlerResponse,
      });

      // ========================================================================
      // STAGE 5: CIF_EGRESS
      // ========================================================================
      const egressResult = await this.config.governance.validateEgress(
        context,
        outputResult.redacted_response
      );

      if (!egressResult.valid) {
        const error: PipelineError = {
          code: 'CIF_EGRESS_FAILED',
          message: egressResult.errors?.join('; ') || 'Egress validation failed',
          stage: 'CIF_EGRESS',
        };
        onePathLaw.recordCifEgress(trace_id, 'FAIL', { errors: egressResult.errors });
        return this.buildErrorResponse(trace_id, error, decisionMeta);
      }

      onePathLaw.recordCifEgress(trace_id, 'PASS', {});

      // ========================================================================
      // SUCCESS - Complete the receipt chain
      // ========================================================================
      const receiptChain = onePathLaw.completeExecution(trace_id);

      return {
        success: true,
        data: egressResult.final_response as TRes,
        decision_meta: decisionMeta,
        trace_id,
        receipt_chain: receiptChain,
      };

    } catch (err) {
      // Unexpected error - fail the execution
      const error: PipelineError = {
        code: 'PIPELINE_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected pipeline error',
        stage: 'CIF_INGRESS', // Default to first stage
        details: { error: String(err) },
      };
      onePathLaw.failExecution(trace_id, error);
      return this.buildErrorResponse(trace_id, error);
    }
  }

  /**
   * STOP command - immediately revokes all tokens and fails execution
   */
  stop(trace_id: string, oi_id: string): {
    revoked_tokens: number;
    state: PipelineState;
  } {
    return onePathLaw.stop(trace_id, oi_id);
  }

  /**
   * Build an error response with empty receipt chain
   */
  private buildErrorResponse<T>(
    trace_id: string,
    error: PipelineError,
    decisionMeta?: DecisionMeta
  ): PipelineResponse<T> {
    const state = onePathLaw.getExecution(trace_id);
    const receiptChain: ReceiptChain = {
      trace_id,
      receipts: state?.receipts || [],
      complete: false,
      final_hash: state?.receipts.length
        ? state.receipts[state.receipts.length - 1].hash
        : 'GENESIS',
    };

    return {
      success: false,
      error,
      decision_meta: decisionMeta || this.buildDeniedMeta(error.message),
      trace_id,
      receipt_chain: receiptChain,
    };
  }

  /**
   * Build denied decision metadata
   */
  private buildDeniedMeta(reason: string): DecisionMeta {
    return {
      allowed: false,
      reason,
      risk_class: 'high_risk',
      capability_tokens: [],
      redaction_rules: [],
      degradation_level: 'full',
      decided_at: new Date(),
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a governed executor with configuration
 */
export function createGovernedExecutor(
  governance: GovernanceProvider,
  registry: HandlerRegistry,
  options?: Partial<GovernedExecutorConfig>
): GovernedExecutor {
  const config: GovernedExecutorConfig = {
    governance,
    strict_mode: options?.strict_mode ?? true,
    max_payload_size: options?.max_payload_size ?? 10 * 1024 * 1024,
    timeout_ms: options?.timeout_ms ?? 30000,
  };

  return new GovernedExecutor(config, registry);
}

// =============================================================================
// Context Builder
// =============================================================================

/**
 * Build a pipeline context
 */
export function buildContext(params: {
  principal_id: string;
  oi_id: string;
  intent: string;
  requested_capabilities?: string[];
  origin: RequestOrigin;
  metadata?: Record<string, unknown>;
}): PipelineContext {
  return {
    trace_id: randomUUID(),
    principal_id: params.principal_id,
    oi_id: params.oi_id,
    intent: params.intent,
    requested_capabilities: params.requested_capabilities || [],
    origin: params.origin,
    created_at: new Date(),
    metadata: params.metadata,
  };
}
