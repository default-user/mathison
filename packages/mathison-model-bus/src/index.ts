/**
 * WHY: index.ts - Model Bus package entry point
 * -----------------------------------------------------------------------------
 * - Exports the public API for the Model Bus package.
 * - Provides factory functions for creating routers and adapters.
 * - Re-exports types for consumers.
 *
 * PACKAGE PURPOSE: Implements governed model invocation through adapters.
 * This is the ONLY path for calling external AI APIs in Mathison v2.2.
 *
 * INVARIANT: All vendor API calls must go through this package.
 * INVARIANT: No vendor SDK imports are allowed outside this package.
 * INVARIANT: All invocations require valid capability tokens.
 */

// Types
export {
  MessageRole,
  ChatMessage,
  ChatMessageSchema,
  ModelParameters,
  ModelParametersSchema,
  ModelBusRequest,
  ModelBusRequestSchema,
  TokenUsage,
  FinishReason,
  ModelProvenance,
  ModelBusResponse,
  ProviderConfig,
  ModelBusAdapter,
  RoutingConfig,
  RouterResult,
} from './types';

// HTTP Client (internal, but exposed for testing)
export {
  ModelBusHttpClient,
  HttpRequestOptions,
  HttpResponse,
  HttpClientConfig,
  getHttpClient,
  resetHttpClient,
} from './http-client';

// Adapters
export {
  OpenAIAdapter,
  createOpenAIAdapter,
  AnthropicAdapter,
  createAnthropicAdapter,
  LocalAdapter,
  createLocalAdapter,
  getTestAdapter,
  resetTestAdapter,
  MockResponseConfig,
  LocalInvocationRecord,
} from './adapters';

// Router
export { ModelRouter, createModelRouter } from './router';
