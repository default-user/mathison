/**
 * WHY: cdi.ts - Conscience Decision Interface for action and output checks
 * -----------------------------------------------------------------------------
 * - Implements permission checks (stage 3) and output validation (stage 5) of pipeline
 * - Needed to enforce governance decisions at runtime; gates all actions and responses
 * - Enforces: default-deny for cross-namespace ops; strict per-OI boundaries; output redaction
 * - Tradeoff: Per-request permission checks vs caching; security over performance
 */

import { v4 as uuidv4 } from 'uuid';
import {
  CdiContext,
  CdiDecision,
  CapabilityTokenData,
  RedactionRuleData,
  AuthorityConfig,
  GovernanceCapsule,
} from './types';
import { GovernanceCapsuleLoader } from './capsule';

// ============================================================================
// CDI Context Helpers
// ============================================================================

/**
 * Check if this is a cross-namespace operation
 */
export function isCrossNamespaceOperation(context: CdiContext): boolean {
  if (!context.target_namespace_id) {
    return false;
  }
  return context.source_namespace_id !== context.target_namespace_id;
}

// ============================================================================
// CDI Action Checker
// ============================================================================

/**
 * CDI action checker - verifies permissions for actions
 */
export class CdiActionChecker {
  private capsuleLoader: GovernanceCapsuleLoader;

  constructor(capsuleLoader: GovernanceCapsuleLoader) {
    this.capsuleLoader = capsuleLoader;
  }

  /**
   * Check if an action is allowed
   */
  async checkAction(
    action: string,
    context: CdiContext,
    riskClass: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk',
    requestedCapabilities: string[]
  ): Promise<CdiDecision> {
    // First check capsule status and degrade ladder
    const capsuleAllowed = this.capsuleLoader.isActionAllowed(riskClass);
    if (!capsuleAllowed.allowed) {
      return {
        allowed: false,
        reason: capsuleAllowed.reason,
      };
    }

    // Check for cross-namespace operation
    if (isCrossNamespaceOperation(context)) {
      return this.handleCrossNamespaceAction(action, context);
    }

    // Check against authority config
    const authority = this.capsuleLoader.getAuthority();
    if (authority) {
      const permissionCheck = this.checkAuthorityPermissions(action, authority);
      if (!permissionCheck.allowed) {
        return permissionCheck;
      }
    }

    // Check against capsule constraints
    const capsule = this.capsuleLoader.getCapsule();
    if (capsule) {
      const capsuleCheck = this.checkCapsuleConstraints(action, capsule, requestedCapabilities);
      if (!capsuleCheck.allowed) {
        return capsuleCheck;
      }
    }

    // Generate capability tokens for allowed actions
    const capabilityTokens = this.generateCapabilityTokens(
      context,
      action,
      requestedCapabilities
    );

    return {
      allowed: true,
      reason: 'Action allowed',
      capability_tokens: capabilityTokens,
    };
  }

  /**
   * Handle cross-namespace action (default-deny)
   */
  private handleCrossNamespaceAction(
    action: string,
    context: CdiContext
  ): CdiDecision {
    // Check if authority allows cross-namespace transfer
    const authority = this.capsuleLoader.getAuthority();
    if (!authority?.default_permissions.allow_cross_namespace_transfer) {
      return {
        allowed: false,
        reason: `Cross-namespace operation denied: ${context.source_namespace_id} -> ${context.target_namespace_id}. ` +
          'Cross-namespace transfers are not permitted by authority config.',
      };
    }

    // Check if capsule allows cross-namespace envelope
    const capsule = this.capsuleLoader.getCapsule();
    if (!capsule?.genome.capabilities.cross_namespace_envelope) {
      return {
        allowed: false,
        reason: `Cross-namespace operation denied: ${context.source_namespace_id} -> ${context.target_namespace_id}. ` +
          'Capsule does not permit cross-namespace envelope.',
      };
    }

    // If explicitly allowed, permit but require confirmation
    return {
      allowed: true,
      reason: 'Cross-namespace operation allowed via explicit envelope',
      requires_confirmation: true,
    };
  }

  /**
   * Check authority configuration permissions
   */
  private checkAuthorityPermissions(
    action: string,
    authority: AuthorityConfig
  ): CdiDecision {
    const perms = authority.default_permissions;

    // Map actions to permissions
    if (action.includes('thread') && action.includes('create')) {
      if (!perms.allow_thread_creation) {
        return {
          allowed: false,
          reason: 'Thread creation not permitted by authority config',
        };
      }
    }

    if (action.includes('namespace') && action.includes('create')) {
      if (!perms.allow_namespace_creation) {
        return {
          allowed: false,
          reason: 'Namespace creation not permitted by authority config',
        };
      }
    }

    if (action.includes('model') || action.includes('invoke_model')) {
      if (!perms.allow_model_invocation) {
        return {
          allowed: false,
          reason: 'Model invocation not permitted by authority config',
        };
      }
    }

    if (action.includes('tool') || action.includes('invoke_tool')) {
      if (!perms.allow_tool_invocation) {
        return {
          allowed: false,
          reason: 'Tool invocation not permitted by authority config',
        };
      }
    }

    return { allowed: true, reason: 'Authority permissions satisfied' };
  }

  /**
   * Check capsule constraints
   */
  private checkCapsuleConstraints(
    action: string,
    capsule: GovernanceCapsule,
    requestedCapabilities: string[]
  ): CdiDecision {
    const genome = capsule.genome.capabilities;

    // Check memory operations
    if (action.includes('memory_read') || action.includes('get') || action.includes('query')) {
      if (!genome.memory_read) {
        return {
          allowed: false,
          reason: 'Memory read not permitted by capsule genome',
        };
      }
    }

    if (action.includes('memory_write') || action.includes('create') || action.includes('update')) {
      if (!genome.memory_write) {
        return {
          allowed: false,
          reason: 'Memory write not permitted by capsule genome',
        };
      }
    }

    // Check model invocation
    if (requestedCapabilities.includes('model_invocation')) {
      if (!genome.model_invocation) {
        return {
          allowed: false,
          reason: 'Model invocation not permitted by capsule genome',
        };
      }
    }

    // Check tool invocation
    if (requestedCapabilities.includes('tool_invocation')) {
      if (!genome.tool_invocation) {
        return {
          allowed: false,
          reason: 'Tool invocation not permitted by capsule genome',
        };
      }
    }

    return { allowed: true, reason: 'Capsule constraints satisfied' };
  }

  /**
   * Generate capability tokens for authorized operations
   */
  private generateCapabilityTokens(
    context: CdiContext,
    action: string,
    requestedCapabilities: string[]
  ): CapabilityTokenData[] {
    const tokens: CapabilityTokenData[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute expiry

    // Generate token for the action itself
    tokens.push({
      token_id: uuidv4(),
      capability: action,
      oi_id: context.source_namespace_id,
      principal_id: context.actor_id || 'unknown',
      expires_at: expiresAt,
      constraints: {},
    });

    // Generate tokens for requested capabilities
    for (const cap of requestedCapabilities) {
      tokens.push({
        token_id: uuidv4(),
        capability: cap,
        oi_id: context.source_namespace_id,
        principal_id: context.actor_id || 'unknown',
        expires_at: expiresAt,
        constraints: {},
      });
    }

    return tokens;
  }
}

// ============================================================================
// CDI Output Checker
// ============================================================================

/**
 * CDI output checker - validates response content
 */
export class CdiOutputChecker {
  private capsuleLoader: GovernanceCapsuleLoader;

  constructor(capsuleLoader: GovernanceCapsuleLoader) {
    this.capsuleLoader = capsuleLoader;
  }

  /**
   * Check output against constraints
   */
  async checkOutput(
    context: CdiContext,
    response: unknown,
    capabilityTokens: CapabilityTokenData[]
  ): Promise<{
    allowed: boolean;
    reason: string;
    redacted_response: unknown;
    applied_rules: RedactionRuleData[];
  }> {
    // Verify capability tokens are still valid
    const invalidTokens = capabilityTokens.filter(
      (t) => new Date(t.expires_at) <= new Date()
    );
    if (invalidTokens.length > 0) {
      return {
        allowed: false,
        reason: 'Capability tokens have expired',
        redacted_response: null,
        applied_rules: [],
      };
    }

    // Check for cross-namespace data leakage
    const leakageCheck = this.checkCrossNamespaceLeakage(context, response);
    if (!leakageCheck.allowed) {
      return {
        allowed: false,
        reason: leakageCheck.reason,
        redacted_response: null,
        applied_rules: [],
      };
    }

    // Apply redaction rules
    const { redacted, appliedRules } = this.applyRedactionRules(response);

    return {
      allowed: true,
      reason: 'Output validated',
      redacted_response: redacted,
      applied_rules: appliedRules,
    };
  }

  /**
   * Check for cross-namespace data leakage
   */
  private checkCrossNamespaceLeakage(
    context: CdiContext,
    response: unknown
  ): { allowed: boolean; reason: string } {
    // In strict mode, check if response contains data from other namespaces
    const capsule = this.capsuleLoader.getCapsule();
    if (!capsule || !capsule.posture.strict_validation) {
      return { allowed: true, reason: 'Strict validation not enabled' };
    }

    // Check for namespace_id fields that don't match source
    const checkNamespace = (obj: unknown, path: string[] = []): string | null => {
      if (obj && typeof obj === 'object') {
        if ('namespace_id' in obj) {
          const nsId = (obj as any).namespace_id;
          if (nsId !== context.source_namespace_id) {
            return `Cross-namespace data detected at ${path.join('.')}: ${nsId}`;
          }
        }
        for (const [key, value] of Object.entries(obj)) {
          const result = checkNamespace(value, [...path, key]);
          if (result) return result;
        }
      }
      return null;
    };

    const leakage = checkNamespace(response);
    if (leakage) {
      return {
        allowed: false,
        reason: `Cross-namespace leakage detected: ${leakage}`,
      };
    }

    return { allowed: true, reason: 'No cross-namespace leakage detected' };
  }

  /**
   * Apply redaction rules to response
   */
  private applyRedactionRules(
    response: unknown
  ): { redacted: unknown; appliedRules: RedactionRuleData[] } {
    const appliedRules: RedactionRuleData[] = [];

    // Default redaction rules
    const rules: RedactionRuleData[] = [
      {
        pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
        replacement: '[EMAIL_REDACTED]',
        reason: 'Email address redaction',
      },
      {
        pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
        replacement: '[SSN_REDACTED]',
        reason: 'SSN pattern redaction',
      },
    ];

    const redactValue = (value: unknown): unknown => {
      if (typeof value === 'string') {
        let result = value;
        for (const rule of rules) {
          const regex = new RegExp(rule.pattern, 'gi');
          if (regex.test(result)) {
            result = result.replace(regex, rule.replacement);
            if (!appliedRules.some((r) => r.pattern === rule.pattern)) {
              appliedRules.push(rule);
            }
          }
        }
        return result;
      } else if (Array.isArray(value)) {
        return value.map(redactValue);
      } else if (value && typeof value === 'object') {
        const redacted: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value)) {
          redacted[key] = redactValue(v);
        }
        return redacted;
      }
      return value;
    };

    return {
      redacted: redactValue(response),
      appliedRules,
    };
  }
}

// ============================================================================
// High-Level CDI Functions
// ============================================================================

/**
 * Check CDI action permission (simplified interface)
 */
export async function checkCDI(
  action: string,
  context: CdiContext,
  capsuleLoader: GovernanceCapsuleLoader,
  riskClass: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk' = 'low_risk',
  requestedCapabilities: string[] = []
): Promise<CdiDecision> {
  const checker = new CdiActionChecker(capsuleLoader);
  return checker.checkAction(action, context, riskClass, requestedCapabilities);
}

/**
 * Check CDI post-action output (simplified interface)
 */
export async function checkCDIPostAction(
  context: CdiContext,
  response: unknown,
  capabilityTokens: CapabilityTokenData[],
  capsuleLoader: GovernanceCapsuleLoader
): Promise<{
  allowed: boolean;
  reason: string;
  redacted_response: unknown;
  applied_rules: RedactionRuleData[];
}> {
  const checker = new CdiOutputChecker(capsuleLoader);
  return checker.checkOutput(context, response, capabilityTokens);
}
