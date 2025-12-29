/**
 * Event Log (Receipts) System
 * Append-only log of all job actions with governance decisions
 * P2-B.3: Uses ReceiptStore interface (no direct filesystem access)
 */

import { ReceiptStore, Receipt as StorageReceipt } from 'mathison-storage';

export interface Receipt {
  timestamp: string;
  job_id: string;
  stage: string;
  action: string;
  inputs_hash?: string;
  outputs_hash?: string;
  decision?: 'ALLOW' | 'DENY' | 'TRANSFORM';
  policy_id?: string;
  notes?: string;
  [key: string]: unknown;
}

export class EventLog {
  private store: ReceiptStore;

  constructor(store: ReceiptStore) {
    this.store = store;
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  /**
   * Convert storage receipt to local format
   */
  private fromStorage(storageReceipt: StorageReceipt): Receipt {
    return {
      timestamp: new Date(storageReceipt.timestamp).toISOString(),
      job_id: storageReceipt.job_id,
      stage: storageReceipt.stage,
      action: storageReceipt.action,
      inputs_hash: storageReceipt.inputs_hash,
      outputs_hash: storageReceipt.outputs_hash,
      decision: storageReceipt.verdict ? storageReceipt.verdict.toUpperCase() as 'ALLOW' | 'DENY' : undefined,
      policy_id: storageReceipt.policy_id,
      notes: storageReceipt.notes
    };
  }

  /**
   * Convert local receipt to storage format
   */
  private toStorage(receipt: Omit<Receipt, 'timestamp'>): StorageReceipt {
    let verdict: 'allow' | 'deny' | undefined;
    if (receipt.decision === 'ALLOW') {
      verdict = 'allow';
    } else if (receipt.decision === 'DENY') {
      verdict = 'deny';
    }

    return {
      job_id: receipt.job_id as string,
      stage: receipt.stage as string,
      action: receipt.action as string,
      timestamp: Date.now(),
      inputs_hash: receipt.inputs_hash as string | undefined,
      outputs_hash: receipt.outputs_hash as string | undefined,
      verdict,
      policy_id: receipt.policy_id as string | undefined,
      notes: receipt.notes as string | undefined,
      reason: receipt.notes as string | undefined  // Map notes to reason for compatibility
    };
  }

  /**
   * Append a receipt to the event log
   */
  async append(receipt: Omit<Receipt, 'timestamp'>): Promise<void> {
    const storageReceipt = this.toStorage(receipt);
    await this.store.append(storageReceipt);
  }

  /**
   * Read all receipts from the log
   */
  async readAll(): Promise<Receipt[]> {
    const storageReceipts = await this.store.listAll();
    return storageReceipts.map((sr: StorageReceipt) => this.fromStorage(sr));
  }

  /**
   * Read receipts for a specific job
   */
  async readByJob(jobId: string): Promise<Receipt[]> {
    const storageReceipts = await this.store.queryByJobId(jobId);
    return storageReceipts.map((sr: StorageReceipt) => this.fromStorage(sr));
  }

  /**
   * Get the latest receipt for a job
   */
  async getLatest(jobId: string): Promise<Receipt | null> {
    const storageReceipt = await this.store.latest(jobId);
    return storageReceipt ? this.fromStorage(storageReceipt) : null;
  }

  /**
   * Hash content for receipts (delegate to store)
   */
  hashContent(content: string): string {
    // Simple SHA-256 hash, same logic as stores
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Log a stage start
   */
  async logStageStart(jobId: string, stage: string, inputsHash?: string): Promise<void> {
    await this.append({
      job_id: jobId,
      stage,
      action: 'STAGE_START',
      inputs_hash: inputsHash,
      notes: `Starting stage: ${stage}`
    });
  }

  /**
   * Log a stage completion
   */
  async logStageComplete(jobId: string, stage: string, outputsHash?: string): Promise<void> {
    await this.append({
      job_id: jobId,
      stage,
      action: 'STAGE_COMPLETE',
      outputs_hash: outputsHash,
      notes: `Completed stage: ${stage}`
    });
  }

  /**
   * Log a governance decision
   */
  async logGovernanceDecision(
    jobId: string,
    stage: string,
    decision: 'ALLOW' | 'DENY' | 'TRANSFORM',
    policyId: string,
    notes?: string
  ): Promise<void> {
    await this.append({
      job_id: jobId,
      stage,
      action: 'GOVERNANCE_CHECK',
      decision,
      policy_id: policyId,
      notes
    });
  }

  /**
   * Log an error
   */
  async logError(jobId: string, stage: string, error: string): Promise<void> {
    await this.append({
      job_id: jobId,
      stage,
      action: 'ERROR',
      notes: error
    });
  }
}

export default EventLog;
