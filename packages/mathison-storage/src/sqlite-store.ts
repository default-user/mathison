/**
 * SQLiteStore - SQLite-based storage adapter
 *
 * P2-B deliverable: Durable persistence with integrity
 * - WAL mode for concurrent access
 * - busy_timeout for retry logic
 * - Hash-chained receipts for tamper-evidence
 * - Partitioning/retention ready
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as path from 'path';
import { CheckpointStore, ReceiptStore, JobCheckpoint, Receipt } from './interfaces';

export interface SQLiteStoreConfig {
  dbPath?: string;
  walMode?: boolean;
  busyTimeout?: number;
}

/**
 * SQLiteCheckpointStore - SQLite-based checkpoint storage
 */
export class SQLiteCheckpointStore implements CheckpointStore {
  private db: Database.Database | null = null;
  private dbPath: string;
  private walMode: boolean;
  private busyTimeout: number;

  constructor(config: SQLiteStoreConfig = {}) {
    this.dbPath = config.dbPath || '.mathison/mathison.db';
    this.walMode = config.walMode !== false; // WAL enabled by default
    this.busyTimeout = config.busyTimeout || 5000; // 5 second default
  }

  async initialize(): Promise<void> {
    // Create directory if needed
    const dir = path.dirname(this.dbPath);
    const fs = await import('fs/promises');
    await fs.mkdir(dir, { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent access
    if (this.walMode) {
      this.db.pragma('journal_mode = WAL');
    }

    // Set busy timeout (retry on lock)
    this.db.pragma(`busy_timeout = ${this.busyTimeout}`);

    // Create checkpoints table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        job_id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT NOT NULL,
        inputs TEXT NOT NULL,
        stage_outputs TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error TEXT
      )
    `);

    // Create index on status for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_status
      ON checkpoints(status)
    `);
  }

  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async createCheckpoint(jobId: string, jobType: string, inputs: Record<string, unknown>): Promise<JobCheckpoint> {
    if (!this.db) throw new Error('Database not initialized');

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

    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (job_id, job_type, status, current_stage, inputs, stage_outputs, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      checkpoint.job_id,
      checkpoint.job_type,
      checkpoint.status,
      checkpoint.current_stage,
      JSON.stringify(checkpoint.inputs),
      JSON.stringify(checkpoint.stage_outputs),
      checkpoint.created_at,
      checkpoint.updated_at
    );

    return checkpoint;
  }

  async loadCheckpoint(jobId: string): Promise<JobCheckpoint | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM checkpoints WHERE job_id = ?
    `);

    const row = stmt.get(jobId) as any;
    if (!row) return null;

    return {
      job_id: row.job_id,
      job_type: row.job_type,
      status: row.status,
      current_stage: row.current_stage,
      inputs: JSON.parse(row.inputs),
      stage_outputs: JSON.parse(row.stage_outputs),
      created_at: row.created_at,
      updated_at: row.updated_at,
      error: row.error
    };
  }

  async updateStage(jobId: string, stage: string, result: { success: boolean; outputs?: unknown; error?: string }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

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

    const stmt = this.db.prepare(`
      UPDATE checkpoints
      SET current_stage = ?, stage_outputs = ?, updated_at = ?, error = ?
      WHERE job_id = ?
    `);

    stmt.run(
      checkpoint.current_stage,
      JSON.stringify(checkpoint.stage_outputs),
      checkpoint.updated_at,
      checkpoint.error || null,
      jobId
    );
  }

  async markResumableFailure(jobId: string, error: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE checkpoints
      SET status = 'RESUMABLE_FAILURE', error = ?, updated_at = ?
      WHERE job_id = ?
    `);

    stmt.run(error, new Date().toISOString(), jobId);
  }

  async markComplete(jobId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE checkpoints
      SET status = 'DONE', updated_at = ?
      WHERE job_id = ?
    `);

    stmt.run(new Date().toISOString(), jobId);
  }

  async markFailed(jobId: string, error: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      UPDATE checkpoints
      SET status = 'FAILED', error = ?, updated_at = ?
      WHERE job_id = ?
    `);

    stmt.run(error, new Date().toISOString(), jobId);
  }

  async listCheckpoints(): Promise<JobCheckpoint[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM checkpoints ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];

    return rows.map(row => ({
      job_id: row.job_id,
      job_type: row.job_type,
      status: row.status,
      current_stage: row.current_stage,
      inputs: JSON.parse(row.inputs),
      stage_outputs: JSON.parse(row.stage_outputs),
      created_at: row.created_at,
      updated_at: row.updated_at,
      error: row.error
    }));
  }

  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  async checkFileHash(filePath: string, expectedHash: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const actualHash = this.hashContent(content);
      return actualHash === expectedHash;
    } catch (error) {
      return false;
    }
  }
}

/**
 * SQLiteReceiptStore - SQLite-based receipt storage with hash chaining
 */
export class SQLiteReceiptStore implements ReceiptStore {
  private db: Database.Database | null = null;
  private dbPath: string;
  private walMode: boolean;
  private busyTimeout: number;

  constructor(config: SQLiteStoreConfig = {}) {
    this.dbPath = config.dbPath || '.mathison/mathison.db';
    this.walMode = config.walMode !== false;
    this.busyTimeout = config.busyTimeout || 5000;
  }

  async initialize(): Promise<void> {
    // Create directory if needed
    const dir = path.dirname(this.dbPath);
    const fs = await import('fs/promises');
    await fs.mkdir(dir, { recursive: true });

    // Open database
    this.db = new Database(this.dbPath);

    // Enable WAL mode
    if (this.walMode) {
      this.db.pragma('journal_mode = WAL');
    }

    // Set busy timeout
    this.db.pragma(`busy_timeout = ${this.busyTimeout}`);

    // Create receipts table with hash chaining for tamper-evidence
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        stage TEXT NOT NULL,
        action TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        notes TEXT,
        verdict TEXT,
        reason TEXT,
        prev_hash TEXT,
        content_hash TEXT NOT NULL
      )
    `);

    // Create indices for fast queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_receipts_job_id ON receipts(job_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_timestamp ON receipts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_receipts_verdict ON receipts(verdict);
    `);
  }

  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async append(receipt: Receipt): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get previous receipt's hash for chaining
    const prevHashStmt = this.db.prepare(`
      SELECT content_hash FROM receipts ORDER BY id DESC LIMIT 1
    `);
    const prevRow = prevHashStmt.get() as any;
    const prev_hash = prevRow ? prevRow.content_hash : null;

    // Compute content hash for this receipt
    const content = JSON.stringify({
      job_id: receipt.job_id,
      stage: receipt.stage,
      action: receipt.action,
      timestamp: receipt.timestamp,
      notes: receipt.notes,
      verdict: receipt.verdict,
      reason: receipt.reason,
      prev_hash
    });
    const content_hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');

    // Insert receipt
    const stmt = this.db.prepare(`
      INSERT INTO receipts (job_id, stage, action, timestamp, notes, verdict, reason, prev_hash, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      receipt.job_id,
      receipt.stage,
      receipt.action,
      receipt.timestamp,
      receipt.notes || null,
      receipt.verdict || null,
      receipt.reason || null,
      prev_hash,
      content_hash
    );
  }

  async queryByJobId(jobId: string): Promise<Receipt[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM receipts WHERE job_id = ? ORDER BY id ASC
    `);

    const rows = stmt.all(jobId) as any[];

    return rows.map(row => ({
      job_id: row.job_id,
      stage: row.stage,
      action: row.action,
      timestamp: row.timestamp,
      notes: row.notes,
      verdict: row.verdict,
      reason: row.reason
    }));
  }

  async queryByVerdict(verdict: 'allow' | 'deny'): Promise<Receipt[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM receipts WHERE verdict = ? ORDER BY id ASC
    `);

    const rows = stmt.all(verdict) as any[];

    return rows.map(row => ({
      job_id: row.job_id,
      stage: row.stage,
      action: row.action,
      timestamp: row.timestamp,
      notes: row.notes,
      verdict: row.verdict,
      reason: row.reason
    }));
  }

  async listAll(): Promise<Receipt[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM receipts ORDER BY id ASC
    `);

    const rows = stmt.all() as any[];

    return rows.map(row => ({
      job_id: row.job_id,
      stage: row.stage,
      action: row.action,
      timestamp: row.timestamp,
      notes: row.notes,
      verdict: row.verdict,
      reason: row.reason
    }));
  }

  async queryByTimeRange(startTime: number, endTime: number): Promise<Receipt[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM receipts WHERE timestamp >= ? AND timestamp <= ? ORDER BY id ASC
    `);

    const rows = stmt.all(startTime, endTime) as any[];

    return rows.map(row => ({
      job_id: row.job_id,
      stage: row.stage,
      action: row.action,
      timestamp: row.timestamp,
      notes: row.notes,
      verdict: row.verdict,
      reason: row.reason
    }));
  }

  /**
   * Verify integrity of receipt chain
   * Returns true if all hashes are valid, false if tampering detected
   */
  async verifyChainIntegrity(): Promise<{ valid: boolean; brokenAt?: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM receipts ORDER BY id ASC
    `);

    const rows = stmt.all() as any[];

    let prevHash: string | null = null;

    for (const row of rows) {
      // Recompute content hash
      const content = JSON.stringify({
        job_id: row.job_id,
        stage: row.stage,
        action: row.action,
        timestamp: row.timestamp,
        notes: row.notes,
        verdict: row.verdict,
        reason: row.reason,
        prev_hash: row.prev_hash
      });
      const expectedHash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');

      // Verify stored hash matches computed hash
      if (row.content_hash !== expectedHash) {
        return { valid: false, brokenAt: row.id };
      }

      // Verify chain link
      if (row.prev_hash !== prevHash) {
        return { valid: false, brokenAt: row.id };
      }

      prevHash = row.content_hash;
    }

    return { valid: true };
  }
}
