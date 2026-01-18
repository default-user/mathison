/**
 * File-based KnowledgeStore implementation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { KnowledgeStore, GroundedClaim, ConflictRecord, IngestionLogEntry } from '../../knowledge_store';

export class FileKnowledgeStore implements KnowledgeStore {
  private basePath: string;
  private claimsPath: string;
  private conflictsPath: string;
  private logPath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.claimsPath = path.join(basePath, 'knowledge', 'claims');
    this.conflictsPath = path.join(basePath, 'knowledge', 'conflicts');
    this.logPath = path.join(basePath, 'knowledge', 'ingestion_log');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.claimsPath, { recursive: true });
    await fs.mkdir(this.conflictsPath, { recursive: true });
    await fs.mkdir(this.logPath, { recursive: true });
  }

  async close(): Promise<void> {
    // File-based store has no persistent connections
  }

  async writeClaim(claim: GroundedClaim): Promise<void> {
    const filePath = path.join(this.claimsPath, `${claim.claim_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(claim, null, 2), 'utf-8');
  }

  async readClaim(claim_id: string): Promise<GroundedClaim | null> {
    const filePath = path.join(this.claimsPath, `${claim_id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async findClaimsByKey(key: string): Promise<GroundedClaim[]> {
    const files = await fs.readdir(this.claimsPath);
    const claims: GroundedClaim[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.claimsPath, file);
      const data = await fs.readFile(filePath, 'utf-8');
      const claim: GroundedClaim = JSON.parse(data);

      if (claim.key === key) {
        claims.push(claim);
      }
    }

    return claims;
  }

  async recordConflict(conflict: ConflictRecord): Promise<void> {
    const filePath = path.join(this.conflictsPath, `${conflict.conflict_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(conflict, null, 2), 'utf-8');
  }

  async getConflicts(packet_id: string): Promise<ConflictRecord[]> {
    const files = await fs.readdir(this.conflictsPath);
    const conflicts: ConflictRecord[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.conflictsPath, file);
      const data = await fs.readFile(filePath, 'utf-8');
      const conflict: ConflictRecord = JSON.parse(data);

      if (conflict.packet_id === packet_id) {
        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  async logIngestion(entry: IngestionLogEntry): Promise<void> {
    const filePath = path.join(this.logPath, `${entry.ingestion_run_id}.json`);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
  }

  async getIngestionLog(packet_id?: string): Promise<IngestionLogEntry[]> {
    const files = await fs.readdir(this.logPath);
    const entries: IngestionLogEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.logPath, file);
      const data = await fs.readFile(filePath, 'utf-8');
      const entry: IngestionLogEntry = JSON.parse(data);

      if (!packet_id || entry.packet_id === packet_id) {
        entries.push(entry);
      }
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }
}
