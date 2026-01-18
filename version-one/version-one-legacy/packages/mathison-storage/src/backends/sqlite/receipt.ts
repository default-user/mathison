import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { ReceiptStore, Receipt } from '../../receipt_store';
import { chainReceipt, validateReceiptChain, GENESIS_HASH, computeReceiptHash } from '../../receipt-chain';

export class SQLiteReceiptStore implements ReceiptStore {
  private db: Database.Database;

  // P0.3: Chain state tracking
  private lastReceiptHash: string = GENESIS_HASH;
  private nextSequenceNumber: number = 0;
  private chainInitialized: boolean = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        receipt_hash TEXT,
        prev_hash TEXT,
        sequence_number INTEGER,
        chain_signature TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_receipts_job_id ON receipts(job_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_ts ON receipts(ts);
      CREATE INDEX IF NOT EXISTS idx_receipts_sequence ON receipts(sequence_number);
    `);

    // P0.3: Initialize chain state from existing receipts
    await this.initializeChainState();
  }

  /**
   * P0.3: Initialize chain state by reading the last receipt
   */
  private async initializeChainState(): Promise<void> {
    const receipts = await this.readAll({ limit: 1, offset: -1 });

    if (receipts.length > 0) {
      const lastReceipt = receipts[0];
      this.lastReceiptHash = computeReceiptHash(lastReceipt);
      this.nextSequenceNumber = (lastReceipt.sequence_number ?? -1) + 1;
    } else {
      // No receipts yet - start from genesis
      this.lastReceiptHash = GENESIS_HASH;
      this.nextSequenceNumber = 0;
    }

    this.chainInitialized = true;
  }

  async append(r: Receipt): Promise<void> {
    // P0.3: Add chain fields before appending
    const chainedReceipt = chainReceipt(r, this.lastReceiptHash, this.nextSequenceNumber);

    // Compute hash of chained receipt
    const receiptJson = JSON.stringify(chainedReceipt);
    const receiptHash = computeReceiptHash(chainedReceipt);

    // INSERT ONLY (no UPDATE/DELETE)
    const insertStmt = this.db.prepare(`
      INSERT INTO receipts (job_id, ts, receipt_json, receipt_hash, prev_hash, sequence_number, chain_signature)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      chainedReceipt.job_id,
      chainedReceipt.timestamp,
      receiptJson,
      receiptHash,
      chainedReceipt.prev_hash,
      chainedReceipt.sequence_number,
      chainedReceipt.chain_signature
    );

    // P0.3: Update chain state after successful append
    this.lastReceiptHash = receiptHash;
    this.nextSequenceNumber++;
  }

  async readByJob(jobId: string, opts?: { limit?: number }): Promise<Receipt[]> {
    const limit = opts?.limit ?? -1; // -1 means no limit in SQLite
    const stmt = this.db.prepare(`
      SELECT receipt_json FROM receipts
      WHERE job_id = ?
      ORDER BY id ASC
      LIMIT ?
    `);

    const rows = stmt.all(jobId, limit) as { receipt_json: string }[];
    return rows.map(row => JSON.parse(row.receipt_json));
  }

  async latest(jobId: string): Promise<Receipt | null> {
    const stmt = this.db.prepare(`
      SELECT receipt_json FROM receipts
      WHERE job_id = ?
      ORDER BY id DESC
      LIMIT 1
    `);

    const row = stmt.get(jobId) as { receipt_json: string } | undefined;
    return row ? JSON.parse(row.receipt_json) : null;
  }

  /**
   * P0.3: Read all receipts in sequence order
   */
  async readAll(opts?: { limit?: number; offset?: number }): Promise<Receipt[]> {
    let sql = 'SELECT receipt_json FROM receipts ORDER BY id ASC';
    const params: any[] = [];

    if (opts?.offset !== undefined && opts.offset >= 0) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(opts.limit ?? -1, opts.offset);
    } else if (opts?.offset !== undefined && opts.offset < 0) {
      // Negative offset: read from end
      // Get total count first
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM receipts');
      const countRow = countStmt.get() as { count: number };
      const totalCount = countRow.count;
      const actualOffset = Math.max(0, totalCount + opts.offset);

      sql += ' LIMIT ? OFFSET ?';
      params.push(opts.limit ?? -1, actualOffset);
    } else if (opts?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(opts.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as { receipt_json: string }[];
    return rows.map(row => JSON.parse(row.receipt_json));
  }

  /**
   * P0.3: Validate entire receipt chain
   */
  async validateChain(): Promise<{ valid: boolean; errors: string[]; lastSequence: number }> {
    const receipts = await this.readAll();
    return validateReceiptChain(receipts);
  }
}
