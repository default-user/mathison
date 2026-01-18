/**
 * P4-B: Idempotency Ledger
 * Tracks request hashes to ensure idempotent write operations
 */

import * as crypto from 'crypto';

export interface IdempotentResponse {
  statusCode: number;
  body: unknown;
  receipt_id?: string;
}

export class IdempotencyLedger {
  private ledger: Map<string, IdempotentResponse> = new Map();

  /**
   * Generate stable request hash from route + normalized body + idempotency_key
   */
  static generateRequestHash(route: string, body: unknown, idempotencyKey: string): string {
    const normalized = JSON.stringify({
      route,
      body,
      idempotency_key: idempotencyKey
    });
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Check if request has been processed
   */
  get(requestHash: string): IdempotentResponse | undefined {
    return this.ledger.get(requestHash);
  }

  /**
   * Record request response for future idempotency checks
   */
  set(requestHash: string, response: IdempotentResponse): void {
    this.ledger.set(requestHash, response);
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.ledger.clear();
  }
}
