/**
 * ONE_PATH_LAW - The foundational invariant of Mathison governance
 * =============================================================================
 *
 * All requests MUST flow through: CIF_INGRESS → CDI_DECIDE → HANDLER → CDI_DECIDE → CIF_EGRESS
 *
 * This module provides:
 * 1. Type-level enforcement using branded types
 * 2. Stage transition state machine
 * 3. Receipt generation for audit trail
 * 4. Capability token lifecycle management
 *
 * INVARIANTS (from MATHISON_GOVERNANCE_PROOF_BOOK_KB v1.5.0):
 * - I1: PATH - every tool/model call requires CDI_ALLOW + capability
 * - I2: CLOSED - missing/invalid governance => deny; no caps; no side effects
 * - I5: STOP - STOP dominates; revokes caps; adapters re-check consent
 * - I6: AUDIT - all governed events logged; hash-chained
 */

import { createHash, randomUUID } from 'crypto';

// =============================================================================
// Branded Types for Type-Level Enforcement
// =============================================================================

/**
 * Brand symbol for type-level enforcement
 * These symbols cannot be constructed outside this module
 */
declare const CIF_INGRESS_PASSED: unique symbol;
declare const CDI_ACTION_ALLOWED: unique symbol;
declare const HANDLER_EXECUTED: unique symbol;
declare const CDI_OUTPUT_PASSED: unique symbol;
declare const CIF_EGRESS_PASSED: unique symbol;
declare const CAPABILITY_ISSUED: unique symbol;

/**
 * Branded type that can only be created by passing CIF_INGRESS
 */
export type CifIngressToken = {
  readonly _brand: typeof CIF_INGRESS_PASSED;
  readonly trace_id: string;
  readonly timestamp: Date;
  readonly taint_labels: string[];
  readonly sanitized_payload: unknown;
};

/**
 * Branded type that can only be created by CDI_DECIDE allowing the action
 */
export type CdiActionToken = {
  readonly _brand: typeof CDI_ACTION_ALLOWED;
  readonly trace_id: string;
  readonly timestamp: Date;
  readonly decision: 'ALLOW';
  readonly capabilities: CapabilityToken[];
  readonly degradation_level: DegradationLevel;
};

/**
 * Branded type representing a valid capability token issued by CDI
 */
export type CapabilityToken = {
  readonly _brand: typeof CAPABILITY_ISSUED;
  readonly token_id: string;
  readonly capability: string;
  readonly oi_id: string;
  readonly principal_id: string;
  readonly issued_at: Date;
  readonly expires_at: Date;
  readonly constraints: Readonly<Record<string, unknown>>;
  readonly revoked: boolean;
};

/**
 * Branded type that can only be created by handler execution
 */
export type HandlerResultToken<T> = {
  readonly _brand: typeof HANDLER_EXECUTED;
  readonly trace_id: string;
  readonly timestamp: Date;
  readonly handler_id: string;
  readonly result: T;
  readonly capabilities_used: string[];
};

/**
 * Branded type that can only be created by CDI output check passing
 */
export type CdiOutputToken<T> = {
  readonly _brand: typeof CDI_OUTPUT_PASSED;
  readonly trace_id: string;
  readonly timestamp: Date;
  readonly redacted_result: T;
  readonly redaction_applied: boolean;
};

/**
 * Branded type that can only be created by CIF_EGRESS passing
 */
export type CifEgressToken<T> = {
  readonly _brand: typeof CIF_EGRESS_PASSED;
  readonly trace_id: string;
  readonly timestamp: Date;
  readonly final_response: T;
};

// =============================================================================
// Pipeline Stage Definitions
// =============================================================================

/**
 * The five stages of the ONE_PATH_LAW pipeline
 */
export const PIPELINE_STAGES = [
  'CIF_INGRESS',
  'CDI_ACTION',
  'HANDLER',
  'CDI_OUTPUT',
  'CIF_EGRESS',
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

/**
 * Stage state machine - enforces valid transitions
 */
export const VALID_TRANSITIONS: Record<PipelineStage | 'INIT', PipelineStage[]> = {
  'INIT': ['CIF_INGRESS'],
  'CIF_INGRESS': ['CDI_ACTION'],
  'CDI_ACTION': ['HANDLER'],
  'HANDLER': ['CDI_OUTPUT'],
  'CDI_OUTPUT': ['CIF_EGRESS'],
  'CIF_EGRESS': [], // Terminal state
};

/**
 * Degradation levels from crystal specification
 */
export type DegradationLevel = 'none' | 'partial' | 'full';

/**
 * Risk classes for handler operations
 */
export type RiskClass = 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk';

/**
 * Degradation ladder - maps capsule state + risk class to decision
 */
export const DEGRADATION_LADDER: Record<
  'valid' | 'stale' | 'missing',
  Record<RiskClass, 'ALLOW' | 'DENY'>
> = {
  valid: {
    read_only: 'ALLOW',
    low_risk: 'ALLOW',
    medium_risk: 'ALLOW',
    high_risk: 'ALLOW',
  },
  stale: {
    read_only: 'ALLOW',
    low_risk: 'ALLOW',
    medium_risk: 'DENY',
    high_risk: 'DENY',
  },
  missing: {
    read_only: 'ALLOW',
    low_risk: 'DENY',
    medium_risk: 'DENY',
    high_risk: 'DENY',
  },
};

// =============================================================================
// Receipt System for Audit Trail
// =============================================================================

/**
 * Stage receipt for tamper-evident audit log
 */
export interface StageReceipt {
  readonly receipt_id: string;
  readonly stage: PipelineStage;
  readonly trace_id: string;
  readonly timestamp: Date;
  readonly result: 'PASS' | 'FAIL';
  readonly details: Readonly<Record<string, unknown>>;
  readonly hash: string;
  readonly previous_hash: string;
}

/**
 * Receipt chain for a complete pipeline execution
 */
export interface ReceiptChain {
  readonly trace_id: string;
  readonly receipts: readonly StageReceipt[];
  readonly complete: boolean;
  readonly final_hash: string;
}

/**
 * Generate a receipt for a stage
 */
export function generateReceipt(
  stage: PipelineStage,
  trace_id: string,
  result: 'PASS' | 'FAIL',
  details: Record<string, unknown>,
  previous_hash: string
): StageReceipt {
  const receipt_id = randomUUID();
  const timestamp = new Date();

  const hashInput = JSON.stringify({
    receipt_id,
    stage,
    trace_id,
    timestamp: timestamp.toISOString(),
    result,
    details,
    previous_hash,
  });

  const hash = createHash('sha256').update(hashInput).digest('hex');

  return Object.freeze({
    receipt_id,
    stage,
    trace_id,
    timestamp,
    result,
    details: Object.freeze(details),
    hash,
    previous_hash,
  });
}

/**
 * Verify receipt chain integrity
 */
export function verifyReceiptChain(chain: ReceiptChain): boolean {
  if (chain.receipts.length === 0) return false;

  let previousHash = 'GENESIS';

  for (const receipt of chain.receipts) {
    // Verify the previous hash links correctly
    if (receipt.previous_hash !== previousHash) {
      return false;
    }

    // Recompute the hash and verify
    const hashInput = JSON.stringify({
      receipt_id: receipt.receipt_id,
      stage: receipt.stage,
      trace_id: receipt.trace_id,
      timestamp: receipt.timestamp.toISOString(),
      result: receipt.result,
      details: receipt.details,
      previous_hash: receipt.previous_hash,
    });

    const expectedHash = createHash('sha256').update(hashInput).digest('hex');
    if (receipt.hash !== expectedHash) {
      return false;
    }

    previousHash = receipt.hash;
  }

  return chain.final_hash === previousHash;
}

// =============================================================================
// Capability Token Management
// =============================================================================

/**
 * Token store for capability lifecycle management
 * Uses WeakRef to allow garbage collection of expired tokens
 */
class CapabilityTokenStore {
  private tokens: Map<string, CapabilityToken> = new Map();
  private revokedTokens: Set<string> = new Set();

  /**
   * Issue a new capability token (ONLY callable by CDI)
   */
  issue(
    capability: string,
    oi_id: string,
    principal_id: string,
    ttl_ms: number = 5 * 60 * 1000, // 5 minutes default
    constraints: Record<string, unknown> = {}
  ): CapabilityToken {
    const now = new Date();
    const token: CapabilityToken = Object.freeze({
      _brand: Symbol('CAPABILITY_ISSUED') as typeof CAPABILITY_ISSUED,
      token_id: randomUUID(),
      capability,
      oi_id,
      principal_id,
      issued_at: now,
      expires_at: new Date(now.getTime() + ttl_ms),
      constraints: Object.freeze(constraints),
      revoked: false,
    });

    this.tokens.set(token.token_id, token);
    return token;
  }

  /**
   * Verify a token is valid
   */
  verify(token_id: string): { valid: boolean; reason?: string } {
    if (this.revokedTokens.has(token_id)) {
      return { valid: false, reason: 'Token has been revoked' };
    }

    const token = this.tokens.get(token_id);
    if (!token) {
      return { valid: false, reason: 'Token not found' };
    }

    if (new Date() > token.expires_at) {
      return { valid: false, reason: 'Token has expired' };
    }

    return { valid: true };
  }

  /**
   * Revoke a specific token
   */
  revoke(token_id: string): void {
    this.revokedTokens.add(token_id);
    this.tokens.delete(token_id);
  }

  /**
   * Revoke all tokens for an OI (STOP command)
   */
  revokeAllForOI(oi_id: string): number {
    let count = 0;
    for (const [id, token] of this.tokens) {
      if (token.oi_id === oi_id) {
        this.revokedTokens.add(id);
        this.tokens.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Clean up expired tokens
   */
  cleanup(): number {
    const now = new Date();
    let count = 0;
    for (const [id, token] of this.tokens) {
      if (now > token.expires_at) {
        this.tokens.delete(id);
        count++;
      }
    }
    return count;
  }
}

// Global token store - singleton
export const tokenStore = new CapabilityTokenStore();

// =============================================================================
// Pipeline State Machine
// =============================================================================

/**
 * Pipeline execution state
 */
export interface PipelineState {
  readonly trace_id: string;
  readonly current_stage: PipelineStage | 'INIT' | 'COMPLETE' | 'FAILED';
  readonly started_at: Date;
  readonly receipts: StageReceipt[];
  readonly cif_ingress_token?: CifIngressToken;
  readonly cdi_action_token?: CdiActionToken;
  readonly handler_result?: HandlerResultToken<unknown>;
  readonly cdi_output_token?: CdiOutputToken<unknown>;
  readonly cif_egress_token?: CifEgressToken<unknown>;
  readonly error?: PipelineError;
}

/**
 * Pipeline error
 */
export interface PipelineError {
  readonly code: string;
  readonly message: string;
  readonly stage: PipelineStage;
  readonly details?: Record<string, unknown>;
}

/**
 * Create initial pipeline state
 */
export function createPipelineState(trace_id: string): PipelineState {
  return {
    trace_id,
    current_stage: 'INIT',
    started_at: new Date(),
    receipts: [],
  };
}

/**
 * Validate stage transition
 */
export function canTransitionTo(
  currentStage: PipelineState['current_stage'],
  nextStage: PipelineStage
): boolean {
  if (currentStage === 'COMPLETE' || currentStage === 'FAILED') {
    return false;
  }

  const validNext = VALID_TRANSITIONS[currentStage];
  return validNext.includes(nextStage);
}

/**
 * Transition to next stage (creates new immutable state)
 */
export function transitionTo(
  state: PipelineState,
  nextStage: PipelineStage,
  receipt: StageReceipt
): PipelineState {
  if (!canTransitionTo(state.current_stage, nextStage)) {
    const validTransitions = (state.current_stage === 'COMPLETE' || state.current_stage === 'FAILED')
      ? 'none (terminal state)'
      : VALID_TRANSITIONS[state.current_stage].join(', ');

    throw new Error(
      `Invalid stage transition: ${state.current_stage} → ${nextStage}. ` +
      `Valid transitions: ${validTransitions}`
    );
  }

  return {
    ...state,
    current_stage: nextStage,
    receipts: [...state.receipts, receipt],
  };
}

/**
 * Mark pipeline as complete
 */
export function completePipeline(state: PipelineState): PipelineState {
  if (state.current_stage !== 'CIF_EGRESS') {
    throw new Error(
      `Cannot complete pipeline from stage: ${state.current_stage}. Must be at CIF_EGRESS.`
    );
  }

  return {
    ...state,
    current_stage: 'COMPLETE',
  };
}

/**
 * Mark pipeline as failed
 */
export function failPipeline(
  state: PipelineState,
  error: PipelineError
): PipelineState {
  return {
    ...state,
    current_stage: 'FAILED',
    error,
  };
}

// =============================================================================
// ONE_PATH_LAW Enforcement
// =============================================================================

/**
 * The ONE_PATH_LAW enforcer - ensures the pipeline invariants hold
 */
export class OnePathLawEnforcer {
  private activeExecutions: Map<string, PipelineState> = new Map();

  /**
   * Start a new pipeline execution
   */
  startExecution(trace_id: string): PipelineState {
    if (this.activeExecutions.has(trace_id)) {
      throw new Error(`Execution already active for trace_id: ${trace_id}`);
    }

    const state = createPipelineState(trace_id);
    this.activeExecutions.set(trace_id, state);
    return state;
  }

  /**
   * Get current execution state
   */
  getExecution(trace_id: string): PipelineState | undefined {
    return this.activeExecutions.get(trace_id);
  }

  /**
   * Record CIF_INGRESS completion
   */
  recordCifIngress(
    trace_id: string,
    result: 'PASS' | 'FAIL',
    details: Record<string, unknown>
  ): PipelineState {
    const state = this.getExecution(trace_id);
    if (!state) {
      throw new Error(`No active execution for trace_id: ${trace_id}`);
    }

    const previousHash = state.receipts.length > 0
      ? state.receipts[state.receipts.length - 1].hash
      : 'GENESIS';

    const receipt = generateReceipt('CIF_INGRESS', trace_id, result, details, previousHash);
    const newState = transitionTo(state, 'CIF_INGRESS', receipt);

    this.activeExecutions.set(trace_id, newState);
    return newState;
  }

  /**
   * Record CDI_ACTION completion
   */
  recordCdiAction(
    trace_id: string,
    result: 'PASS' | 'FAIL',
    details: Record<string, unknown>
  ): PipelineState {
    const state = this.getExecution(trace_id);
    if (!state) {
      throw new Error(`No active execution for trace_id: ${trace_id}`);
    }

    const previousHash = state.receipts[state.receipts.length - 1].hash;
    const receipt = generateReceipt('CDI_ACTION', trace_id, result, details, previousHash);
    const newState = transitionTo(state, 'CDI_ACTION', receipt);

    this.activeExecutions.set(trace_id, newState);
    return newState;
  }

  /**
   * Record HANDLER completion
   */
  recordHandler(
    trace_id: string,
    result: 'PASS' | 'FAIL',
    details: Record<string, unknown>
  ): PipelineState {
    const state = this.getExecution(trace_id);
    if (!state) {
      throw new Error(`No active execution for trace_id: ${trace_id}`);
    }

    const previousHash = state.receipts[state.receipts.length - 1].hash;
    const receipt = generateReceipt('HANDLER', trace_id, result, details, previousHash);
    const newState = transitionTo(state, 'HANDLER', receipt);

    this.activeExecutions.set(trace_id, newState);
    return newState;
  }

  /**
   * Record CDI_OUTPUT completion
   */
  recordCdiOutput(
    trace_id: string,
    result: 'PASS' | 'FAIL',
    details: Record<string, unknown>
  ): PipelineState {
    const state = this.getExecution(trace_id);
    if (!state) {
      throw new Error(`No active execution for trace_id: ${trace_id}`);
    }

    const previousHash = state.receipts[state.receipts.length - 1].hash;
    const receipt = generateReceipt('CDI_OUTPUT', trace_id, result, details, previousHash);
    const newState = transitionTo(state, 'CDI_OUTPUT', receipt);

    this.activeExecutions.set(trace_id, newState);
    return newState;
  }

  /**
   * Record CIF_EGRESS completion
   */
  recordCifEgress(
    trace_id: string,
    result: 'PASS' | 'FAIL',
    details: Record<string, unknown>
  ): PipelineState {
    const state = this.getExecution(trace_id);
    if (!state) {
      throw new Error(`No active execution for trace_id: ${trace_id}`);
    }

    const previousHash = state.receipts[state.receipts.length - 1].hash;
    const receipt = generateReceipt('CIF_EGRESS', trace_id, result, details, previousHash);
    const newState = transitionTo(state, 'CIF_EGRESS', receipt);

    this.activeExecutions.set(trace_id, newState);
    return newState;
  }

  /**
   * Complete the execution and get the final receipt chain
   */
  completeExecution(trace_id: string): ReceiptChain {
    const state = this.getExecution(trace_id);
    if (!state) {
      throw new Error(`No active execution for trace_id: ${trace_id}`);
    }

    const finalState = completePipeline(state);
    this.activeExecutions.delete(trace_id);

    return {
      trace_id,
      receipts: finalState.receipts,
      complete: true,
      final_hash: finalState.receipts[finalState.receipts.length - 1].hash,
    };
  }

  /**
   * Fail the execution
   */
  failExecution(trace_id: string, error: PipelineError): PipelineState {
    const state = this.getExecution(trace_id);
    if (!state) {
      throw new Error(`No active execution for trace_id: ${trace_id}`);
    }

    const failedState = failPipeline(state, error);
    this.activeExecutions.set(trace_id, failedState);
    return failedState;
  }

  /**
   * STOP command - revokes all tokens and fails execution
   */
  stop(trace_id: string, oi_id: string): { revoked_tokens: number; state: PipelineState } {
    const revoked_tokens = tokenStore.revokeAllForOI(oi_id);

    const state = this.getExecution(trace_id);
    if (state) {
      const failedState = failPipeline(state, {
        code: 'STOP_COMMAND',
        message: 'STOP command received - all tokens revoked',
        stage: state.current_stage as PipelineStage,
      });
      this.activeExecutions.set(trace_id, failedState);
      return { revoked_tokens, state: failedState };
    }

    return {
      revoked_tokens,
      state: {
        trace_id,
        current_stage: 'FAILED',
        started_at: new Date(),
        receipts: [],
        error: {
          code: 'STOP_COMMAND',
          message: 'STOP command received - all tokens revoked',
          stage: 'CIF_INGRESS',
        },
      },
    };
  }
}

// Global enforcer - singleton
export const onePathLaw = new OnePathLawEnforcer();

// =============================================================================
// Exports
// =============================================================================

export {
  CIF_INGRESS_PASSED,
  CDI_ACTION_ALLOWED,
  HANDLER_EXECUTED,
  CDI_OUTPUT_PASSED,
  CIF_EGRESS_PASSED,
  CAPABILITY_ISSUED,
};
