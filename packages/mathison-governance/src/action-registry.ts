/**
 * P0.4: Action Registry
 *
 * Single source of truth for all valid actions in the system
 * Each action has a canonical ID, risk classification, and side-effect flag
 *
 * Purpose: Close dual-check divergence - CIF and CDI both reference this registry
 */

export enum RiskClass {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface ActionDefinition {
  id: string;
  risk_class: RiskClass;
  side_effect: boolean; // true for writes, false for reads
  description: string;
  requires_governance: boolean; // All actions require governance in Mathison
}

/**
 * Canonical action registry
 * All valid actions MUST be registered here
 */
const ACTION_DEFINITIONS: ActionDefinition[] = [
  // Read actions (LOW risk, no side effects)
  {
    id: 'action:read:genome',
    risk_class: RiskClass.LOW,
    side_effect: false,
    description: 'Read OI genome configuration',
    requires_governance: true
  },
  {
    id: 'action:read:treaty',
    risk_class: RiskClass.LOW,
    side_effect: false,
    description: 'Read governance treaty document',
    requires_governance: true
  },
  {
    id: 'action:read:config',
    risk_class: RiskClass.LOW,
    side_effect: false,
    description: 'Read governance configuration',
    requires_governance: true
  },
  {
    id: 'action:read:receipts',
    risk_class: RiskClass.MEDIUM,
    side_effect: false,
    description: 'Read governance receipts',
    requires_governance: true
  },
  {
    id: 'action:read:health',
    risk_class: RiskClass.LOW,
    side_effect: false,
    description: 'Read system health status',
    requires_governance: true
  },

  // Write actions (MEDIUM-HIGH risk, has side effects)
  {
    id: 'action:write:adapter_config',
    risk_class: RiskClass.HIGH,
    side_effect: true,
    description: 'Modify storage adapter configuration',
    requires_governance: true
  },
  {
    id: 'action:write:receipt',
    risk_class: RiskClass.MEDIUM,
    side_effect: true,
    description: 'Append governance receipt',
    requires_governance: true
  },
  {
    id: 'action:write:storage',
    risk_class: RiskClass.HIGH,
    side_effect: true,
    description: 'Write to storage backend',
    requires_governance: true
  },

  // Governance actions (HIGH-CRITICAL risk)
  {
    id: 'action:governance:validate',
    risk_class: RiskClass.HIGH,
    side_effect: false,
    description: 'Validate governance prerequisites',
    requires_governance: true
  },
  {
    id: 'action:governance:seal_storage',
    risk_class: RiskClass.CRITICAL,
    side_effect: true,
    description: 'Seal storage (prevents direct adapter creation)',
    requires_governance: true
  },
  {
    id: 'action:governance:mint_token',
    risk_class: RiskClass.CRITICAL,
    side_effect: true,
    description: 'Mint capability token',
    requires_governance: true
  },

  // HTTP handler actions
  {
    id: 'action:http:handle_request',
    risk_class: RiskClass.MEDIUM,
    side_effect: false, // Side effects determined by nested action
    description: 'Handle HTTP request through governance pipeline',
    requires_governance: true
  },

  // Knowledge ingestion actions
  {
    id: 'action:knowledge:ingest',
    risk_class: RiskClass.HIGH,
    side_effect: true,
    description: 'Ingest grounded knowledge claims via CPACK',
    requires_governance: true
  },
  {
    id: 'action:knowledge:read_claim',
    risk_class: RiskClass.LOW,
    side_effect: false,
    description: 'Read knowledge claim by ID',
    requires_governance: true
  },
  {
    id: 'action:knowledge:read_conflicts',
    risk_class: RiskClass.MEDIUM,
    side_effect: false,
    description: 'Read knowledge conflicts',
    requires_governance: true
  },
  {
    id: 'action:knowledge:fetch_chunk',
    risk_class: RiskClass.LOW,
    side_effect: false,
    description: 'Fetch chunk for verification',
    requires_governance: true
  }
];

/**
 * Action registry singleton
 */
class ActionRegistry {
  private actions: Map<string, ActionDefinition> = new Map();

  constructor() {
    // Populate registry from definitions
    for (const action of ACTION_DEFINITIONS) {
      this.actions.set(action.id, action);
    }
  }

  /**
   * Get action definition by ID
   */
  get(actionId: string): ActionDefinition | null {
    return this.actions.get(actionId) || null;
  }

  /**
   * Check if action is registered
   */
  isRegistered(actionId: string): boolean {
    return this.actions.has(actionId);
  }

  /**
   * Validate action ID (throws if unregistered)
   */
  validate(actionId: string): ActionDefinition {
    const action = this.get(actionId);
    if (!action) {
      throw new Error(`UNREGISTERED_ACTION: Action ID "${actionId}" not found in registry`);
    }
    return action;
  }

  /**
   * List all registered actions
   */
  listAll(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /**
   * List actions by risk class
   */
  listByRiskClass(riskClass: RiskClass): ActionDefinition[] {
    return this.listAll().filter(a => a.risk_class === riskClass);
  }

  /**
   * List actions with side effects
   */
  listSideEffects(): ActionDefinition[] {
    return this.listAll().filter(a => a.side_effect);
  }
}

/**
 * Global action registry instance
 */
export const actionRegistry = new ActionRegistry();

/**
 * Validate action ID (convenience function)
 */
export function validateActionId(actionId: string): ActionDefinition {
  return actionRegistry.validate(actionId);
}

/**
 * Check if action has side effects
 */
export function hasSideEffects(actionId: string): boolean {
  const action = actionRegistry.get(actionId);
  return action?.side_effect ?? false;
}

/**
 * Get action risk class
 */
export function getActionRisk(actionId: string): RiskClass | null {
  const action = actionRegistry.get(actionId);
  return action?.risk_class || null;
}
