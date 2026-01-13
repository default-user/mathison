/**
 * Thin Waist v0.1: Log Envelope + Retention Caps
 *
 * Mobile-safe logging with deterministic retention caps.
 *
 * INVARIANT: Log storage never exceeds configured caps.
 * ENFORCEMENT: Drop low-severity on overflow; block high-risk if durable logging required.
 */

import { createHash } from 'crypto';

/**
 * Log severity levels (for retention policy)
 */
export enum LogSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

/**
 * Log envelope v1 - lightweight, mobile-safe
 */
export interface LogEnvelope {
  envelope_id: string; // Unique envelope ID
  timestamp: string; // ISO timestamp
  node_id: string; // Node/server identifier
  subject_id: string; // Actor/job ID
  event_type: string; // Event type (e.g., "tool_invocation", "governance_decision")
  severity: LogSeverity;
  summary: string; // Short summary (max 200 chars)
  details_ref?: string; // Optional reference to full details (URL, file path, etc.)
  chain_prev_hash: string | null; // Hash of previous envelope (for chain integrity), null for first
  hash: string; // SHA256 hash of envelope content
}

/**
 * Log retention policy
 */
export interface RetentionPolicy {
  max_envelopes: number; // Max envelopes in ring buffer
  max_pending_bytes: number; // Max bytes pending upload
  drop_on_overflow: LogSeverity[]; // Severities to drop when caps exceeded
  block_on_overflow: LogSeverity[]; // Severities that require durable logging
}

/**
 * Default retention policy (mobile-safe)
 */
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  max_envelopes: 1000, // Keep last 1000 envelopes
  max_pending_bytes: 1024 * 1024, // 1 MB pending uploads
  drop_on_overflow: [LogSeverity.DEBUG, LogSeverity.INFO],
  block_on_overflow: [LogSeverity.ERROR, LogSeverity.CRITICAL]
};

/**
 * Log sink result
 */
export interface LogSinkResult {
  accepted: boolean;
  envelope_id?: string;
  denied_reason?: string;
  dropped_count?: number; // Number of low-severity logs dropped
}

/**
 * LogSink - Mobile-safe log storage with retention caps
 */
export class LogSink {
  private envelopes: LogEnvelope[] = [];
  private policy: RetentionPolicy;
  private nodeId: string;
  private chainPrevHash: string | null = null;
  private totalBytes = 0;
  private droppedCount = 0;
  // Track envelope sizes for accurate byte accounting
  private envelopeSizes: Map<string, number> = new Map();

  constructor(nodeId: string, policy: RetentionPolicy = DEFAULT_RETENTION_POLICY) {
    this.nodeId = nodeId;
    this.policy = policy;
    console.log(`📋 LogSink: Initialized for node ${nodeId} (max_envelopes=${policy.max_envelopes}, max_bytes=${policy.max_pending_bytes})`);
  }

  /**
   * Append log envelope
   *
   * @param envelope - Log envelope to append
   * @returns Result with acceptance status
   */
  append(envelope: Omit<LogEnvelope, 'envelope_id' | 'node_id' | 'hash' | 'chain_prev_hash'>): LogSinkResult {
    // Generate envelope ID early so we can estimate final size
    const envelope_id = this.generateEnvelopeId();

    // Create full envelope with chain (for accurate size estimation)
    const fullEnvelope: LogEnvelope = {
      ...envelope,
      envelope_id,
      node_id: this.nodeId,
      chain_prev_hash: this.chainPrevHash,
      hash: '' // Will be computed below
    };

    // Compute envelope hash
    fullEnvelope.hash = this.computeEnvelopeHash(fullEnvelope);

    // Now compute the size of the COMPLETE envelope for accurate accounting
    const envelopeSize = this.estimateEnvelopeSize(fullEnvelope);

    // Check capacity BEFORE appending
    // Check if severity requires durable logging
    // Only block if caps exceeded AND no droppable logs available
    if (this.policy.block_on_overflow.includes(envelope.severity)) {
      if (this.envelopes.length >= this.policy.max_envelopes ||
          this.totalBytes + envelopeSize > this.policy.max_pending_bytes) {
        // Check if there are droppable logs that can be removed to make room
        const hasDroppableLogs = this.envelopes.some(env =>
          this.policy.drop_on_overflow.includes(env.severity)
        );

        // Only block if no droppable logs available
        if (!hasDroppableLogs) {
          return {
            accepted: false,
            denied_reason: `DURABLE_LOGGING_REQUIRED: ${envelope.severity} event requires durable logging but caps exceeded and no droppable logs available (envelopes=${this.envelopes.length}/${this.policy.max_envelopes}, bytes=${this.totalBytes}/${this.policy.max_pending_bytes})`
          };
        }
      }
    }

    // Append to buffer
    this.envelopes.push(fullEnvelope);
    this.envelopeSizes.set(envelope_id, envelopeSize);
    this.totalBytes += envelopeSize;
    this.chainPrevHash = fullEnvelope.hash;

    // Apply retention policy (cleanup old/low-priority logs)
    const dropped = this.applyRetentionPolicy();

    return {
      accepted: true,
      envelope_id,
      dropped_count: dropped > 0 ? dropped : undefined
    };
  }

  /**
   * Apply retention policy: drop low-severity logs if caps exceeded
   * @returns Number of envelopes dropped
   */
  private applyRetentionPolicy(): number {
    let dropped = 0;

    // Check envelope count cap
    while (this.envelopes.length > this.policy.max_envelopes) {
      const removed = this.removeLowestPriority();
      if (removed) {
        dropped++;
      } else {
        // No droppable envelopes left
        break;
      }
    }

    // Check bytes cap
    while (this.totalBytes > this.policy.max_pending_bytes) {
      const removed = this.removeLowestPriority();
      if (removed) {
        dropped++;
      } else {
        break;
      }
    }

    if (dropped > 0) {
      this.droppedCount += dropped;
      console.warn(`⚠️  LogSink: Dropped ${dropped} low-severity envelopes (total dropped: ${this.droppedCount})`);
    }

    return dropped;
  }

  /**
   * Remove lowest priority (droppable) envelope
   * @returns true if envelope was removed, false if no droppable envelopes
   */
  private removeLowestPriority(): boolean {
    // Find first droppable envelope (oldest first)
    for (let i = 0; i < this.envelopes.length; i++) {
      const env = this.envelopes[i];
      if (this.policy.drop_on_overflow.includes(env.severity)) {
        const removed = this.envelopes.splice(i, 1)[0];
        // Use stored size for accurate accounting
        const storedSize = this.envelopeSizes.get(removed.envelope_id);
        if (storedSize !== undefined) {
          this.totalBytes -= storedSize;
          this.envelopeSizes.delete(removed.envelope_id);
        } else {
          // Fallback to estimation if size not found (shouldn't happen)
          this.totalBytes -= this.estimateEnvelopeSize(removed);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Estimate envelope size in bytes
   */
  private estimateEnvelopeSize(envelope: Partial<LogEnvelope>): number {
    // Rough estimate: JSON size
    return JSON.stringify(envelope).length;
  }

  /**
   * Generate unique envelope ID
   */
  private generateEnvelopeId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `env_${timestamp}_${random}`;
  }

  /**
   * Compute envelope hash (SHA256 of canonical content)
   */
  private computeEnvelopeHash(envelope: Omit<LogEnvelope, 'hash'>): string {
    const canonical = JSON.stringify({
      envelope_id: envelope.envelope_id,
      timestamp: envelope.timestamp,
      node_id: envelope.node_id,
      subject_id: envelope.subject_id,
      event_type: envelope.event_type,
      severity: envelope.severity,
      summary: envelope.summary,
      details_ref: envelope.details_ref,
      chain_prev_hash: envelope.chain_prev_hash
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Get envelopes (most recent first)
   */
  getEnvelopes(limit = 100): LogEnvelope[] {
    return this.envelopes.slice(-limit).reverse();
  }

  /**
   * Get envelopes by severity
   */
  getEnvelopesBySeverity(severity: LogSeverity, limit = 100): LogEnvelope[] {
    return this.envelopes
      .filter(e => e.severity === severity)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get statistics
   */
  getStats(): {
    total_envelopes: number;
    total_bytes: number;
    dropped_count: number;
    cap_utilization: { envelopes: number; bytes: number };
    severity_distribution: Record<LogSeverity, number>;
  } {
    const severityDist: Record<string, number> = {};
    for (const env of this.envelopes) {
      severityDist[env.severity] = (severityDist[env.severity] || 0) + 1;
    }

    return {
      total_envelopes: this.envelopes.length,
      total_bytes: this.totalBytes,
      dropped_count: this.droppedCount,
      cap_utilization: {
        envelopes: Math.round((this.envelopes.length / this.policy.max_envelopes) * 100),
        bytes: Math.round((this.totalBytes / this.policy.max_pending_bytes) * 100)
      },
      severity_distribution: severityDist as Record<LogSeverity, number>
    };
  }

  /**
   * Flush envelopes (simulate remote upload)
   * @returns Envelopes to flush (and removes from buffer)
   */
  flush(maxEnvelopes = 100): LogEnvelope[] {
    const toFlush = this.envelopes.splice(0, maxEnvelopes);
    for (const env of toFlush) {
      // Use stored size for accurate accounting
      const storedSize = this.envelopeSizes.get(env.envelope_id);
      if (storedSize !== undefined) {
        this.totalBytes -= storedSize;
        this.envelopeSizes.delete(env.envelope_id);
      } else {
        // Fallback to estimation if size not found (shouldn't happen)
        this.totalBytes -= this.estimateEnvelopeSize(env);
      }
    }
    return toFlush;
  }

  /**
   * Clear all envelopes (for testing)
   */
  clear(): void {
    this.envelopes = [];
    this.envelopeSizes.clear();
    this.totalBytes = 0;
    this.chainPrevHash = null;
    this.droppedCount = 0;
  }
}

/**
 * Global singleton instance
 */
let globalLogSink: LogSink | null = null;

/**
 * Initialize global log sink
 */
export function initializeLogSink(nodeId: string, policy?: RetentionPolicy): LogSink {
  if (globalLogSink) {
    throw new Error('LOG_SINK_ALREADY_INITIALIZED');
  }
  globalLogSink = new LogSink(nodeId, policy);
  console.log('📋 LogSink: Initialized globally');
  return globalLogSink;
}

/**
 * Get global log sink (throws if not initialized)
 */
export function getLogSink(): LogSink {
  if (!globalLogSink) {
    throw new Error('LOG_SINK_NOT_INITIALIZED: Call initializeLogSink() first');
  }
  return globalLogSink;
}

/**
 * Check if log sink is initialized
 */
export function isLogSinkInitialized(): boolean {
  return globalLogSink !== null;
}

/**
 * Reset global log sink (for testing only)
 * @internal
 */
export function resetLogSinkForTesting(): void {
  globalLogSink = null;
}
