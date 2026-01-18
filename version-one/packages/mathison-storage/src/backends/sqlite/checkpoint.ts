import Database from 'better-sqlite3';
import { CheckpointStore, JobCheckpoint } from '../../checkpoint_store';

export class SQLiteCheckpointStore implements CheckpointStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        job_id TEXT PRIMARY KEY,
        checkpoint_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        content_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_checkpoints_updated_at ON checkpoints(updated_at);
    `);
  }

  async create(cp: JobCheckpoint): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (job_id, checkpoint_json, updated_at, content_hash)
      VALUES (?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    stmt.run(
      cp.job_id,
      JSON.stringify(cp),
      now,
      cp.content_hash ?? null
    );
  }

  async load(jobId: string): Promise<JobCheckpoint | null> {
    const stmt = this.db.prepare(`
      SELECT checkpoint_json FROM checkpoints WHERE job_id = ?
    `);

    const row = stmt.get(jobId) as { checkpoint_json: string } | undefined;
    return row ? JSON.parse(row.checkpoint_json) : null;
  }

  async save(cp: JobCheckpoint): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (job_id, checkpoint_json, updated_at, content_hash)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        checkpoint_json = excluded.checkpoint_json,
        updated_at = excluded.updated_at,
        content_hash = excluded.content_hash
    `);

    const now = new Date().toISOString();
    stmt.run(
      cp.job_id,
      JSON.stringify(cp),
      now,
      cp.content_hash ?? null
    );
  }

  async list(opts?: { limit?: number }): Promise<JobCheckpoint[]> {
    const limit = opts?.limit ?? -1; // -1 means no limit in SQLite
    const stmt = this.db.prepare(`
      SELECT checkpoint_json FROM checkpoints
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as { checkpoint_json: string }[];
    return rows.map(row => JSON.parse(row.checkpoint_json));
  }
}
