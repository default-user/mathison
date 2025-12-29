/**
 * FileStore - Filesystem-based storage adapter
 *
 * Wraps current filesystem operations (JSON checkpoints, JSONL receipts)
 * Implements CheckpointStore and ReceiptStore interfaces
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CheckpointStore, ReceiptStore, JobCheckpoint, Receipt } from './interfaces';

export interface FileStoreConfig {
  checkpointDir?: string;
  eventLogPath?: string;
}

/**
 * FileCheckpointStore - JSON-based checkpoint storage
 */
export class FileCheckpointStore implements CheckpointStore {
  private checkpointDir: string;

  constructor(config: FileStoreConfig = {}) {
    this.checkpointDir = config.checkpointDir || '.mathison/checkpoints';
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.checkpointDir, { recursive: true });
  }

  async shutdown(): Promise<void> {
    // No-op for file store
  }

  async createCheckpoint(jobId: string, jobType: string, inputs: Record<string, unknown>): Promise<JobCheckpoint> {
    const checkpoint: JobCheckpoint = {
      job_id: jobId,
      job_type: jobType,
      status: 'RUNNING',
      current_stage: 'LOAD',
      inputs,
      stage_outputs: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const checkpointPath = path.join(this.checkpointDir, `${jobId}.json`);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
    return checkpoint;
  }

  async loadCheckpoint(jobId: string): Promise<JobCheckpoint | null> {
    const checkpointPath = path.join(this.checkpointDir, `${jobId}.json`);

    try {
      const content = await fs.readFile(checkpointPath, 'utf-8');
      return JSON.parse(content) as JobCheckpoint;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async updateStage(jobId: string, stage: string, result: { success: boolean; outputs?: unknown; error?: string }): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job ${jobId}`);
    }

    checkpoint.current_stage = stage;
    checkpoint.stage_outputs[stage] = result.outputs || {};
    checkpoint.updated_at = new Date().toISOString();

    if (!result.success && result.error) {
      checkpoint.error = result.error;
    }

    const checkpointPath = path.join(this.checkpointDir, `${jobId}.json`);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  async markResumableFailure(jobId: string, error: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job ${jobId}`);
    }

    checkpoint.status = 'RESUMABLE_FAILURE';
    checkpoint.error = error;
    checkpoint.updated_at = new Date().toISOString();

    const checkpointPath = path.join(this.checkpointDir, `${jobId}.json`);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  async markComplete(jobId: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job ${jobId}`);
    }

    checkpoint.status = 'DONE';
    checkpoint.updated_at = new Date().toISOString();

    const checkpointPath = path.join(this.checkpointDir, `${jobId}.json`);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  async markFailed(jobId: string, error: string): Promise<void> {
    const checkpoint = await this.loadCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job ${jobId}`);
    }

    checkpoint.status = 'FAILED';
    checkpoint.error = error;
    checkpoint.updated_at = new Date().toISOString();

    const checkpointPath = path.join(this.checkpointDir, `${jobId}.json`);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
  }

  async listCheckpoints(): Promise<JobCheckpoint[]> {
    const files = await fs.readdir(this.checkpointDir);
    const checkpoints: JobCheckpoint[] = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const checkpointPath = path.join(this.checkpointDir, file);
        const content = await fs.readFile(checkpointPath, 'utf-8');
        checkpoints.push(JSON.parse(content) as JobCheckpoint);
      }
    }

    return checkpoints;
  }

  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  async checkFileHash(filePath: string, expectedHash: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const actualHash = this.hashContent(content);
      return actualHash === expectedHash;
    } catch (error) {
      return false;
    }
  }
}

/**
 * FileReceiptStore - JSONL-based receipt storage
 */
export class FileReceiptStore implements ReceiptStore {
  private eventLogPath: string;

  constructor(config: FileStoreConfig = {}) {
    this.eventLogPath = config.eventLogPath || '.mathison/eventlog.jsonl';
  }

  async initialize(): Promise<void> {
    const logDir = path.dirname(this.eventLogPath);
    await fs.mkdir(logDir, { recursive: true });

    // Create log file if it doesn't exist
    if (!fsSync.existsSync(this.eventLogPath)) {
      await fs.writeFile(this.eventLogPath, '');
    }
  }

  async shutdown(): Promise<void> {
    // No-op for file store
  }

  async append(receipt: Receipt): Promise<void> {
    const line = JSON.stringify(receipt) + '\n';
    await fs.appendFile(this.eventLogPath, line);
  }

  async queryByJobId(jobId: string): Promise<Receipt[]> {
    const allReceipts = await this.listAll();
    return allReceipts.filter(r => r.job_id === jobId);
  }

  async queryByVerdict(verdict: 'allow' | 'deny'): Promise<Receipt[]> {
    const allReceipts = await this.listAll();
    return allReceipts.filter(r => r.verdict === verdict);
  }

  async listAll(): Promise<Receipt[]> {
    try {
      const content = await fs.readFile(this.eventLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      return lines.map(line => JSON.parse(line) as Receipt);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async queryByTimeRange(startTime: number, endTime: number): Promise<Receipt[]> {
    const allReceipts = await this.listAll();
    return allReceipts.filter(r => r.timestamp >= startTime && r.timestamp <= endTime);
  }
}
