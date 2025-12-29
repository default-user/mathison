/**
 * P3-B: Stable reason codes for governance decisions
 * LOCKED: Do not modify without treaty amendment
 */

export enum GovernanceReasonCode {
  // Treaty/governance failures
  TREATY_UNAVAILABLE = 'TREATY_UNAVAILABLE',
  GOVERNANCE_INIT_FAILED = 'GOVERNANCE_INIT_FAILED',

  // Storage failures
  STORE_MISCONFIGURED = 'STORE_MISCONFIGURED',
  STORE_INIT_FAILED = 'STORE_INIT_FAILED',

  // Consent violations (Tiriti Rule 2)
  CONSENT_STOP_ACTIVE = 'CONSENT_STOP_ACTIVE',
  CONSENT_NOT_GRANTED = 'CONSENT_NOT_GRANTED',

  // CIF violations
  CIF_INGRESS_BLOCKED = 'CIF_INGRESS_BLOCKED',
  CIF_QUARANTINED = 'CIF_QUARANTINED',
  CIF_RATE_LIMITED = 'CIF_RATE_LIMITED',
  CIF_EGRESS_BLOCKED = 'CIF_EGRESS_BLOCKED',
  CIF_LEAK_DETECTED = 'CIF_LEAK_DETECTED',

  // CDI violations
  CDI_ACTION_DENIED = 'CDI_ACTION_DENIED',
  CDI_OUTPUT_BLOCKED = 'CDI_OUTPUT_BLOCKED',
  CDI_HIVE_FORBIDDEN = 'CDI_HIVE_FORBIDDEN',
  CDI_PERSONHOOD_VIOLATION = 'CDI_PERSONHOOD_VIOLATION',

  // Fail-closed (Tiriti Rule 10)
  UNCERTAIN_FAIL_CLOSED = 'UNCERTAIN_FAIL_CLOSED',
  GOVERNANCE_DENY = 'GOVERNANCE_DENY',

  // Operational
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  ACTION_GATE_BYPASS_ATTEMPT = 'ACTION_GATE_BYPASS_ATTEMPT',
  MALFORMED_REQUEST = 'MALFORMED_REQUEST'
}

export type GovernanceDecision = 'ALLOW' | 'DENY' | 'TRANSFORM';

export interface GovernanceResult {
  decision: GovernanceDecision;
  reasonCode?: GovernanceReasonCode;
  message: string;
  transformedPayload?: unknown;
  suggestedAlternative?: string;
}
