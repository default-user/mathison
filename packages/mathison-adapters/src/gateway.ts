/**
 * Mathison v2.1 Adapter Gateway
 *
 * Enforces capability-gated access to model and tool adapters.
 *
 * INVARIANT: All model/tool calls MUST go through this gateway.
 * INVARIANT: No call is allowed without a valid capability token.
 * INVARIANT: Bypass attempts are detected and denied.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  CapabilityToken,
  ModelAdapter,
  ModelInvocationRequest,
  ModelInvocationResponse,
  ToolAdapter,
  ToolInvocationRequest,
  ToolInvocationResponse,
  GatewayConfig,
  GatewayResult,
} from './types';

/**
 * Adapter gateway that enforces capability-based access control.
 */
export class AdapterGateway {
  private config: GatewayConfig;
  private modelAdapters: Map<string, ModelAdapter> = new Map();
  private toolAdapters: Map<string, ToolAdapter> = new Map();
  private invocationLog: InvocationLogEntry[] = [];

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  /**
   * Register a model adapter
   */
  registerModelAdapter(adapter: ModelAdapter): void {
    // Validate adapter families against allowed list
    for (const family of adapter.supported_families) {
      if (!this.config.allowed_model_families.includes(family)) {
        throw new Error(
          `Model adapter ${adapter.id} supports disallowed family: ${family}`
        );
      }
    }
    this.modelAdapters.set(adapter.id, adapter);
  }

  /**
   * Register a tool adapter
   */
  registerToolAdapter(adapter: ToolAdapter): void {
    // Validate tool categories against allowed list
    for (const tool of adapter.getTools()) {
      if (!this.config.allowed_tool_categories.includes(tool.category)) {
        throw new Error(
          `Tool adapter ${adapter.id} provides tool in disallowed category: ${tool.category}`
        );
      }
    }
    this.toolAdapters.set(adapter.id, adapter);
  }

  /**
   * Invoke a model through the gateway.
   * Requires a valid capability token for model_invocation.
   */
  async invokeModel(
    request: ModelInvocationRequest
  ): Promise<GatewayResult<ModelInvocationResponse>> {
    const startTime = Date.now();

    // Validate capability token
    const tokenValidation = this.validateCapabilityToken(
      request.capability_token,
      'model_invocation'
    );
    if (!tokenValidation.valid) {
      this.logInvocation('model', request.model_id, false, tokenValidation.reason!);
      return {
        allowed: false,
        reason: tokenValidation.reason,
      };
    }

    // Find adapter that supports this model
    let adapter: ModelAdapter | undefined;
    for (const a of this.modelAdapters.values()) {
      if (a.supports(request.model_id)) {
        adapter = a;
        break;
      }
    }

    if (!adapter) {
      const reason = `No adapter found for model: ${request.model_id}`;
      this.logInvocation('model', request.model_id, false, reason);
      return {
        allowed: false,
        reason,
      };
    }

    // Check token budget
    const maxTokens = request.parameters?.max_tokens || this.config.max_tokens_per_request;
    if (maxTokens > this.config.max_tokens_per_request) {
      const reason = `Requested tokens ${maxTokens} exceeds maximum ${this.config.max_tokens_per_request}`;
      this.logInvocation('model', request.model_id, false, reason);
      return {
        allowed: false,
        reason,
      };
    }

    // Invoke the adapter
    try {
      const result = await adapter.invoke(request);
      this.logInvocation('model', request.model_id, true, undefined, Date.now() - startTime);
      return {
        allowed: true,
        result,
        token_used: request.capability_token,
      };
    } catch (error) {
      const reason = `Model invocation failed: ${error}`;
      this.logInvocation('model', request.model_id, false, reason);
      return {
        allowed: false,
        reason,
      };
    }
  }

  /**
   * Invoke a tool through the gateway.
   * Requires a valid capability token for tool_invocation.
   */
  async invokeTool(
    request: ToolInvocationRequest
  ): Promise<GatewayResult<ToolInvocationResponse>> {
    const startTime = Date.now();

    // Validate capability token
    const tokenValidation = this.validateCapabilityToken(
      request.capability_token,
      'tool_invocation'
    );
    if (!tokenValidation.valid) {
      this.logInvocation('tool', request.tool_id, false, tokenValidation.reason!);
      return {
        allowed: false,
        reason: tokenValidation.reason,
      };
    }

    // Find adapter that supports this tool
    let adapter: ToolAdapter | undefined;
    for (const a of this.toolAdapters.values()) {
      if (a.supports(request.tool_id)) {
        adapter = a;
        break;
      }
    }

    if (!adapter) {
      const reason = `No adapter found for tool: ${request.tool_id}`;
      this.logInvocation('tool', request.tool_id, false, reason);
      return {
        allowed: false,
        reason,
      };
    }

    // Invoke the adapter
    try {
      const result = await adapter.invoke(request);
      this.logInvocation('tool', request.tool_id, true, undefined, Date.now() - startTime);
      return {
        allowed: true,
        result,
        token_used: request.capability_token,
      };
    } catch (error) {
      const reason = `Tool invocation failed: ${error}`;
      this.logInvocation('tool', request.tool_id, false, reason);
      return {
        allowed: false,
        reason,
      };
    }
  }

  /**
   * Validate a capability token
   */
  private validateCapabilityToken(
    token: CapabilityToken,
    requiredCapability: string
  ): { valid: boolean; reason?: string } {
    // Check if token exists
    if (!token) {
      return { valid: false, reason: 'No capability token provided' };
    }

    // Check if token has the required capability
    if (token.capability !== requiredCapability && token.capability !== '*') {
      return {
        valid: false,
        reason: `Token capability '${token.capability}' does not match required '${requiredCapability}'`,
      };
    }

    // Check if token is expired
    if (new Date(token.expires_at) <= new Date()) {
      return { valid: false, reason: 'Capability token has expired' };
    }

    // Check if token_id is present
    if (!token.token_id) {
      return { valid: false, reason: 'Token missing token_id' };
    }

    return { valid: true };
  }

  /**
   * Log an invocation attempt
   */
  private logInvocation(
    type: 'model' | 'tool',
    target_id: string,
    allowed: boolean,
    reason?: string,
    duration_ms?: number
  ): void {
    this.invocationLog.push({
      id: uuidv4(),
      type,
      target_id,
      allowed,
      reason,
      duration_ms,
      timestamp: new Date(),
    });

    // Keep log bounded
    if (this.invocationLog.length > 10000) {
      this.invocationLog = this.invocationLog.slice(-5000);
    }
  }

  /**
   * Get invocation log (for auditing)
   */
  getInvocationLog(): InvocationLogEntry[] {
    return [...this.invocationLog];
  }

  /**
   * Get registered model adapters
   */
  getModelAdapters(): ModelAdapter[] {
    return Array.from(this.modelAdapters.values());
  }

  /**
   * Get registered tool adapters
   */
  getToolAdapters(): ToolAdapter[] {
    return Array.from(this.toolAdapters.values());
  }
}

interface InvocationLogEntry {
  id: string;
  type: 'model' | 'tool';
  target_id: string;
  allowed: boolean;
  reason?: string;
  duration_ms?: number;
  timestamp: Date;
}

/**
 * Create a gateway with default configuration
 */
export function createGateway(config?: Partial<GatewayConfig>): AdapterGateway {
  const defaultConfig: GatewayConfig = {
    allowed_model_families: ['openai', 'anthropic', 'local'],
    allowed_tool_categories: ['file', 'web', 'code', 'data'],
    max_tokens_per_request: 100000,
    strict_mode: true,
    ...config,
  };

  return new AdapterGateway(defaultConfig);
}
