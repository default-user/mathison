/**
 * WHY: local.ts - Local/mock adapter for testing
 * -----------------------------------------------------------------------------
 * - Provides a mock model adapter that doesn't require network calls.
 * - Essential for integration tests to verify the full pipeline.
 * - Can be configured to return specific responses or simulate errors.
 * - Tracks all invocations for test assertions.
 *
 * INVARIANT: This adapter NEVER makes network calls.
 * INVARIANT: Response content is deterministic based on configuration.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ModelBusAdapter,
  ModelBusRequest,
  ModelBusResponse,
  TokenUsage,
  FinishReason,
} from '../types';

// ============================================================================
// Local Adapter Types
// ============================================================================

/**
 * Configuration for mock responses
 */
export interface MockResponseConfig {
  /** Content to return */
  content: string;
  /** Finish reason */
  finish_reason?: FinishReason;
  /** Simulated latency in ms */
  latency_ms?: number;
  /** Simulated token usage */
  usage?: Partial<TokenUsage>;
  /** Error to throw instead of responding */
  error?: string;
}

/**
 * Invocation record for test assertions
 */
export interface LocalInvocationRecord {
  request: ModelBusRequest;
  response?: ModelBusResponse;
  error?: Error;
  timestamp: Date;
}

// ============================================================================
// Local Adapter Implementation
// ============================================================================

/**
 * Local/mock model adapter for testing
 *
 * WHY this is necessary: Integration tests need to verify the full
 * governed pipeline without making real API calls. This adapter
 * provides deterministic, controllable behavior for testing.
 */
export class LocalAdapter implements ModelBusAdapter {
  readonly provider = 'local';
  readonly supported_models = [/^local/, /^mock/, /^test/];

  private defaultResponse: MockResponseConfig;
  private modelResponses: Map<string, MockResponseConfig>;
  private invocations: LocalInvocationRecord[] = [];

  constructor(config?: { default_response?: MockResponseConfig }) {
    this.defaultResponse = config?.default_response ?? {
      content: 'This is a mock response from the local adapter.',
      finish_reason: 'stop',
      latency_ms: 10,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      },
    };
    this.modelResponses = new Map();
  }

  /**
   * Check if this adapter supports a model ID
   */
  supports(model_id: string): boolean {
    return this.supported_models.some((pattern) => pattern.test(model_id));
  }

  /**
   * Configure a specific response for a model ID
   *
   * WHY per-model config: Allows tests to set up different scenarios
   * for different "models" in the same test suite.
   */
  setResponse(model_id: string, config: MockResponseConfig): void {
    this.modelResponses.set(model_id, config);
  }

  /**
   * Clear a specific model response
   */
  clearResponse(model_id: string): void {
    this.modelResponses.delete(model_id);
  }

  /**
   * Clear all configured responses
   */
  clearAllResponses(): void {
    this.modelResponses.clear();
  }

  /**
   * Get all recorded invocations
   */
  getInvocations(): LocalInvocationRecord[] {
    return [...this.invocations];
  }

  /**
   * Clear all recorded invocations
   */
  clearInvocations(): void {
    this.invocations = [];
  }

  /**
   * Invoke the local adapter
   *
   * WHY record invocations: Tests can verify that the adapter was
   * called with the correct parameters, including capability tokens.
   */
  async invoke(request: ModelBusRequest): Promise<ModelBusResponse> {
    const startTime = Date.now();
    const config = this.modelResponses.get(request.model_id) ?? this.defaultResponse;

    // Simulate latency
    if (config.latency_ms && config.latency_ms > 0) {
      await this.sleep(config.latency_ms);
    }

    // Check for configured error
    if (config.error) {
      const error = new Error(config.error);
      this.invocations.push({
        request,
        error,
        timestamp: new Date(),
      });
      throw error;
    }

    const latencyMs = Date.now() - startTime;

    // Build usage info
    const usage: TokenUsage = {
      input_tokens: config.usage?.input_tokens ?? this.estimateInputTokens(request),
      output_tokens: config.usage?.output_tokens ?? this.estimateOutputTokens(config.content),
      total_tokens: config.usage?.total_tokens,
    };
    usage.total_tokens = usage.total_tokens ?? usage.input_tokens + usage.output_tokens;

    const response: ModelBusResponse = {
      content: config.content,
      finish_reason: config.finish_reason ?? 'stop',
      provenance: {
        provider: this.provider,
        model_id: request.model_id,
        usage,
        latency_ms: latencyMs,
        trace_id: request.trace_id,
        capability_token_id: request.capability_token.token_id,
        vendor_request_id: `local-${uuidv4()}`,
        timestamp: new Date(),
      },
    };

    // Record invocation
    this.invocations.push({
      request,
      response,
      timestamp: new Date(),
    });

    return response;
  }

  /**
   * Estimate input tokens from request
   */
  private estimateInputTokens(request: ModelBusRequest): number {
    // Rough estimate: ~4 chars per token
    const totalChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Estimate output tokens from content
   */
  private estimateOutputTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a local adapter with optional configuration
 */
export function createLocalAdapter(config?: {
  default_response?: MockResponseConfig;
}): LocalAdapter {
  return new LocalAdapter(config);
}

/**
 * Singleton local adapter for testing
 */
let testAdapter: LocalAdapter | null = null;

/**
 * Get the test adapter singleton
 */
export function getTestAdapter(): LocalAdapter {
  if (!testAdapter) {
    testAdapter = new LocalAdapter();
  }
  return testAdapter;
}

/**
 * Reset the test adapter singleton
 */
export function resetTestAdapter(): void {
  testAdapter = null;
}
