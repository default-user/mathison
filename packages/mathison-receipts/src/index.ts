/**
 * Event Log (Receipts) System
 * Append-only log of all job actions with governance decisions
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

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
  private logPath: string;

  constructor(logPath: string = '.mathison/eventlog.jsonl') {
    this.logPath = logPath;
  }

  async initialize(): Promise<void> {
    const logDir = path.dirname(this.logPath);
    await fs.mkdir(logDir, { recursive: true });

    // Create file if it doesn't exist
    try {
      await fs.access(this.logPath);
    } catch {
      await fs.writeFile(this.logPath, '', 'utf-8');
    }
  }

  /**
   * Append a receipt to the event log
   */
  async append(receipt: Omit<Receipt, 'timestamp'>): Promise<void> {
    const fullReceipt = {
      timestamp: new Date().toISOString(),
      ...receipt
    } as Receipt;

    const line = JSON.stringify(fullReceipt) + '\n';

    // Append-only: use 'a' flag
    await fs.appendFile(this.logPath, line, 'utf-8');
  }

  /**
   * Read all receipts from the log
   */
  async readAll(): Promise<Receipt[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      return lines.map(line => JSON.parse(line) as Receipt);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read receipts for a specific job
   */
  async readByJob(jobId: string): Promise<Receipt[]> {
    const all = await this.readAll();
    return all.filter(r => r.job_id === jobId);
  }

  /**
   * Get the latest receipt for a job
   */
  async getLatest(jobId: string): Promise<Receipt | null> {
    const receipts = await this.readByJob(jobId);
    return receipts.length > 0 ? receipts[receipts.length - 1] : null;
  }

  /**
   * Hash content for receipts
   */
  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
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
