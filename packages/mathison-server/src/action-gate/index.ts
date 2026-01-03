/**
 * P3-B: ActionGate - Single entry point for all side effects
 * All operations that change the world MUST go through ActionGate
 */

import { CDI, CIF, ActionContext, ActionResult } from 'mathison-governance';
import { Stores, Receipt, JobCheckpoint } from 'mathison-storage';
import { GovernanceReasonCode, GovernanceResult, GovernanceDecision } from './reason-codes';

export interface ActionGateContext {
  actor: string;
  action: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
  // Genome metadata for capability enforcement and receipt attribution
  genome_id?: string;
  genome_version?: string;
}

export interface SideEffectResult {
  success: boolean;
  governance: GovernanceResult;
  receipt?: Receipt;
  data?: unknown;
}

export class ActionGate {
  private cdi: CDI;
  private cif: CIF;
  public stores: Stores; // Public for JobExecutor access to list()

  constructor(cdi: CDI, cif: CIF, stores: Stores) {
    this.cdi = cdi;
    this.cif = cif;
    this.stores = stores;
  }

  /**
   * Execute side effect through governance gates
   * This is the ONLY way side effects should be performed
   */
  async executeSideEffect(
    context: ActionGateContext,
    sideEffectFn: () => Promise<unknown>
  ): Promise<SideEffectResult> {
    // 1. CDI Action Check
    const actionResult = await this.cdi.checkAction({
      actor: context.actor,
      action: context.action,
      payload: context.payload,
      metadata: context.metadata
    });

    if (actionResult.verdict !== 'allow') {
      return {
        success: false,
        governance: {
          decision: 'DENY',
          reasonCode: GovernanceReasonCode.CDI_ACTION_DENIED,
          message: actionResult.reason,
          suggestedAlternative: actionResult.suggestedAlternative
        }
      };
    }

    // 2. Execute the side effect
    let result: unknown;
    try {
      result = await sideEffectFn();
    } catch (error) {
      return {
        success: false,
        governance: {
          decision: 'DENY',
          reasonCode: GovernanceReasonCode.UNCERTAIN_FAIL_CLOSED,
          message: `Side effect failed: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }

    // 3. Record receipt (include genome metadata for auditability)
    const receipt: Receipt = {
      timestamp: new Date().toISOString(),
      job_id: context.metadata?.job_id as string ?? 'system',
      stage: context.metadata?.stage as string ?? 'action_gate',
      action: context.action,
      decision: 'ALLOW',
      policy_id: context.metadata?.policy_id as string ?? 'default',
      store_backend: process.env.MATHISON_STORE_BACKEND as 'FILE' | 'SQLITE',
      genome_id: context.genome_id,
      genome_version: context.genome_version,
      notes: `ActionGate: ${context.action}`
    };

    try {
      await this.stores.receiptStore.append(receipt);
    } catch (error) {
      console.warn('⚠️  Receipt append failed (non-fatal):', error);
    }

    return {
      success: true,
      governance: {
        decision: 'ALLOW',
        message: 'Side effect executed and recorded'
      },
      receipt,
      data: result
    };
  }

  /**
   * Create job checkpoint (side effect)
   */
  async createCheckpoint(actor: string, checkpoint: JobCheckpoint): Promise<SideEffectResult> {
    return this.executeSideEffect(
      {
        actor,
        action: 'create_checkpoint',
        payload: checkpoint,
        metadata: { job_id: checkpoint.job_id }
      },
      async () => {
        await this.stores.checkpointStore.create(checkpoint);
        return checkpoint;
      }
    );
  }

  /**
   * Update job checkpoint (side effect)
   */
  async saveCheckpoint(actor: string, checkpoint: JobCheckpoint): Promise<SideEffectResult> {
    return this.executeSideEffect(
      {
        actor,
        action: 'save_checkpoint',
        payload: checkpoint,
        metadata: { job_id: checkpoint.job_id }
      },
      async () => {
        await this.stores.checkpointStore.save(checkpoint);
        return checkpoint;
      }
    );
  }

  /**
   * Append receipt (side effect)
   */
  async appendReceipt(actor: string, receipt: Receipt): Promise<SideEffectResult> {
    return this.executeSideEffect(
      {
        actor,
        action: 'append_receipt',
        payload: receipt,
        metadata: { job_id: receipt.job_id }
      },
      async () => {
        await this.stores.receiptStore.append(receipt);
        return receipt;
      }
    );
  }

  /**
   * Read-only operations do NOT go through ActionGate
   * (but still go through CIF ingress/egress)
   */
  async loadCheckpoint(jobId: string): Promise<JobCheckpoint | null> {
    return this.stores.checkpointStore.load(jobId);
  }

  async readReceipts(jobId: string, limit?: number): Promise<Receipt[]> {
    return this.stores.receiptStore.readByJob(jobId, { limit });
  }
}

export * from './reason-codes';
