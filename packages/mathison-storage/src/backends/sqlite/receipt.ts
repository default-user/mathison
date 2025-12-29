import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { ReceiptStore, Receipt } from '../../receipt_store';

export class SQLiteReceiptStore implements ReceiptStore {
  private db: Database.Database;

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
        prev_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_receipts_job_id ON receipts(job_id);
      CREATE INDEX IF NOT EXISTS idx_receipts_ts ON receipts(ts);
    `);
  }

  async append(r: Receipt): Promise<void> {
    // Get previous hash for this job (hash-chain)
    const prevHashStmt = this.db.prepare(`
      SELECT receipt_hash FROM receipts
      WHERE job_id = ?
      ORDER BY id DESC
      LIMIT 1
    `);
    const prevRow = prevHashStmt.get(r.job_id) as { receipt_hash: string | null } | undefined;
    const prevHash = prevRow?.receipt_hash ?? null;

    // Compute hash of current receipt
    const receiptJson = JSON.stringify(r);
    const receiptHash = crypto.createHash('sha256').update(receiptJson).digest('hex');

    // INSERT ONLY (no UPDATE/DELETE)
    const insertStmt = this.db.prepare(`
      INSERT INTO receipts (job_id, ts, receipt_json, receipt_hash, prev_hash)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      r.job_id,
      r.timestamp,
      receiptJson,
      receiptHash,
      prevHash
    );
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
}
