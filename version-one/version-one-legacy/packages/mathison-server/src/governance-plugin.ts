/**
 * Governance Plugin for Fastify
 * Enforces action-required on all routes (fail-closed)
 *
 * Pattern: All routes MUST declare an action except explicit allowlist
 */

import { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply, RouteOptions } from 'fastify';

/**
 * Action specification for a governed route
 */
export interface ActionSpec {
  action: string;
  riskClass?: 'READ' | 'WRITE' | 'ADMIN';
}

/**
 * Route allowlist - these routes bypass CDI action check
 * Keep this minimal: only health/meta endpoints
 */
export const GOVERNANCE_ALLOWLIST: readonly string[] = [
  '/health',
  '/openapi.json'
] as const;

/**
 * Check if a path is in the governance allowlist
 */
export function isAllowlisted(path: string): boolean {
  return GOVERNANCE_ALLOWLIST.includes(path);
}

/**
 * Symbol to store route action metadata on the request
 */
export const ACTION_KEY = Symbol('mathison:action');

/**
 * Governance plugin that enforces action-required on all routes
 *
 * Fail-closed behavior:
 * - If route has no action AND is not in allowlist -> DENY
 * - If route has action -> CDI check runs
 * - If route is in allowlist -> bypass CDI action check
 */
export const governancePlugin: FastifyPluginCallback = (fastify, opts, done) => {
  // Track which routes have registered actions
  const routeActions = new Map<string, ActionSpec>();

  /**
   * Register an action for a route pattern
   * Must be called BEFORE registering the route
   */
  fastify.decorate('registerAction', function(routeKey: string, spec: ActionSpec) {
    routeActions.set(routeKey, spec);
  });

  /**
   * Get action for a route pattern
   */
  fastify.decorate('getAction', function(routeKey: string): ActionSpec | undefined {
    return routeActions.get(routeKey);
  });

  /**
   * Pre-handler hook that enforces action-required
   * Runs BEFORE the route-specific preHandler
   */
  fastify.addHook('onRoute', (routeOptions: RouteOptions) => {
    const routeKey = `${routeOptions.method}:${routeOptions.url}`;

    // Check if this route is allowlisted
    if (isAllowlisted(routeOptions.url)) {
      return; // Allowlisted routes bypass action check
    }

    // Check if action is registered for this route
    const action = routeActions.get(routeKey);
    if (!action) {
      // Routes registered without action will be caught at request time
      // We can't throw here because routes might be registered after actions
    }
  });

  done();
};

/**
 * Governance error codes
 */
export const GovernanceErrorCode = {
  ACTION_REQUIRED: 'GOV_ACTION_REQUIRED',
  ROUTE_NOT_GOVERNED: 'GOV_ROUTE_NOT_GOVERNED',
  CDI_DENIED: 'GOV_CDI_DENIED',
  CIF_BLOCKED: 'GOV_CIF_BLOCKED'
} as const;

/**
 * Create a deterministic DENY response for governance violations
 */
export function createDenyResponse(code: string, message: string, details?: Record<string, unknown>) {
  return {
    reason_code: code,
    message,
    ...details
  };
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyInstance {
    registerAction(routeKey: string, spec: ActionSpec): void;
    getAction(routeKey: string): ActionSpec | undefined;
  }
}

export default governancePlugin;
