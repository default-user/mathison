/**
 * WHY: anthropic.ts - Anthropic adapter for the Model Bus
 * -----------------------------------------------------------------------------
 * - Handles all Anthropic API calls (Messages API).
 * - Transforms Mathison message format to Anthropic format.
 * - Extracts usage and provenance from Anthropic responses.
 * - Uses the internal HTTP client (no SDK imports).
 *
 * INVARIANT: This is the ONLY place Anthropic API calls are made.
 * INVARIANT: No '@anthropic-ai/sdk' package may be imported anywhere.
 */

import { getHttpClient } from '../http-client';
import {
  ModelBusAdapter,
  ModelBusRequest,
  ModelBusResponse,
  ChatMessage,
  TokenUsage,
  FinishReason,
} from '../types';

// ============================================================================
// Anthropic API Types (internal, not exported)
// ============================================================================

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  stop_sequences?: string[];
  top_p?: number;
}

interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: AnthropicUsage;
}

interface AnthropicError {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

// ============================================================================
// Anthropic Adapter Implementation
// ============================================================================

/**
 * Anthropic model adapter
 *
 * WHY direct HTTP instead of SDK: Same reasoning as OpenAI - keeps all
 * vendor calls through our auditable HTTP client, prevents SDK imports
 * from being scattered across the codebase.
 */
export class AnthropicAdapter implements ModelBusAdapter {
  readonly provider = 'anthropic';
  readonly supported_models = [
    /^claude-3/,
    /^claude-2/,
    /^claude-instant/,
    /^claude-opus/,
    /^claude-sonnet/,
    /^claude-haiku/,
  ];

  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private apiVersion: string;

  constructor(config?: {
    api_key?: string;
    base_url?: string;
    timeout_ms?: number;
    api_version?: string;
  }) {
    // WHY env fallback: Allows runtime configuration without code changes
    this.apiKey = config?.api_key ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.baseUrl = config?.base_url ?? 'https://api.anthropic.com';
    this.timeoutMs = config?.timeout_ms ?? 120000; // Anthropic can be slower
    this.apiVersion = config?.api_version ?? '2023-06-01';
  }

  /**
   * Check if this adapter supports a model ID
   */
  supports(model_id: string): boolean {
    return this.supported_models.some((pattern) => pattern.test(model_id));
  }

  /**
   * Invoke the Anthropic Messages API
   */
  async invoke(request: ModelBusRequest): Promise<ModelBusResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured (set ANTHROPIC_API_KEY)');
    }

    const startTime = Date.now();

    // Transform messages and extract system prompt
    const { system, messages } = this.transformMessages(request.messages);

    // Build Anthropic request
    const anthropicRequest: AnthropicRequest = {
      model: request.model_id,
      messages,
      max_tokens: request.parameters?.max_tokens ?? 4096,
      ...(system && { system }),
      ...(request.parameters?.temperature !== undefined && {
        temperature: request.parameters.temperature,
      }),
      ...(request.parameters?.stop_sequences && {
        stop_sequences: request.parameters.stop_sequences,
      }),
      ...(request.parameters?.top_p !== undefined && {
        top_p: request.parameters.top_p,
      }),
    };

    const client = getHttpClient();

    const response = await client.request<AnthropicResponse | AnthropicError>({
      method: 'POST',
      url: `${this.baseUrl}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: anthropicRequest,
      timeout_ms: this.timeoutMs,
    });

    const latencyMs = Date.now() - startTime;

    // Check for API errors
    if (response.status >= 400) {
      const errorBody = response.body as AnthropicError;
      throw new Error(
        `Anthropic API error (${response.status}): ${errorBody.error?.message ?? response.raw}`
      );
    }

    const anthropicResponse = response.body as AnthropicResponse;

    // Extract content from response
    const textContent = anthropicResponse.content.find((block) => block.type === 'text');
    if (!textContent) {
      throw new Error('Anthropic returned no text content');
    }

    // Map finish reason
    const finishReason = this.mapFinishReason(anthropicResponse.stop_reason);

    // Build usage info
    const usage: TokenUsage = {
      input_tokens: anthropicResponse.usage.input_tokens,
      output_tokens: anthropicResponse.usage.output_tokens,
      total_tokens:
        anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens,
    };

    return {
      content: textContent.text,
      finish_reason: finishReason,
      provenance: {
        provider: this.provider,
        model_id: anthropicResponse.model,
        usage,
        latency_ms: latencyMs,
        trace_id: request.trace_id,
        capability_token_id: request.capability_token.token_id,
        vendor_request_id: anthropicResponse.id,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Transform Mathison messages to Anthropic format
   *
   * WHY separate system extraction: Anthropic's Messages API requires
   * the system prompt to be passed separately, not as a message.
   */
  private transformMessages(
    messages: ChatMessage[]
  ): { system?: string; messages: AnthropicMessage[] } {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Collect system messages
        system = system ? `${system}\n\n${msg.content}` : msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Anthropic requires at least one user message
    if (anthropicMessages.length === 0) {
      throw new Error('Anthropic requires at least one user or assistant message');
    }

    return { system, messages: anthropicMessages };
  }

  /**
   * Map Anthropic stop reason to our enum
   */
  private mapFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }
}

/**
 * Create an Anthropic adapter with optional configuration
 */
export function createAnthropicAdapter(config?: {
  api_key?: string;
  base_url?: string;
  timeout_ms?: number;
  api_version?: string;
}): AnthropicAdapter {
  return new AnthropicAdapter(config);
}
