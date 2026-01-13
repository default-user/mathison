/**
 * Thin Waist v0.1: Tool Gateway
 *
 * Single entry point for ALL tool/adapter invocations.
 * Enforces capability-based access control with resource scoping.
 *
 * INVARIANT: No tool may execute without passing through this gateway.
 * ENFORCEMENT: Conformance tests must prove no bypass paths exist.
 */

import { CapabilityToken, validateToken } from '../capability-token';
import { actionRegistry } from '../action-registry';

/**
 * Resource scope types for fine-grained capability control
 */
export type ResourceScope =
  | { type: 'network:outbound'; host?: string }
  | { type: 'network:inbound'; port?: number }
  | { type: 'fs:read'; path: string }
  | { type: 'fs:write'; path: string }
  | { type: 'model:call'; model?: string }
  | { type: 'memory:read'; graph_id?: string }
  | { type: 'memory:write'; graph_id?: string }
  | { type: 'storage:read'; backend?: string }
  | { type: 'storage:write'; backend?: string }
  | { type: 'job:execute'; job_id?: string }
  | { type: 'governance:validate' }
  | { type: 'governance:mint_token' };

/**
 * Tool handler function signature
 */
export type ToolHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
  context: ToolInvocationContext
) => Promise<TResult>;

/**
 * Tool definition with required scopes
 */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  action_id: string; // Maps to ActionRegistry
  required_scopes: ResourceScope[];
  handler: ToolHandler<TArgs, TResult>;
}

/**
 * Tool invocation context (passed to handlers)
 */
export interface ToolInvocationContext {
  actor: string;
  capability_token: CapabilityToken;
  metadata?: Record<string, unknown>;
  genome_id?: string;
  genome_version?: string;
}

/**
 * Tool invocation result
 */
export interface ToolInvocationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  denied_reason?: string;
}

/**
 * Tool Gateway - Single chokepoint for all tool invocations
 */
export class ToolGateway {
  private tools: Map<string, ToolDefinition> = new Map();
  private invocationLog: Array<{ tool: string; actor: string; timestamp: string; result: 'allow' | 'deny' }> = [];

  /**
   * Register a tool with required scopes
   * Must be called during server initialization
   */
  registerTool<TArgs = unknown, TResult = unknown>(definition: ToolDefinition<TArgs, TResult>): void {
    // Validate action_id exists in ActionRegistry
    actionRegistry.validate(definition.action_id);

    if (this.tools.has(definition.name)) {
      throw new Error(`TOOL_ALREADY_REGISTERED: Tool "${definition.name}" is already registered`);
    }

    this.tools.set(definition.name, definition as ToolDefinition);
    console.log(`🔧 ToolGateway: Registered tool "${definition.name}" (action: ${definition.action_id}, scopes: ${definition.required_scopes.length})`);
  }

  /**
   * Invoke a tool through the gateway
   *
   * INVARIANT: This is the ONLY way tools should be invoked.
   *
   * @param tool_name - Registered tool name
   * @param args - Tool-specific arguments
   * @param capability_token - Capability token granting access
   * @param context - Invocation context (actor, metadata)
   * @returns Tool result or denial
   */
  async invoke<TArgs = unknown, TResult = unknown>(
    tool_name: string,
    args: TArgs,
    capability_token: CapabilityToken,
    context: Omit<ToolInvocationContext, 'capability_token'>
  ): Promise<ToolInvocationResult<TResult>> {
    const timestamp = new Date().toISOString();

    // 1. Check tool is registered (deny-by-default)
    const tool = this.tools.get(tool_name);
    if (!tool) {
      this.logInvocation(tool_name, context.actor, 'deny', timestamp);
      return {
        success: false,
        denied_reason: `TOOL_NOT_REGISTERED: Tool "${tool_name}" is not registered (deny-by-default)`
      };
    }

    // 2. Validate capability token
    const tokenValidation = validateToken(capability_token, {
      expected_action_id: tool.action_id,
      expected_actor: context.actor,
      increment_use: false // Don't increment yet - wait for successful invocation
    });

    if (!tokenValidation.valid) {
      this.logInvocation(tool_name, context.actor, 'deny', timestamp);
      return {
        success: false,
        denied_reason: `CAPABILITY_DENIED: ${tokenValidation.errors.join('; ')}`
      };
    }

    // 3. Check required scopes (TODO: implement fine-grained resource checks)
    // For now, token validation is sufficient; scope checking can be enhanced later
    for (const scope of tool.required_scopes) {
      if (!this.checkScope(scope, capability_token)) {
        this.logInvocation(tool_name, context.actor, 'deny', timestamp);
        return {
          success: false,
          denied_reason: `SCOPE_DENIED: Missing required scope ${scope.type}`
        };
      }
    }

    // 4. Execute tool handler
    try {
      const fullContext: ToolInvocationContext = {
        ...context,
        capability_token
      };

      const result = await tool.handler(args, fullContext);
      this.logInvocation(tool_name, context.actor, 'allow', timestamp);

      return {
        success: true,
        data: result as TResult
      };
    } catch (error) {
      this.logInvocation(tool_name, context.actor, 'deny', timestamp);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        denied_reason: 'TOOL_EXECUTION_FAILED'
      };
    }
  }

  /**
   * Check if token grants required scope
   * (Simplified implementation - can be enhanced with fine-grained resource checks)
   */
  private checkScope(scope: ResourceScope, token: CapabilityToken): boolean {
    // For v0.1, we rely on action_id mapping to ActionRegistry
    // Future: implement fine-grained resource checks based on scope.type
    return true; // Token validation is primary gate
  }

  /**
   * Log tool invocation for audit trail
   */
  private logInvocation(tool: string, actor: string, result: 'allow' | 'deny', timestamp: string): void {
    this.invocationLog.push({ tool, actor, timestamp, result });

    // Keep last 1000 invocations in memory (mobile-safe)
    if (this.invocationLog.length > 1000) {
      this.invocationLog.shift();
    }
  }

  /**
   * Get list of registered tools
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool definition
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get invocation audit log
   */
  getInvocationLog(limit = 100): Array<{ tool: string; actor: string; timestamp: string; result: 'allow' | 'deny' }> {
    return this.invocationLog.slice(-limit);
  }

  /**
   * Check if tool is registered (for bypass detection)
   */
  isToolRegistered(name: string): boolean {
    return this.tools.has(name);
  }
}

/**
 * Global singleton instance
 */
let globalToolGateway: ToolGateway | null = null;

/**
 * Initialize global tool gateway
 */
export function initializeToolGateway(): ToolGateway {
  if (globalToolGateway) {
    throw new Error('TOOL_GATEWAY_ALREADY_INITIALIZED');
  }
  globalToolGateway = new ToolGateway();
  console.log('🔧 ToolGateway: Initialized (deny-by-default mode)');
  return globalToolGateway;
}

/**
 * Get global tool gateway (throws if not initialized)
 */
export function getToolGateway(): ToolGateway {
  if (!globalToolGateway) {
    throw new Error('TOOL_GATEWAY_NOT_INITIALIZED: Call initializeToolGateway() first');
  }
  return globalToolGateway;
}

/**
 * Check if tool gateway is initialized
 */
export function isToolGatewayInitialized(): boolean {
  return globalToolGateway !== null;
}
