/**
 * WHY: openai.ts - OpenAI adapter for the Model Bus
 * -----------------------------------------------------------------------------
 * - Handles all OpenAI API calls (Chat Completions API).
 * - Transforms Mathison message format to OpenAI format.
 * - Extracts usage and provenance from OpenAI responses.
 * - Uses the internal HTTP client (no SDK imports).
 *
 * INVARIANT: This is the ONLY place OpenAI API calls are made.
 * INVARIANT: No 'openai' npm package may be imported anywhere.
 */

import { v4 as uuidv4 } from 'uuid';
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
// OpenAI API Types (internal, not exported)
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  top_p?: number;
}

interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

interface OpenAIError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

// ============================================================================
// OpenAI Adapter Implementation
// ============================================================================

/**
 * OpenAI model adapter
 *
 * WHY direct HTTP instead of SDK: The SDK would be another dependency that
 * could be imported elsewhere, bypassing governance. Direct HTTP calls
 * through our internal client keeps all vendor calls auditable.
 */
export class OpenAIAdapter implements ModelBusAdapter {
  readonly provider = 'openai';
  readonly supported_models = [
    /^gpt-4/,
    /^gpt-3\.5/,
    /^o1/,
    /^o3/,
    /^chatgpt/,
  ];

  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config?: { api_key?: string; base_url?: string; timeout_ms?: number }) {
    // WHY env fallback: Allows runtime configuration without code changes
    this.apiKey = config?.api_key ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = config?.base_url ?? 'https://api.openai.com';
    this.timeoutMs = config?.timeout_ms ?? 60000;
  }

  /**
   * Check if this adapter supports a model ID
   */
  supports(model_id: string): boolean {
    return this.supported_models.some((pattern) => pattern.test(model_id));
  }

  /**
   * Invoke the OpenAI Chat Completions API
   *
   * WHY capability token is checked at router level: The adapter trusts
   * that the router has already validated the capability. This keeps
   * adapters simple and focused on API translation.
   */
  async invoke(request: ModelBusRequest): Promise<ModelBusResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured (set OPENAI_API_KEY)');
    }

    const startTime = Date.now();

    // Transform to OpenAI format
    const openaiRequest: OpenAIRequest = {
      model: request.model_id,
      messages: this.transformMessages(request.messages),
      ...(request.parameters?.temperature !== undefined && {
        temperature: request.parameters.temperature,
      }),
      ...(request.parameters?.max_tokens !== undefined && {
        max_tokens: request.parameters.max_tokens,
      }),
      ...(request.parameters?.stop_sequences && {
        stop: request.parameters.stop_sequences,
      }),
      ...(request.parameters?.top_p !== undefined && {
        top_p: request.parameters.top_p,
      }),
    };

    const client = getHttpClient();

    const response = await client.request<OpenAIResponse | OpenAIError>({
      method: 'POST',
      url: `${this.baseUrl}/v1/chat/completions`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: openaiRequest,
      timeout_ms: this.timeoutMs,
    });

    const latencyMs = Date.now() - startTime;

    // Check for API errors
    if (response.status >= 400) {
      const errorBody = response.body as OpenAIError;
      throw new Error(
        `OpenAI API error (${response.status}): ${errorBody.error?.message ?? response.raw}`
      );
    }

    const openaiResponse = response.body as OpenAIResponse;

    // Extract content from response
    const choice = openaiResponse.choices[0];
    if (!choice) {
      throw new Error('OpenAI returned no choices');
    }

    // Map finish reason
    const finishReason = this.mapFinishReason(choice.finish_reason);

    // Build usage info
    const usage: TokenUsage = {
      input_tokens: openaiResponse.usage.prompt_tokens,
      output_tokens: openaiResponse.usage.completion_tokens,
      total_tokens: openaiResponse.usage.total_tokens,
    };

    return {
      content: choice.message.content,
      finish_reason: finishReason,
      provenance: {
        provider: this.provider,
        model_id: openaiResponse.model,
        usage,
        latency_ms: latencyMs,
        trace_id: request.trace_id,
        capability_token_id: request.capability_token.token_id,
        vendor_request_id: openaiResponse.id,
        timestamp: new Date(),
      },
    };
  }

  /**
   * Transform Mathison messages to OpenAI format
   */
  private transformMessages(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Map OpenAI finish reason to our enum
   */
  private mapFinishReason(reason: string): FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}

/**
 * Create an OpenAI adapter with optional configuration
 */
export function createOpenAIAdapter(config?: {
  api_key?: string;
  base_url?: string;
  timeout_ms?: number;
}): OpenAIAdapter {
  return new OpenAIAdapter(config);
}
