/**
 * WHY: ai-chat-integration.test.ts - Integration tests for ai.chat handler
 * -----------------------------------------------------------------------------
 * - Verifies the complete ai.chat flow using the local/mock adapter.
 * - Tests capability token requirement.
 * - Tests provenance data in response.
 * - Tests response structure.
 *
 * INVARIANT: ai.chat requires model_invocation capability.
 * INVARIANT: Provenance data is always returned.
 * INVARIANT: Capability token namespace must match request namespace.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  createModelRouter,
  ModelRouter,
  ModelBusRequest,
  LocalAdapter,
  createLocalAdapter,
} from '../src';
import { createGateway, AdapterGateway, CapabilityToken } from '@mathison/adapters';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a valid capability token for testing
 */
function createValidCapabilityToken(
  capability: string,
  namespace_id: string
): CapabilityToken {
  return {
    token_id: uuidv4(),
    capability,
    oi_id: namespace_id,
    principal_id: 'test-principal',
    expires_at: new Date(Date.now() + 3600000), // 1 hour from now
    constraints: {},
  };
}

/**
 * Create an expired capability token for testing
 */
function createExpiredCapabilityToken(
  capability: string,
  namespace_id: string
): CapabilityToken {
  return {
    token_id: uuidv4(),
    capability,
    oi_id: namespace_id,
    principal_id: 'test-principal',
    expires_at: new Date(Date.now() - 1000), // 1 second ago
    constraints: {},
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ai.chat Integration', () => {
  let gateway: AdapterGateway;
  let router: ModelRouter;
  let localAdapter: LocalAdapter;

  beforeEach(() => {
    // Create gateway
    gateway = createGateway({
      allowed_model_families: ['openai', 'anthropic', 'local'],
      allowed_tool_categories: [],
      max_tokens_per_request: 100000,
      strict_mode: true,
    });

    // Create a local adapter we can track
    localAdapter = createLocalAdapter();

    // Create router
    router = createModelRouter(gateway, {
      providers: {
        local: {},
      },
    });

    // Register our tracked adapter (overwrites the default)
    router.registerAdapter(localAdapter);
  });

  describe('Capability Token Requirement', () => {
    test('should succeed with valid model_invocation capability token', async () => {
      const request: ModelBusRequest = {
        model_id: 'local-test',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('model_invocation', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response!.content).toBeDefined();
    });

    test('should fail with wrong capability type', async () => {
      const request: ModelBusRequest = {
        model_id: 'local-test',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('memory_read', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('model_invocation');
    });

    test('should fail with expired capability token', async () => {
      const request: ModelBusRequest = {
        model_id: 'local-test',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createExpiredCapabilityToken('model_invocation', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('expired');
    });

    test('should fail with namespace mismatch', async () => {
      const request: ModelBusRequest = {
        model_id: 'local-test',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('model_invocation', 'other-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('mismatch');
    });
  });

  describe('Local Adapter Invocation', () => {
    test('should record invocation with correct parameters', async () => {
      const traceId = uuidv4();
      const capToken = createValidCapabilityToken('model_invocation', 'test-namespace');

      const request: ModelBusRequest = {
        model_id: 'local-test',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'What is 2+2?' },
        ],
        parameters: {
          temperature: 0.5,
          max_tokens: 100,
        },
        capability_token: capToken,
        trace_id: traceId,
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(true);

      // Check invocation was recorded on our adapter
      const invocations = localAdapter.getInvocations();
      expect(invocations).toHaveLength(1);

      const invocation = invocations[0];
      expect(invocation.request.model_id).toBe('local-test');
      expect(invocation.request.messages).toHaveLength(2);
      expect(invocation.request.trace_id).toBe(traceId);
      expect(invocation.request.capability_token.token_id).toBe(capToken.token_id);
    });

    test('should return provenance data in response', async () => {
      const traceId = uuidv4();
      const capToken = createValidCapabilityToken('model_invocation', 'test-namespace');

      const request: ModelBusRequest = {
        model_id: 'local-test',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: capToken,
        trace_id: traceId,
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();

      const provenance = result.response!.provenance;
      expect(provenance.provider).toBe('local');
      expect(provenance.model_id).toBe('local-test');
      expect(provenance.trace_id).toBe(traceId);
      expect(provenance.capability_token_id).toBe(capToken.token_id);
      expect(provenance.usage).toBeDefined();
      expect(provenance.usage.input_tokens).toBeGreaterThan(0);
      expect(provenance.usage.output_tokens).toBeGreaterThan(0);
      expect(provenance.latency_ms).toBeGreaterThanOrEqual(0);
      expect(provenance.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Configurable Mock Responses', () => {
    test('should return configured response content', async () => {
      localAdapter.setResponse('local-custom', {
        content: 'Custom response for testing',
        finish_reason: 'stop',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      });

      const request: ModelBusRequest = {
        model_id: 'local-custom',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('model_invocation', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(true);
      expect(result.response!.content).toBe('Custom response for testing');
      expect(result.response!.provenance.usage.input_tokens).toBe(10);
      expect(result.response!.provenance.usage.output_tokens).toBe(20);
    });

    test('should throw configured error', async () => {
      localAdapter.setResponse('local-error', {
        content: '',
        error: 'Simulated model failure',
      });

      const request: ModelBusRequest = {
        model_id: 'local-error',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('model_invocation', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated model failure');
    });
  });

  describe('Model Routing', () => {
    test('should route to local adapter for local-* models', async () => {
      const request: ModelBusRequest = {
        model_id: 'local-any',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('model_invocation', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(true);
      expect(result.response!.provenance.provider).toBe('local');
    });

    test('should route to local adapter for mock-* models', async () => {
      const request: ModelBusRequest = {
        model_id: 'mock-model',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('model_invocation', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(true);
      expect(result.response!.provenance.provider).toBe('local');
    });

    test('should route to local adapter for test-* models', async () => {
      const request: ModelBusRequest = {
        model_id: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: createValidCapabilityToken('model_invocation', 'test-namespace'),
        trace_id: uuidv4(),
        namespace_id: 'test-namespace',
      };

      const result = await router.route(request);

      expect(result.success).toBe(true);
      expect(result.response!.provenance.provider).toBe('local');
    });
  });
});
