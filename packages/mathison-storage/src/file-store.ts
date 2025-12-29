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
  eventLogPath?: string; // Base path without extension (e.g., '.mathison/eventlog')
  maxLogSizeBytes?: number; // Max size before rotation (default: 10MB)
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
 * FileReceiptStore - JSONL-based receipt storage with rotation
 * P2-B.2: Size-based rotation (eventlog-0001.jsonl, eventlog-0002.jsonl, etc.)
 */
export class FileReceiptStore implements ReceiptStore {
  private eventLogBasePath: string; // Base path without segment number
  private maxLogSizeBytes: number;
  private currentSegment: number = 1;

  constructor(config: FileStoreConfig = {}) {
    // Remove .jsonl extension if present, we'll add it with segment number
    const basePath = config.eventLogPath || '.mathison/eventlog';
    this.eventLogBasePath = basePath.replace(/\.jsonl$/, '');
    this.maxLogSizeBytes = config.maxLogSizeBytes || 10 * 1024 * 1024; // 10MB default
  }

  private getSegmentPath(segment: number): string {
    return `${this.eventLogBasePath}-${String(segment).padStart(4, '0')}.jsonl`;
  }

  private async findCurrentSegment(): Promise<number> {
    const logDir = path.dirname(this.eventLogBasePath);
    const baseName = path.basename(this.eventLogBasePath);

    try {
      const files = await fs.readdir(logDir);
      const segments = files
        .filter(f => f.startsWith(baseName) && f.endsWith('.jsonl'))
        .map(f => {
          const match = f.match(/-(\d+)\.jsonl$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

      return segments.length > 0 ? Math.max(...segments) : 1;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return 1;
      }
      throw error;
    }
  }

  async initialize(): Promise<void> {
    const logDir = path.dirname(this.eventLogBasePath);
    await fs.mkdir(logDir, { recursive: true });

    // Find the current segment
    this.currentSegment = await this.findCurrentSegment();

    // Create initial log file if it doesn't exist
    const currentPath = this.getSegmentPath(this.currentSegment);
    if (!fsSync.existsSync(currentPath)) {
      await fs.writeFile(currentPath, '');
    }
  }

  async shutdown(): Promise<void> {
    // No-op for file store
  }

  private async shouldRotate(): Promise<boolean> {
    const currentPath = this.getSegmentPath(this.currentSegment);
    try {
      const stats = await fs.stat(currentPath);
      return stats.size >= this.maxLogSizeBytes;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async append(receipt: Receipt): Promise<void> {
    // Check if we need to rotate
    if (await this.shouldRotate()) {
      this.currentSegment++;
      const newPath = this.getSegmentPath(this.currentSegment);
      await fs.writeFile(newPath, '');
    }

    const line = JSON.stringify(receipt) + '\n';
    const currentPath = this.getSegmentPath(this.currentSegment);
    await fs.appendFile(currentPath, line);
  }

  async queryByJobId(jobId: string): Promise<Receipt[]> {
    const allReceipts = await this.listAll();
    return allReceipts.filter(r => r.job_id === jobId);
  }

  async queryByVerdict(verdict: 'allow' | 'deny'): Promise<Receipt[]> {
    const allReceipts = await this.listAll();
    return allReceipts.filter(r => r.verdict === verdict);
  }

  private async getAllSegments(): Promise<number[]> {
    const logDir = path.dirname(this.eventLogBasePath);
    const baseName = path.basename(this.eventLogBasePath);

    try {
      const files = await fs.readdir(logDir);
      const segments = files
        .filter(f => f.startsWith(baseName) && f.endsWith('.jsonl'))
        .map(f => {
          const match = f.match(/-(\d+)\.jsonl$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0)
        .sort((a, b) => a - b);

      return segments;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async listAll(): Promise<Receipt[]> {
    const segments = await this.getAllSegments();
    const allReceipts: Receipt[] = [];

    for (const segment of segments) {
      const segmentPath = this.getSegmentPath(segment);
      try {
        const content = await fs.readFile(segmentPath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);
        const receipts = lines.map(line => JSON.parse(line) as Receipt);
        allReceipts.push(...receipts);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          continue; // Skip missing segments
        }
        throw error;
      }
    }

    return allReceipts;
  }

  async queryByTimeRange(startTime: number, endTime: number): Promise<Receipt[]> {
    const allReceipts = await this.listAll();
    return allReceipts.filter(r => r.timestamp >= startTime && r.timestamp <= endTime);
  }

  async latest(jobId: string): Promise<Receipt | null> {
    const receipts = await this.queryByJobId(jobId);
    if (receipts.length === 0) return null;
    // Return last receipt (most recent by append order)
    return receipts[receipts.length - 1];
  }
}
