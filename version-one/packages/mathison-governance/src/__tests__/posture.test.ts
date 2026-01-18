/**
 * P1.2: Security Posture Tests
 */

import {
  SecurityPosture,
  PostureEscalationReason,
  POSTURE_POLICIES,
  PostureManager
} from '../posture';

describe('Security Posture - P1.2', () => {
  let manager: PostureManager;

  beforeEach(() => {
    manager = new PostureManager();
  });

  describe('Posture policies', () => {
    it('should define NORMAL policy', () => {
      const policy = POSTURE_POLICIES[SecurityPosture.NORMAL];

      expect(policy.allowWrites).toBe(true);
      expect(policy.allowReads).toBe(true);
      expect(policy.allowNewConnections).toBe(true);
      expect(policy.restrictions).toEqual([]);
    });

    it('should define DEFENSIVE policy', () => {
      const policy = POSTURE_POLICIES[SecurityPosture.DEFENSIVE];

      expect(policy.allowWrites).toBe(false);
      expect(policy.allowReads).toBe(true);
      expect(policy.allowNewConnections).toBe(true);
      expect(policy.restrictions.length).toBeGreaterThan(0);
    });

    it('should define FAIL_CLOSED policy', () => {
      const policy = POSTURE_POLICIES[SecurityPosture.FAIL_CLOSED];

      expect(policy.allowWrites).toBe(false);
      expect(policy.allowReads).toBe(false);
      expect(policy.allowNewConnections).toBe(false);
      expect(policy.restrictions.length).toBeGreaterThan(0);
    });
  });

  describe('Initial state', () => {
    it('should start in NORMAL posture', () => {
      expect(manager.getPosture()).toBe(SecurityPosture.NORMAL);
    });

    it('should not be locked initially', () => {
      expect(manager.isLocked()).toBe(false);
    });

    it('should have empty history initially', () => {
      expect(manager.getHistory()).toEqual([]);
    });
  });

  describe('Escalation to DEFENSIVE', () => {
    it('should escalate from NORMAL to DEFENSIVE', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);

      expect(manager.getPosture()).toBe(SecurityPosture.DEFENSIVE);
      expect(manager.getHistory().length).toBe(1);
      expect(manager.getHistory()[0].from).toBe(SecurityPosture.NORMAL);
      expect(manager.getHistory()[0].to).toBe(SecurityPosture.DEFENSIVE);
    });

    it('should not escalate if already in DEFENSIVE', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);
      manager.escalateToDefensive(PostureEscalationReason.RATE_LIMIT_EXCEEDED);

      expect(manager.getHistory().length).toBe(1); // Only one transition
    });

    it('should not escalate if in FAIL_CLOSED', () => {
      manager.escalateToFailClosed(PostureEscalationReason.INTEGRITY_FAILURE);
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);

      expect(manager.getPosture()).toBe(SecurityPosture.FAIL_CLOSED);
      expect(manager.getHistory().length).toBe(1); // Only FAIL_CLOSED transition
    });
  });

  describe('Escalation to FAIL_CLOSED', () => {
    it('should escalate from NORMAL to FAIL_CLOSED', () => {
      manager.escalateToFailClosed(PostureEscalationReason.RECEIPT_CHAIN_BROKEN);

      expect(manager.getPosture()).toBe(SecurityPosture.FAIL_CLOSED);
      expect(manager.isLocked()).toBe(true);
    });

    it('should escalate from DEFENSIVE to FAIL_CLOSED', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);
      manager.escalateToFailClosed(PostureEscalationReason.CANARY_FAILURE);

      expect(manager.getPosture()).toBe(SecurityPosture.FAIL_CLOSED);
      expect(manager.getHistory().length).toBe(2);
    });

    it('should lock posture by default', () => {
      manager.escalateToFailClosed(PostureEscalationReason.INTEGRITY_FAILURE);

      expect(manager.isLocked()).toBe(true);
    });

    it('should optionally not lock posture', () => {
      manager.escalateToFailClosed(PostureEscalationReason.MANUAL_OVERRIDE, true, false);

      expect(manager.getPosture()).toBe(SecurityPosture.FAIL_CLOSED);
      expect(manager.isLocked()).toBe(false);
    });
  });

  describe('Downgrading posture', () => {
    it('should downgrade from DEFENSIVE to NORMAL', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);
      const success = manager.downgrade(SecurityPosture.NORMAL, 'Issue resolved');

      expect(success).toBe(true);
      expect(manager.getPosture()).toBe(SecurityPosture.NORMAL);
    });

    it('should not downgrade if locked', () => {
      manager.escalateToFailClosed(PostureEscalationReason.INTEGRITY_FAILURE);
      const success = manager.downgrade(SecurityPosture.NORMAL, 'Attempt to recover');

      expect(success).toBe(false);
      expect(manager.getPosture()).toBe(SecurityPosture.FAIL_CLOSED);
    });

    it('should reject downgrade that is actually an escalation', () => {
      const success = manager.downgrade(SecurityPosture.FAIL_CLOSED, 'Invalid');

      expect(success).toBe(false);
      expect(manager.getPosture()).toBe(SecurityPosture.NORMAL);
    });
  });

  describe('Unlocking', () => {
    it('should unlock locked posture', () => {
      manager.escalateToFailClosed(PostureEscalationReason.INTEGRITY_FAILURE);
      expect(manager.isLocked()).toBe(true);

      const success = manager.unlock();

      expect(success).toBe(true);
      expect(manager.isLocked()).toBe(false);
    });

    it('should allow downgrade after unlock', () => {
      manager.escalateToFailClosed(PostureEscalationReason.INTEGRITY_FAILURE);
      manager.unlock();

      const success = manager.downgrade(SecurityPosture.NORMAL, 'Manual recovery');

      expect(success).toBe(true);
      expect(manager.getPosture()).toBe(SecurityPosture.NORMAL);
    });
  });

  describe('Operation permissions', () => {
    it('should allow all operations in NORMAL', () => {
      expect(manager.isOperationAllowed('read')).toBe(true);
      expect(manager.isOperationAllowed('write')).toBe(true);
      expect(manager.isOperationAllowed('connect')).toBe(true);
    });

    it('should block writes in DEFENSIVE', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);

      expect(manager.isOperationAllowed('read')).toBe(true);
      expect(manager.isOperationAllowed('write')).toBe(false);
      expect(manager.isOperationAllowed('connect')).toBe(true);
    });

    it('should block all operations in FAIL_CLOSED', () => {
      manager.escalateToFailClosed(PostureEscalationReason.CANARY_FAILURE);

      expect(manager.isOperationAllowed('read')).toBe(false);
      expect(manager.isOperationAllowed('write')).toBe(false);
      expect(manager.isOperationAllowed('connect')).toBe(false);
    });

    it('should assert allowed operations', () => {
      expect(() => manager.assertOperationAllowed('write')).not.toThrow();
    });

    it('should throw on denied operations', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);

      expect(() => manager.assertOperationAllowed('write')).toThrow('POSTURE_VIOLATION');
    });
  });

  describe('Transition history', () => {
    it('should record all transitions', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);
      manager.escalateToFailClosed(PostureEscalationReason.CANARY_FAILURE);

      const history = manager.getHistory();

      expect(history.length).toBe(2);
      expect(history[0].to).toBe(SecurityPosture.DEFENSIVE);
      expect(history[1].to).toBe(SecurityPosture.FAIL_CLOSED);
    });

    it('should include timestamps', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);

      const history = manager.getHistory();

      expect(history[0].timestamp).toBeDefined();
      expect(new Date(history[0].timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should track automatic vs manual transitions', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE, true);
      manager.unlock();
      manager.downgrade(SecurityPosture.NORMAL, 'Manual', true);

      const history = manager.getHistory();

      expect(history[0].automatic).toBe(true);
      expect(history[1].automatic).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset to NORMAL if not locked', () => {
      manager.escalateToDefensive(PostureEscalationReason.TRANSIENT_FAILURE);
      const success = manager.reset('Recovery complete');

      expect(success).toBe(true);
      expect(manager.getPosture()).toBe(SecurityPosture.NORMAL);
    });

    it('should fail to reset if locked', () => {
      manager.escalateToFailClosed(PostureEscalationReason.INTEGRITY_FAILURE);
      const success = manager.reset('Attempt recovery');

      expect(success).toBe(false);
      expect(manager.getPosture()).toBe(SecurityPosture.FAIL_CLOSED);
    });
  });
});
