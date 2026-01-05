/**
 * P1.2: Security Posture Ladder
 *
 * Defines graduated security postures the system can adopt based on
 * detected threats or integrity failures.
 *
 * NORMAL → DEFENSIVE → FAIL_CLOSED
 *
 * Purpose: Allow degraded operation instead of hard brick, while
 * maintaining security when threats detected.
 */

export enum SecurityPosture {
  /**
   * NORMAL: Fully operational, all features enabled
   */
  NORMAL = 'NORMAL',

  /**
   * DEFENSIVE: Reduced surface area, read-only mode
   * Triggered by: transient failures, optional adapter down
   */
  DEFENSIVE = 'DEFENSIVE',

  /**
   * FAIL_CLOSED: Critical failure, all operations blocked
   * Triggered by: chain break, integrity failure, canary failure
   */
  FAIL_CLOSED = 'FAIL_CLOSED'
}

export interface PostureTransition {
  from: SecurityPosture;
  to: SecurityPosture;
  reason: string;
  timestamp: string;
  automatic: boolean; // True if automatic, false if manual override
}

export interface PosturePolicy {
  /**
   * Can write operations proceed in this posture?
   */
  allowWrites: boolean;

  /**
   * Can read operations proceed in this posture?
   */
  allowReads: boolean;

  /**
   * Can new connections/sessions be established?
   */
  allowNewConnections: boolean;

  /**
   * Human-readable description of restrictions
   */
  restrictions: string[];
}

/**
 * Posture policies for each state
 */
export const POSTURE_POLICIES: Record<SecurityPosture, PosturePolicy> = {
  [SecurityPosture.NORMAL]: {
    allowWrites: true,
    allowReads: true,
    allowNewConnections: true,
    restrictions: []
  },

  [SecurityPosture.DEFENSIVE]: {
    allowWrites: false,
    allowReads: true,
    allowNewConnections: true,
    restrictions: [
      'Writes disabled (read-only mode)',
      'Side-effect actions blocked',
      'Storage modifications denied'
    ]
  },

  [SecurityPosture.FAIL_CLOSED]: {
    allowWrites: false,
    allowReads: false,
    allowNewConnections: false,
    restrictions: [
      'All operations blocked',
      'System integrity compromised',
      'Manual intervention required'
    ]
  }
};

/**
 * Reasons for posture escalation
 */
export enum PostureEscalationReason {
  // DEFENSIVE triggers
  TRANSIENT_FAILURE = 'TRANSIENT_FAILURE', // Optional service down
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED', // Too many requests
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION', // Low memory/disk

  // FAIL_CLOSED triggers
  RECEIPT_CHAIN_BROKEN = 'RECEIPT_CHAIN_BROKEN', // Tamper detected
  INTEGRITY_FAILURE = 'INTEGRITY_FAILURE', // Module hash mismatch
  CANARY_FAILURE = 'CANARY_FAILURE', // Governance enforcement broken
  GENOME_INVALID = 'GENOME_INVALID', // Genome validation failed
  PREREQUISITE_FAILURE = 'PREREQUISITE_FAILURE', // Treaty/config missing
  MANUAL_OVERRIDE = 'MANUAL_OVERRIDE' // Manual emergency stop
}

/**
 * Posture manager - tracks and enforces security posture
 */
export class PostureManager {
  private currentPosture: SecurityPosture = SecurityPosture.NORMAL;
  private history: PostureTransition[] = [];
  private locked: boolean = false; // If true, posture cannot be downgraded

  /**
   * Get current security posture
   */
  getPosture(): SecurityPosture {
    return this.currentPosture;
  }

  /**
   * Get policy for current posture
   */
  getPolicy(): PosturePolicy {
    return POSTURE_POLICIES[this.currentPosture];
  }

  /**
   * Get posture transition history
   */
  getHistory(): PostureTransition[] {
    return [...this.history];
  }

  /**
   * Check if posture is locked (cannot downgrade)
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Escalate to DEFENSIVE posture
   */
  escalateToDefensive(reason: PostureEscalationReason, automatic: boolean = true): void {
    if (this.currentPosture === SecurityPosture.FAIL_CLOSED) {
      console.warn('⚠️  Cannot escalate to DEFENSIVE - already in FAIL_CLOSED');
      return;
    }

    if (this.currentPosture === SecurityPosture.DEFENSIVE) {
      console.warn('⚠️  Already in DEFENSIVE posture');
      return;
    }

    this.transition(SecurityPosture.DEFENSIVE, reason, automatic);
  }

  /**
   * Escalate to FAIL_CLOSED posture (critical failure)
   */
  escalateToFailClosed(reason: PostureEscalationReason, automatic: boolean = true, lock: boolean = true): void {
    this.transition(SecurityPosture.FAIL_CLOSED, reason, automatic);

    if (lock) {
      this.locked = true;
      console.error('🔒 Posture LOCKED at FAIL_CLOSED - manual intervention required');
    }
  }

  /**
   * Attempt to downgrade posture (may be blocked if locked)
   */
  downgrade(to: SecurityPosture, reason: string, manual: boolean = true): boolean {
    if (this.locked) {
      console.error('❌ Cannot downgrade posture - locked at FAIL_CLOSED');
      return false;
    }

    // Can only downgrade, not escalate
    const currentSeverity = this.getPostureSeverity(this.currentPosture);
    const targetSeverity = this.getPostureSeverity(to);

    if (targetSeverity > currentSeverity) {
      console.error('❌ Cannot use downgrade() to escalate - use escalateToDefensive/escalateToFailClosed');
      return false;
    }

    this.transition(to, reason, !manual);
    return true;
  }

  /**
   * Unlock posture (allows downgrade from FAIL_CLOSED)
   * Requires manual intervention / operator approval
   */
  unlock(authToken?: string): boolean {
    // In production, would verify authToken
    // For now, just log and unlock
    console.warn('🔓 Posture UNLOCKED - manual override');
    this.locked = false;
    return true;
  }

  /**
   * Reset to NORMAL posture (only if unlocked)
   */
  reset(reason: string, manual: boolean = true): boolean {
    return this.downgrade(SecurityPosture.NORMAL, reason, manual);
  }

  /**
   * Get numeric severity of posture (for comparison)
   */
  private getPostureSeverity(posture: SecurityPosture): number {
    switch (posture) {
      case SecurityPosture.NORMAL:
        return 0;
      case SecurityPosture.DEFENSIVE:
        return 1;
      case SecurityPosture.FAIL_CLOSED:
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Internal transition method
   */
  private transition(to: SecurityPosture, reason: string, automatic: boolean): void {
    const from = this.currentPosture;

    if (from === to) {
      return;
    }

    const transition: PostureTransition = {
      from,
      to,
      reason,
      timestamp: new Date().toISOString(),
      automatic
    };

    this.history.push(transition);
    this.currentPosture = to;

    // Log transition
    const arrow = this.getPostureSeverity(to) > this.getPostureSeverity(from) ? '⬆️' : '⬇️';
    console.log(`${arrow} Posture transition: ${from} → ${to} (${reason})`);
  }

  /**
   * Check if an operation is allowed in current posture
   */
  isOperationAllowed(operation: 'read' | 'write' | 'connect'): boolean {
    const policy = this.getPolicy();

    switch (operation) {
      case 'read':
        return policy.allowReads;
      case 'write':
        return policy.allowWrites;
      case 'connect':
        return policy.allowNewConnections;
      default:
        return false;
    }
  }

  /**
   * Assert operation is allowed (throws if not)
   */
  assertOperationAllowed(operation: 'read' | 'write' | 'connect'): void {
    if (!this.isOperationAllowed(operation)) {
      const policy = this.getPolicy();
      throw new Error(
        `POSTURE_VIOLATION: ${operation} operation not allowed in ${this.currentPosture} posture. ` +
        `Restrictions: ${policy.restrictions.join('; ')}`
      );
    }
  }
}

/**
 * Global posture manager instance
 */
let globalPostureManager: PostureManager | null = null;

/**
 * Initialize global posture manager
 */
export function initializePostureManager(): PostureManager {
  if (!globalPostureManager) {
    globalPostureManager = new PostureManager();
    console.log('🛡️  Posture Manager initialized (posture: NORMAL)');
  }
  return globalPostureManager;
}

/**
 * Get global posture manager (throws if not initialized)
 */
export function getPostureManager(): PostureManager {
  if (!globalPostureManager) {
    throw new Error('POSTURE_NOT_INITIALIZED: Call initializePostureManager() first');
  }
  return globalPostureManager;
}
