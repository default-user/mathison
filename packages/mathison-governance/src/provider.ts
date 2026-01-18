/**
 * Mathison v2.1 Governance Provider
 *
 * Implements the GovernanceProvider interface for integration with the pipeline.
 * This is the bridge between the pipeline executor and the governance modules.
 */

import { v4 as uuidv4 } from 'uuid';
import { GovernanceCapsuleLoader, CapsuleLoaderConfig, createCapsuleLoader } from './capsule';
import { CdiActionChecker, CdiOutputChecker } from './cdi';
import { validateCifIngress, validateCifEgress, checkTaint } from './cif';
import { CapsuleStatus, CdiContext, CapabilityTokenData, RedactionRuleData } from './types';

// ============================================================================
// Pipeline Integration Types (matching @mathison/pipeline)
// ============================================================================

interface PipelineContext {
  trace_id: string;
  principal_id: string;
  oi_id: string;
  intent: string;
  requested_capabilities: string[];
  origin: {
    source: 'http' | 'grpc' | 'cli' | 'worker';
    labels: string[];
    purpose: string;
    client_id?: string;
  };
  created_at: Date;
  metadata?: Record<string, unknown>;
}

interface StageResult<T = unknown> {
  passed: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    stage: string;
  };
  duration_ms: number;
}

interface DecisionMeta {
  allowed: boolean;
  reason: string;
  risk_class: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk';
  capability_tokens: CapabilityTokenData[];
  redaction_rules: RedactionRuleData[];
  tool_limits?: Record<string, number>;
  required_confirmation: boolean;
  decided_at: Date;
}

interface GovernanceCapsuleStatus {
  valid: boolean;
  capsule_id?: string;
  expires_at?: Date;
  stale: boolean;
  degradation_level: 'none' | 'partial' | 'full';
}

// ============================================================================
// Governance Provider Implementation
// ============================================================================

/**
 * Governance provider that implements the pipeline's GovernanceProvider interface.
 */
export class GovernanceProviderImpl {
  private capsuleLoader: GovernanceCapsuleLoader;
  private actionChecker: CdiActionChecker;
  private outputChecker: CdiOutputChecker;
  private initialized: boolean = false;

  constructor(config?: Partial<CapsuleLoaderConfig>) {
    this.capsuleLoader = createCapsuleLoader(config);
    this.actionChecker = new CdiActionChecker(this.capsuleLoader);
    this.outputChecker = new CdiOutputChecker(this.capsuleLoader);
  }

  /**
   * Initialize the governance provider
   */
  async initialize(authorityPath: string, capsulePath: string): Promise<void> {
    await this.capsuleLoader.loadAuthority(authorityPath);
    await this.capsuleLoader.loadCapsule(capsulePath);
    this.initialized = true;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get capsule loader for direct access
   */
  getCapsuleLoader(): GovernanceCapsuleLoader {
    return this.capsuleLoader;
  }

  /**
   * Get current capsule status (implements GovernanceProvider interface)
   */
  getCapsuleStatus(): GovernanceCapsuleStatus {
    const status = this.capsuleLoader.getStatus();
    return {
      valid: status.valid,
      capsule_id: status.capsule_id,
      expires_at: status.expires_at,
      stale: status.stale,
      degradation_level: status.degradation_level,
    };
  }

  /**
   * Validate CIF ingress (implements GovernanceProvider interface)
   */
  async validateCifIngress(
    context: PipelineContext,
    payload: unknown
  ): Promise<StageResult> {
    const startTime = Date.now();

    // Validate context and payload
    const result = validateCifIngress(
      {
        trace_id: context.trace_id,
        principal_id: context.principal_id,
        oi_id: context.oi_id,
        intent: context.intent,
      },
      payload
    );

    if (!result.valid) {
      return {
        passed: false,
        error: {
          code: 'CIF_VALIDATION_FAILED',
          message: result.errors?.join('; ') || 'CIF validation failed',
          stage: 'cif_ingress',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    // Check for tainted data
    const taintResult = checkTaint(payload);
    if (taintResult.blocking) {
      return {
        passed: false,
        error: {
          code: 'TAINT_DETECTED',
          message: `Blocked taint detected: ${taintResult.reasons.join('; ')}`,
          stage: 'cif_ingress',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      data: {
        validated_payload: payload,
        taint_labels: taintResult.labels,
      },
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Check CDI action permission (implements GovernanceProvider interface)
   */
  async checkCdiAction(
    context: PipelineContext,
    intent: string,
    riskClass: string,
    requestedCapabilities: string[]
  ): Promise<StageResult<DecisionMeta>> {
    const startTime = Date.now();

    // Build CDI context
    const cdiContext: CdiContext = {
      source_namespace_id: context.oi_id,
      target_namespace_id: (context.metadata?.target_namespace_id as string) || undefined,
      actor_id: context.principal_id,
      metadata: context.metadata,
    };

    // Check action permission
    const decision = await this.actionChecker.checkAction(
      intent,
      cdiContext,
      riskClass as 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk',
      requestedCapabilities
    );

    const decisionMeta: DecisionMeta = {
      allowed: decision.allowed,
      reason: decision.reason,
      risk_class: riskClass as 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk',
      capability_tokens: (decision.capability_tokens || []).map((t) => ({
        token_id: t.token_id,
        capability: t.capability,
        oi_id: t.oi_id,
        principal_id: t.principal_id,
        expires_at: t.expires_at,
        constraints: t.constraints,
      })),
      redaction_rules: decision.redaction_rules || [],
      tool_limits: decision.tool_limits,
      required_confirmation: decision.requires_confirmation || false,
      decided_at: new Date(),
    };

    if (!decision.allowed) {
      return {
        passed: false,
        data: decisionMeta,
        error: {
          code: 'ACTION_DENIED',
          message: decision.reason,
          stage: 'cdi_action_check',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      data: decisionMeta,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Check CDI output constraints (implements GovernanceProvider interface)
   */
  async checkCdiOutput(
    context: PipelineContext,
    response: unknown,
    decisionMeta: DecisionMeta
  ): Promise<StageResult<{ redacted_response: unknown; applied_rules: RedactionRuleData[] }>> {
    const startTime = Date.now();

    // Build CDI context
    const cdiContext: CdiContext = {
      source_namespace_id: context.oi_id,
      target_namespace_id: (context.metadata?.target_namespace_id as string) || undefined,
      actor_id: context.principal_id,
      metadata: context.metadata,
    };

    // Check output
    const result = await this.outputChecker.checkOutput(
      cdiContext,
      response,
      decisionMeta.capability_tokens
    );

    if (!result.allowed) {
      return {
        passed: false,
        error: {
          code: 'OUTPUT_VALIDATION_FAILED',
          message: result.reason,
          stage: 'cdi_output_check',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      data: {
        redacted_response: result.redacted_response,
        applied_rules: result.applied_rules,
      },
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Validate CIF egress (implements GovernanceProvider interface)
   */
  async validateCifEgress(
    context: PipelineContext,
    response: unknown
  ): Promise<StageResult> {
    const startTime = Date.now();

    // Validate response
    const result = validateCifEgress(
      {
        trace_id: context.trace_id,
        oi_id: context.oi_id,
      },
      response
    );

    if (!result.valid) {
      return {
        passed: false,
        error: {
          code: 'CIF_EGRESS_FAILED',
          message: result.errors?.join('; ') || 'CIF egress validation failed',
          stage: 'cif_egress',
        },
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      passed: true,
      duration_ms: Date.now() - startTime,
    };
  }
}

/**
 * Create a governance provider with default configuration
 */
export function createGovernanceProvider(
  config?: Partial<CapsuleLoaderConfig>
): GovernanceProviderImpl {
  return new GovernanceProviderImpl(config);
}
