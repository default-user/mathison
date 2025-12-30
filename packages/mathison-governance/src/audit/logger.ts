/**
 * Audit Logger
 * Tamper-evident logging for all governance decisions
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface AuditEntry {
  timestamp: number;
  direction: 'ingress' | 'egress' | 'action' | 'output';
  clientId?: string;
  endpoint?: string;
  action?: string;
  allowed: boolean;
  violations?: string[];
  verdict?: string;
  reason?: string;
  payloadHash?: string; // SHA-256 hash for correlation
  previousEntryHash?: string; // For tamper evidence
  entryHash?: string; // Hash of this entry
}

export interface AuditLoggerConfig {
  logPath: string;
  enabled: boolean;
  flushInterval?: number; // ms
}

export class AuditLogger {
  private config: Required<AuditLoggerConfig>;
  private entries: AuditEntry[] = [];
  private lastEntryHash: string | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AuditLoggerConfig> = {}) {
    this.config = {
      logPath: config.logPath ?? path.join(process.cwd(), 'logs', 'audit.jsonl'),
      enabled: config.enabled ?? true,
      flushInterval: config.flushInterval ?? 5000 // 5 seconds
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('ℹ️  Audit logging disabled');
      return;
    }

    console.log('📝 Initializing audit logger...');

    // Ensure log directory exists
    const logDir = path.dirname(this.config.logPath);
    await fs.mkdir(logDir, { recursive: true });

    // Load last entry hash from existing log
    await this.loadLastEntryHash();

    // Start periodic flush
    this.startPeriodicFlush();

    console.log(`✓ Audit logger initialized: ${this.config.logPath}`);
  }

  async shutdown(): Promise<void> {
    if (!this.config.enabled) return;

    console.log('📝 Shutting down audit logger...');

    // Stop periodic flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();

    console.log('✓ Audit logger shutdown complete');
  }

  /**
   * Log an audit entry
   */
  log(entry: Omit<AuditEntry, 'timestamp' | 'previousEntryHash' | 'entryHash'>): void {
    if (!this.config.enabled) return;

    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: Date.now(),
      previousEntryHash: this.lastEntryHash || undefined
    };

    // Calculate hash of this entry
    fullEntry.entryHash = this.hashEntry(fullEntry);
    this.lastEntryHash = fullEntry.entryHash;

    this.entries.push(fullEntry);
  }

  /**
   * Log CIF ingress event
   */
  logIngress(clientId: string, endpoint: string, allowed: boolean, violations?: string[]): void {
    this.log({
      direction: 'ingress',
      clientId,
      endpoint,
      allowed,
      violations
    });
  }

  /**
   * Log CIF egress event
   */
  logEgress(clientId: string, endpoint: string, allowed: boolean, violations?: string[], leaks?: string[]): void {
    this.log({
      direction: 'egress',
      clientId,
      endpoint,
      allowed,
      violations: violations || leaks
    });
  }

  /**
   * Log CDI action check
   */
  logAction(clientId: string, action: string, allowed: boolean, verdict: string, reason: string): void {
    this.log({
      direction: 'action',
      clientId,
      action,
      allowed,
      verdict,
      reason
    });
  }

  /**
   * Log CDI output check
   */
  logOutput(clientId: string, allowed: boolean, violations?: string[]): void {
    this.log({
      direction: 'output',
      clientId,
      allowed,
      violations
    });
  }

  /**
   * Flush pending entries to disk
   */
  async flush(): Promise<void> {
    if (!this.config.enabled || this.entries.length === 0) return;

    try {
      const logLines = this.entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await fs.appendFile(this.config.logPath, logLines);
      this.entries = [];
    } catch (error) {
      console.error('❌ Failed to flush audit log:', error);
    }
  }

  /**
   * Get recent entries from log file
   */
  async getRecentEntries(limit: number = 100): Promise<AuditEntry[]> {
    if (!this.config.enabled) return [];

    try {
      const content = await fs.readFile(this.config.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      const entries = lines.slice(-limit).map(line => JSON.parse(line) as AuditEntry);
      return entries;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Verify log integrity
   */
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    if (!this.config.enabled) return { valid: true, errors: [] };

    const entries = await this.getRecentEntries(10000); // Check last 10k entries
    const errors: string[] = [];
    let previousHash: string | null = null;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Check chain integrity
      if (i > 0 && entry.previousEntryHash !== previousHash) {
        errors.push(`Entry ${i}: previous hash mismatch`);
      }

      // Verify entry hash
      const expectedHash = this.hashEntry(entry);
      if (entry.entryHash !== expectedHash) {
        errors.push(`Entry ${i}: hash verification failed`);
      }

      previousHash = entry.entryHash!;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate hash of audit entry for tamper evidence
   */
  private hashEntry(entry: AuditEntry): string {
    const data = {
      timestamp: entry.timestamp,
      direction: entry.direction,
      clientId: entry.clientId,
      endpoint: entry.endpoint,
      action: entry.action,
      allowed: entry.allowed,
      violations: entry.violations,
      verdict: entry.verdict,
      reason: entry.reason,
      payloadHash: entry.payloadHash,
      previousEntryHash: entry.previousEntryHash
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Load last entry hash from existing log file
   */
  private async loadLastEntryHash(): Promise<void> {
    try {
      const entries = await this.getRecentEntries(1);
      if (entries.length > 0) {
        this.lastEntryHash = entries[0].entryHash || null;
      }
    } catch (error) {
      // Ignore errors during initialization
    }
  }

  /**
   * Start periodic flush timer
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('❌ Periodic flush failed:', error);
      });
    }, this.config.flushInterval);
  }

  /**
   * Calculate hash of arbitrary payload
   */
  static hashPayload(payload: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }
}

export default AuditLogger;
