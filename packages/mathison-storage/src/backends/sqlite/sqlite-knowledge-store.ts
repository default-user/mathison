/**
 * SQLite-based KnowledgeStore implementation
 */

import { Database } from 'better-sqlite3';
import { KnowledgeStore, GroundedClaim, ConflictRecord, IngestionLogEntry } from '../../knowledge_store';

export class SQLiteKnowledgeStore implements KnowledgeStore {
  private db: Database | null = null;

  constructor(private dbPath: string) {}

  async init(): Promise<void> {
    const BetterSqlite3 = require('better-sqlite3');
    this.db = new BetterSqlite3(this.dbPath);

    if (!this.db) {
      throw new Error('Failed to initialize SQLite database');
    }

    // Create claims table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_claims (
        claim_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        support TEXT NOT NULL,
        key TEXT,
        confidence REAL,
        packet_id TEXT NOT NULL,
        chunk_hashes TEXT NOT NULL,
        sources_hash TEXT,
        template_checksum TEXT,
        signature_status TEXT,
        status TEXT NOT NULL,
        taint TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // Create index on key for conflict detection
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_claims_key ON knowledge_claims(key)
    `);

    // Create conflicts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_conflicts (
        conflict_id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        existing_claim_id TEXT NOT NULL,
        new_claim_id TEXT NOT NULL,
        existing_text TEXT NOT NULL,
        new_text TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        packet_id TEXT NOT NULL
      )
    `);

    // Create ingestion log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_ingestion_log (
        ingestion_run_id TEXT PRIMARY KEY,
        packet_id TEXT NOT NULL,
        grounded_count INTEGER NOT NULL,
        hypothesis_count INTEGER NOT NULL,
        denied_count INTEGER NOT NULL,
        conflict_count INTEGER NOT NULL,
        sources_hash TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // Create index on packet_id for log queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ingestion_log_packet ON knowledge_ingestion_log(packet_id)
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async writeClaim(claim: GroundedClaim): Promise<void> {
    if (!this.db) throw new Error('KnowledgeStore not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_claims (
        claim_id, type, text, support, key, confidence,
        packet_id, chunk_hashes, sources_hash, template_checksum,
        signature_status, status, taint, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      claim.claim_id,
      claim.type,
      claim.text,
      JSON.stringify(claim.support),
      claim.key ?? null,
      claim.confidence ?? null,
      claim.packet_id,
      JSON.stringify(claim.chunk_hashes),
      claim.sources_hash ?? null,
      claim.template_checksum ?? null,
      claim.signature_status ?? null,
      claim.status,
      claim.taint ?? null,
      claim.created_at
    );
  }

  async readClaim(claim_id: string): Promise<GroundedClaim | null> {
    if (!this.db) throw new Error('KnowledgeStore not initialized');

    const stmt = this.db.prepare('SELECT * FROM knowledge_claims WHERE claim_id = ?');
    const row = stmt.get(claim_id) as any;

    if (!row) return null;

    return {
      claim_id: row.claim_id,
      type: row.type,
      text: row.text,
      support: JSON.parse(row.support),
      key: row.key,
      confidence: row.confidence,
      packet_id: row.packet_id,
      chunk_hashes: JSON.parse(row.chunk_hashes),
      sources_hash: row.sources_hash,
      template_checksum: row.template_checksum,
      signature_status: row.signature_status,
      status: row.status,
      taint: row.taint,
      created_at: row.created_at,
    };
  }

  async findClaimsByKey(key: string): Promise<GroundedClaim[]> {
    if (!this.db) throw new Error('KnowledgeStore not initialized');

    const stmt = this.db.prepare('SELECT * FROM knowledge_claims WHERE key = ?');
    const rows = stmt.all(key) as any[];

    return rows.map((row) => ({
      claim_id: row.claim_id,
      type: row.type,
      text: row.text,
      support: JSON.parse(row.support),
      key: row.key,
      confidence: row.confidence,
      packet_id: row.packet_id,
      chunk_hashes: JSON.parse(row.chunk_hashes),
      sources_hash: row.sources_hash,
      template_checksum: row.template_checksum,
      signature_status: row.signature_status,
      status: row.status,
      taint: row.taint,
      created_at: row.created_at,
    }));
  }

  async recordConflict(conflict: ConflictRecord): Promise<void> {
    if (!this.db) throw new Error('KnowledgeStore not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO knowledge_conflicts (
        conflict_id, key, existing_claim_id, new_claim_id,
        existing_text, new_text, detected_at, packet_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      conflict.conflict_id,
      conflict.key,
      conflict.existing_claim_id,
      conflict.new_claim_id,
      conflict.existing_text,
      conflict.new_text,
      conflict.detected_at,
      conflict.packet_id
    );
  }

  async getConflicts(packet_id: string): Promise<ConflictRecord[]> {
    if (!this.db) throw new Error('KnowledgeStore not initialized');

    const stmt = this.db.prepare('SELECT * FROM knowledge_conflicts WHERE packet_id = ?');
    const rows = stmt.all(packet_id) as any[];

    return rows.map((row) => ({
      conflict_id: row.conflict_id,
      key: row.key,
      existing_claim_id: row.existing_claim_id,
      new_claim_id: row.new_claim_id,
      existing_text: row.existing_text,
      new_text: row.new_text,
      detected_at: row.detected_at,
      packet_id: row.packet_id,
    }));
  }

  async logIngestion(entry: IngestionLogEntry): Promise<void> {
    if (!this.db) throw new Error('KnowledgeStore not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO knowledge_ingestion_log (
        ingestion_run_id, packet_id, grounded_count, hypothesis_count,
        denied_count, conflict_count, sources_hash, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.ingestion_run_id,
      entry.packet_id,
      entry.grounded_count,
      entry.hypothesis_count,
      entry.denied_count,
      entry.conflict_count,
      entry.sources_hash ?? null,
      entry.timestamp
    );
  }

  async getIngestionLog(packet_id?: string): Promise<IngestionLogEntry[]> {
    if (!this.db) throw new Error('KnowledgeStore not initialized');

    let stmt;
    let rows;

    if (packet_id) {
      stmt = this.db.prepare('SELECT * FROM knowledge_ingestion_log WHERE packet_id = ? ORDER BY timestamp DESC');
      rows = stmt.all(packet_id) as any[];
    } else {
      stmt = this.db.prepare('SELECT * FROM knowledge_ingestion_log ORDER BY timestamp DESC');
      rows = stmt.all() as any[];
    }

    return rows.map((row) => ({
      ingestion_run_id: row.ingestion_run_id,
      packet_id: row.packet_id,
      grounded_count: row.grounded_count,
      hypothesis_count: row.hypothesis_count,
      denied_count: row.denied_count,
      conflict_count: row.conflict_count,
      sources_hash: row.sources_hash,
      timestamp: row.timestamp,
    }));
  }
}
