/**
 * P0.4: Action Registry Tests
 */

import {
  actionRegistry,
  validateActionId,
  hasSideEffects,
  getActionRisk,
  RiskClass
} from '../action-registry';

describe('Action Registry - P0.4', () => {
  describe('Registry lookup', () => {
    it('should find registered action', () => {
      const action = actionRegistry.get('action:read:genome');

      expect(action).toBeDefined();
      expect(action?.id).toBe('action:read:genome');
      expect(action?.risk_class).toBe(RiskClass.LOW);
      expect(action?.side_effect).toBe(false);
    });

    it('should return null for unregistered action', () => {
      const action = actionRegistry.get('action:nonexistent');

      expect(action).toBeNull();
    });

    it('should check if action is registered', () => {
      expect(actionRegistry.isRegistered('action:read:genome')).toBe(true);
      expect(actionRegistry.isRegistered('action:nonexistent')).toBe(false);
    });
  });

  describe('Action validation', () => {
    it('should validate registered action', () => {
      const action = validateActionId('action:read:genome');

      expect(action).toBeDefined();
      expect(action.id).toBe('action:read:genome');
    });

    it('should throw on unregistered action', () => {
      expect(() => validateActionId('action:nonexistent')).toThrow('UNREGISTERED_ACTION');
    });
  });

  describe('Side effect checking', () => {
    it('should identify read actions as no side effects', () => {
      expect(hasSideEffects('action:read:genome')).toBe(false);
      expect(hasSideEffects('action:read:treaty')).toBe(false);
      expect(hasSideEffects('action:read:config')).toBe(false);
    });

    it('should identify write actions as having side effects', () => {
      expect(hasSideEffects('action:write:adapter_config')).toBe(true);
      expect(hasSideEffects('action:write:receipt')).toBe(true);
      expect(hasSideEffects('action:write:storage')).toBe(true);
    });

    it('should return false for unregistered action', () => {
      expect(hasSideEffects('action:nonexistent')).toBe(false);
    });
  });

  describe('Risk classification', () => {
    it('should return risk class for action', () => {
      expect(getActionRisk('action:read:genome')).toBe(RiskClass.LOW);
      expect(getActionRisk('action:write:adapter_config')).toBe(RiskClass.HIGH);
      expect(getActionRisk('action:governance:seal_storage')).toBe(RiskClass.CRITICAL);
    });

    it('should return null for unregistered action', () => {
      expect(getActionRisk('action:nonexistent')).toBeNull();
    });
  });

  describe('Registry queries', () => {
    it('should list all actions', () => {
      const actions = actionRegistry.listAll();

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every(a => a.id && a.risk_class)).toBe(true);
    });

    it('should filter by risk class', () => {
      const criticalActions = actionRegistry.listByRiskClass(RiskClass.CRITICAL);

      expect(criticalActions.length).toBeGreaterThan(0);
      expect(criticalActions.every(a => a.risk_class === RiskClass.CRITICAL)).toBe(true);
    });

    it('should list actions with side effects', () => {
      const sideEffectActions = actionRegistry.listSideEffects();

      expect(sideEffectActions.length).toBeGreaterThan(0);
      expect(sideEffectActions.every(a => a.side_effect === true)).toBe(true);
    });
  });

  describe('Action definitions', () => {
    it('should have all required fields', () => {
      const action = actionRegistry.get('action:read:genome');

      expect(action).toBeDefined();
      expect(action?.id).toBeDefined();
      expect(action?.risk_class).toBeDefined();
      expect(typeof action?.side_effect).toBe('boolean');
      expect(action?.description).toBeDefined();
      expect(typeof action?.requires_governance).toBe('boolean');
    });

    it('should require governance for all actions', () => {
      const actions = actionRegistry.listAll();

      expect(actions.every(a => a.requires_governance === true)).toBe(true);
    });
  });
});
