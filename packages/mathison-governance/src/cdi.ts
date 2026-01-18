// WHY: CDI gates decisions with policy checks before and after actions

import { CDIDecision, AuthorityConfig } from './types';
import { getAuthorityConfig } from './authority';

/**
 * WHY: Context shape for CDI operations with namespace awareness
 */
export interface CDIContext {
  source_namespace_id: string;
  target_namespace_id?: string;
  actor_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * WHY: Check if an operation crosses namespace boundaries.
 * Default-deny cross-namespace operations unless explicitly allowed.
 */
export function isCrossNamespaceOperation(context: CDIContext): boolean {
  // WHY: If no target namespace, it's same-namespace by definition
  if (!context.target_namespace_id) {
    return false;
  }
  return context.source_namespace_id !== context.target_namespace_id;
}

/**
 * WHY: Evaluate whether cross-namespace operations are permitted.
 * Uses authority config to determine if cross-namespace is allowed.
 */
export function evaluateCrossNamespacePolicy(
  context: CDIContext,
  config: AuthorityConfig
): CDIDecision {
  // WHY: Same-namespace operations always allowed at this check level
  if (!isCrossNamespaceOperation(context)) {
    return {
      allowed: true,
      reason: 'Same-namespace operation permitted',
    };
  }

  // WHY: Cross-namespace denied by default unless explicitly allowed in config
  if (!config.default_permissions.allow_cross_namespace_transfer) {
    return {
      allowed: false,
      reason: `Cross-namespace operation denied: ${context.source_namespace_id} -> ${context.target_namespace_id}`,
    };
  }

  return {
    allowed: true,
    reason: 'Cross-namespace explicitly permitted by authority config',
  };
}

/**
 * WHY: Pre-action CDI check enforces default-deny cross-namespace policy.
 */
export async function checkCDI(action: string, context: CDIContext): Promise<CDIDecision> {
  const config = getAuthorityConfig();

  // WHY: Evaluate cross-namespace policy first (default-deny rule)
  const crossNamespaceDecision = evaluateCrossNamespacePolicy(context, config);
  if (!crossNamespaceDecision.allowed) {
    return crossNamespaceDecision;
  }

  // Basic permission checks by action type
  if (action === 'create_thread' && !config.default_permissions.allow_thread_creation) {
    return {
      allowed: false,
      reason: 'Thread creation not permitted by default permissions',
    };
  }

  if (action === 'create_namespace' && !config.default_permissions.allow_namespace_creation) {
    return {
      allowed: false,
      reason: 'Namespace creation not permitted by default permissions',
    };
  }

  // WHY: Explicit cross_namespace_transfer action type checked for compatibility
  if (action === 'cross_namespace_transfer' && !config.default_permissions.allow_cross_namespace_transfer) {
    return {
      allowed: false,
      reason: 'Cross-namespace transfer not permitted by default permissions',
    };
  }

  return {
    allowed: true,
    reason: 'Permitted by policy',
  };
}

/**
 * WHY: Post-action CDI check verifies output doesn't violate policy
 */
export async function checkCDIPostAction(
  action: string,
  context: any,
  result: any
): Promise<CDIDecision> {
  // TODO: Implement post-action checks
  // TODO: Verify no cross-namespace leakage
  // TODO: Check result against policy
  
  return {
    allowed: true,
    reason: 'Post-action check not yet implemented',
  };
}
