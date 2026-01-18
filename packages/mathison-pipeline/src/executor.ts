/**
 * Mathison v2.1 Pipeline Executor
 *
 * Implements the unified governed request pipeline:
 * CIF ingress → CDI action check → handler → CDI output check → CIF egress
 *
 * INVARIANT: Every request MUST flow through this pipeline.
 * INVARIANT: Fail-closed is mandatory - missing/invalid governance = deny.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  PipelineContext,
  PipelineRequest,
  PipelineResponse,
  PipelineError,
  PipelineStage,
  PipelineHandler,
  RegisteredHandler,
  DecisionMeta,
  CapabilityToken,
  GovernanceProvider,
  GovernanceCapsuleStatus,
  RequestOrigin,
  StageResult,
} from './types';

// ============================================================================
// Pipeline Configuration
// ============================================================================

export interface PipelineConfig {
  /** Governance provider for CIF/CDI checks */
  governance: GovernanceProvider;
  /** Whether to enforce strict mode (fail on any validation issue) */
  strict_mode: boolean;
  /** Maximum request payload size in bytes */
  max_payload_size: number;
  /** Request timeout in milliseconds */
  timeout_ms: number;
}

// ============================================================================
// Handler Registry
// ============================================================================

/**
 * Registry for pipeline handlers
 * Handlers MUST be registered to be callable - no direct handler execution
 */
export class HandlerRegistry {
  private handlers: Map<string, RegisteredHandler> = new Map();

  /**
   * Register a handler for an intent
   */
  register<TReq, TRes>(handler: RegisteredHandler<TReq, TRes>): void {
    if (this.handlers.has(handler.intent)) {
      throw new Error(`Handler already registered for intent: ${handler.intent}`);
    }
    this.handlers.set(handler.intent, handler as RegisteredHandler);
  }

  /**
   * Get a handler by intent
   */
  get(intent: string): RegisteredHandler | undefined {
    return this.handlers.get(intent);
  }

  /**
   * Check if a handler exists for an intent
   */
  has(intent: string): boolean {
    return this.handlers.has(intent);
  }

  /**
   * List all registered intents
   */
  listIntents(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ============================================================================
// Context Builder
// ============================================================================

/**
 * Build a normalized pipeline context from request data
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
    trace_id: uuidv4(),
    principal_id: params.principal_id,
    oi_id: params.oi_id,
    intent: params.intent,
    requested_capabilities: params.requested_capabilities || [],
    origin: params.origin,
    created_at: new Date(),
    metadata: params.metadata,
  };
}

// ============================================================================
// Pipeline Executor
// ============================================================================

/**
 * The unified governed request pipeline executor.
 *
 * This is the ONE path for all request execution in Mathison v2.1.
 * HTTP, gRPC, CLI, and worker entrypoints MUST use this executor.
 */
export class PipelineExecutor {
  private config: PipelineConfig;
  private registry: HandlerRegistry;

  constructor(config: PipelineConfig, registry: HandlerRegistry) {
    this.config = config;
    this.registry = registry;
  }

  /**
   * Execute a request through the governed pipeline.
   *
   * Stages:
   * 1. Context normalization - validate and normalize the context
   * 2. CIF ingress - validate request schema, size limits, taint rules
   * 3. CDI action check - verify permissions, issue capability tokens
   * 4. Handler execution - execute the handler (only if allowed)
   * 5. CDI output check - validate response against constraints
   * 6. CIF egress - apply redactions, package response
   */
  async execute<TReq, TRes>(
    request: PipelineRequest<TReq>
  ): Promise<PipelineResponse<TRes>> {
    const startTime = Date.now();
    const { context, payload } = request;

    // Track execution for auditing
    const executionLog: { stage: PipelineStage; result: StageResult; timestamp: Date }[] = [];

    const logStage = (stage: PipelineStage, result: StageResult) => {
      executionLog.push({ stage, result, timestamp: new Date() });
    };

    // --------------------------------------------------------------------------
    // Stage 1: Context Normalization
    // --------------------------------------------------------------------------
    const contextResult = await this.normalizeContext(context);
    logStage('context_normalization', contextResult);

    if (!contextResult.passed) {
      return this.buildErrorResponse(context.trace_id, contextResult.error!);
    }

    // --------------------------------------------------------------------------
    // Stage 2: CIF Ingress
    // --------------------------------------------------------------------------
    const cifIngressResult = await this.config.governance.validateCifIngress(context, payload);
    logStage('cif_ingress', cifIngressResult);

    if (!cifIngressResult.passed) {
      return this.buildErrorResponse(context.trace_id, cifIngressResult.error!);
    }

    // --------------------------------------------------------------------------
    // Stage 3: CDI Action Check
    // --------------------------------------------------------------------------
    const handler = this.registry.get(context.intent);
    if (!handler) {
      return this.buildErrorResponse(context.trace_id, {
        code: 'UNKNOWN_INTENT',
        message: `No handler registered for intent: ${context.intent}`,
        stage: 'cdi_action_check',
      });
    }

    const cdiActionResult = await this.config.governance.checkCdiAction(
      context,
      context.intent,
      handler.risk_class,
      context.requested_capabilities
    );
    logStage('cdi_action_check', cdiActionResult);

    if (!cdiActionResult.passed) {
      return this.buildErrorResponse(context.trace_id, cdiActionResult.error!);
    }

    const decisionMeta = cdiActionResult.data!;

    if (!decisionMeta.allowed) {
      return this.buildDeniedResponse(context.trace_id, decisionMeta);
    }

    // --------------------------------------------------------------------------
    // Stage 4: Handler Execution
    // --------------------------------------------------------------------------
    let handlerResponse: TRes;
    const handlerStartTime = Date.now();

    try {
      handlerResponse = await handler.handler(
        context,
        payload,
        decisionMeta.capability_tokens
      ) as TRes;
    } catch (error) {
      const handlerError: PipelineError = {
        code: 'HANDLER_ERROR',
        message: error instanceof Error ? error.message : 'Handler execution failed',
        stage: 'handler_execution',
        details: { error: String(error) },
      };
      logStage('handler_execution', {
        passed: false,
        error: handlerError,
        duration_ms: Date.now() - handlerStartTime,
      });
      return this.buildErrorResponse(context.trace_id, handlerError);
    }

    logStage('handler_execution', {
      passed: true,
      duration_ms: Date.now() - handlerStartTime,
    });

    // --------------------------------------------------------------------------
    // Stage 5: CDI Output Check
    // --------------------------------------------------------------------------
    const cdiOutputResult = await this.config.governance.checkCdiOutput(
      context,
      handlerResponse,
      decisionMeta
    );
    logStage('cdi_output_check', cdiOutputResult);

    if (!cdiOutputResult.passed) {
      return this.buildErrorResponse(context.trace_id, cdiOutputResult.error!);
    }

    const { redacted_response } = cdiOutputResult.data!;

    // --------------------------------------------------------------------------
    // Stage 6: CIF Egress
    // --------------------------------------------------------------------------
    const cifEgressResult = await this.config.governance.validateCifEgress(
      context,
      redacted_response
    );
    logStage('cif_egress', cifEgressResult);

    if (!cifEgressResult.passed) {
      return this.buildErrorResponse(context.trace_id, cifEgressResult.error!);
    }

    // --------------------------------------------------------------------------
    // Success Response
    // --------------------------------------------------------------------------
    return {
      success: true,
      data: redacted_response as TRes,
      decision_meta: decisionMeta,
      trace_id: context.trace_id,
    };
  }

  /**
   * Normalize and validate the pipeline context
   */
  private async normalizeContext(context: PipelineContext): Promise<StageResult> {
    const startTime = Date.now();

    // Validate required fields
    if (!context.trace_id) {
      return {
        passed: false,
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Missing trace_id in context',
          stage: 'context_normalization',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    if (!context.principal_id) {
      return {
        passed: false,
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Missing principal_id in context',
          stage: 'context_normalization',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    if (!context.oi_id) {
      return {
        passed: false,
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Missing oi_id in context',
          stage: 'context_normalization',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    if (!context.intent) {
      return {
        passed: false,
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Missing intent in context',
          stage: 'context_normalization',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    if (!context.origin) {
      return {
        passed: false,
        error: {
          code: 'INVALID_CONTEXT',
          message: 'Missing origin in context',
          stage: 'context_normalization',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Build an error response
   */
  private buildErrorResponse<T>(
    trace_id: string,
    error: PipelineError
  ): PipelineResponse<T> {
    return {
      success: false,
      error,
      decision_meta: this.buildDeniedDecisionMeta(error.message),
      trace_id,
    };
  }

  /**
   * Build a denied response (CDI denied the action)
   */
  private buildDeniedResponse<T>(
    trace_id: string,
    decisionMeta: DecisionMeta
  ): PipelineResponse<T> {
    return {
      success: false,
      error: {
        code: 'ACTION_DENIED',
        message: decisionMeta.reason,
        stage: 'cdi_action_check',
      },
      decision_meta: decisionMeta,
      trace_id,
    };
  }

  /**
   * Build a denied decision meta for error responses
   */
  private buildDeniedDecisionMeta(reason: string): DecisionMeta {
    return {
      allowed: false,
      reason,
      risk_class: 'high_risk',
      capability_tokens: [],
      redaction_rules: [],
      required_confirmation: false,
      decided_at: new Date(),
    };
  }

  /**
   * Get governance capsule status
   */
  getCapsuleStatus(): GovernanceCapsuleStatus {
    return this.config.governance.getCapsuleStatus();
  }
}

// ============================================================================
// Pipeline Factory
// ============================================================================

/**
 * Create a pipeline executor with default configuration
 */
export function createPipeline(
  governance: GovernanceProvider,
  registry: HandlerRegistry,
  options?: Partial<PipelineConfig>
): PipelineExecutor {
  const config: PipelineConfig = {
    governance,
    strict_mode: options?.strict_mode ?? true,
    max_payload_size: options?.max_payload_size ?? 10 * 1024 * 1024, // 10MB
    timeout_ms: options?.timeout_ms ?? 30000, // 30s
  };

  return new PipelineExecutor(config, registry);
}
