/**
 * WHY: router.ts - Model Bus routing and capability enforcement
 * -----------------------------------------------------------------------------
 * - Routes model requests to the appropriate adapter based on model_id.
 * - Enforces capability token requirements before any adapter call.
 * - Integrates with AdapterGateway for centralized capability checking.
 * - Provides the unified entry point for all model invocations.
 *
 * INVARIANT: NO adapter call happens without capability verification.
 * INVARIANT: All requests MUST go through the router.
 * INVARIANT: Capability token MUST have 'model_invocation' capability.
 */

import { v4 as uuidv4 } from 'uuid';
import { AdapterGateway, CapabilityToken } from '@mathison/adapters';
import {
  ModelBusAdapter,
  ModelBusRequest,
  ModelBusResponse,
  RoutingConfig,
  RouterResult,
} from './types';
import { createOpenAIAdapter } from './adapters/openai';
import { createAnthropicAdapter } from './adapters/anthropic';
import { createLocalAdapter } from './adapters/local';

// ============================================================================
// Router Configuration
// ============================================================================

/**
 * Default routing configuration
 */
const DEFAULT_CONFIG: RoutingConfig = {
  providers: {
    openai: {},
    anthropic: {},
    local: {},
  },
};

// ============================================================================
// Model Router Implementation
// ============================================================================

/**
 * Model Bus Router
 *
 * WHY the router exists: Centralizes adapter selection and capability
 * enforcement. Without this, each caller would need to pick adapters
 * and check capabilities, leading to inconsistent enforcement.
 */
export class ModelRouter {
  private adapters: Map<string, ModelBusAdapter> = new Map();
  private gateway: AdapterGateway;
  private config: RoutingConfig;

  constructor(gateway: AdapterGateway, config?: Partial<RoutingConfig>) {
    this.gateway = gateway;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultAdapters();
  }

  /**
   * Initialize the default set of adapters
   */
  private initializeDefaultAdapters(): void {
    // OpenAI adapter
    const openaiConfig = this.config.providers.openai ?? {};
    this.adapters.set('openai', createOpenAIAdapter(openaiConfig));

    // Anthropic adapter
    const anthropicConfig = this.config.providers.anthropic ?? {};
    this.adapters.set('anthropic', createAnthropicAdapter(anthropicConfig));

    // Local/mock adapter
    const localConfig = this.config.providers.local ?? {};
    this.adapters.set('local', createLocalAdapter(localConfig as any));
  }

  /**
   * Register a custom adapter
   */
  registerAdapter(adapter: ModelBusAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  /**
   * Get an adapter by provider name
   */
  getAdapter(provider: string): ModelBusAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Route a request to the appropriate adapter
   *
   * WHY capability check happens here: This is the choke point for all
   * model calls. Checking here ensures no adapter call can bypass governance.
   */
  async route(request: ModelBusRequest): Promise<RouterResult> {
    // Step 1: Verify capability token
    // WHY fail first: If capability is invalid, don't waste time routing
    const capabilityResult = this.verifyCapability(request.capability_token, request.namespace_id);
    if (!capabilityResult.valid) {
      return {
        success: false,
        error: capabilityResult.error,
      };
    }

    // Step 2: Find the appropriate adapter
    const adapter = this.findAdapter(request.model_id);
    if (!adapter) {
      return {
        success: false,
        error: `No adapter found for model: ${request.model_id}`,
      };
    }

    // Step 3: Invoke the adapter through the gateway
    // WHY gateway invocation: Provides additional audit logging and
    // potential rate limiting at the gateway level
    try {
      const response = await adapter.invoke(request);
      return {
        success: true,
        response,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Verify that the capability token is valid for model invocation
   *
   * WHY strict capability checking:
   * - Token must have 'model_invocation' capability
   * - Token must not be expired
   * - Token's oi_id must match the request namespace
   */
  private verifyCapability(
    token: CapabilityToken,
    namespace_id: string
  ): { valid: boolean; error?: string } {
    // Check capability type
    if (token.capability !== 'model_invocation') {
      return {
        valid: false,
        error: `Invalid capability: expected 'model_invocation', got '${token.capability}'`,
      };
    }

    // Check expiration
    if (token.expires_at < new Date()) {
      return {
        valid: false,
        error: 'Capability token has expired',
      };
    }

    // Check namespace match
    // WHY namespace check: Prevents cross-namespace capability reuse
    if (token.oi_id !== namespace_id && token.oi_id !== '*') {
      return {
        valid: false,
        error: `Capability token namespace mismatch: token for '${token.oi_id}', request for '${namespace_id}'`,
      };
    }

    return { valid: true };
  }

  /**
   * Find an adapter that supports the given model ID
   *
   * WHY deterministic routing: The order of checks ensures consistent
   * adapter selection. Override config takes precedence, then pattern
   * matching, then default provider.
   */
  private findAdapter(model_id: string): ModelBusAdapter | undefined {
    // Check for explicit override
    if (this.config.model_overrides?.[model_id]) {
      const provider = this.config.model_overrides[model_id];
      return this.adapters.get(provider);
    }

    // Check each adapter's supported patterns
    for (const adapter of this.adapters.values()) {
      if (adapter.supports(model_id)) {
        return adapter;
      }
    }

    // Fall back to default provider
    if (this.config.default_provider) {
      return this.adapters.get(this.config.default_provider);
    }

    return undefined;
  }

  /**
   * List all available providers
   */
  listProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a model is supported
   */
  isModelSupported(model_id: string): boolean {
    return this.findAdapter(model_id) !== undefined;
  }
}

/**
 * Create a model router with the given gateway
 */
export function createModelRouter(
  gateway: AdapterGateway,
  config?: Partial<RoutingConfig>
): ModelRouter {
  return new ModelRouter(gateway, config);
}
