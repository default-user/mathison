/**
 * WHY: adapters/index.ts - Adapter barrel export
 * -----------------------------------------------------------------------------
 * - Re-exports all model adapters from a single location.
 * - Makes imports cleaner for consumers.
 * - Documents which adapters are available.
 */

export { OpenAIAdapter, createOpenAIAdapter } from './openai';
export { AnthropicAdapter, createAnthropicAdapter } from './anthropic';
export {
  LocalAdapter,
  createLocalAdapter,
  getTestAdapter,
  resetTestAdapter,
  MockResponseConfig,
  LocalInvocationRecord,
} from './local';
