/**
 * Mathison v2.1 Adapter Bypass Tests
 *
 * INVARIANT: Direct model call attempt -> denied
 * INVARIANT: Tool call without capability -> denied
 */

import {
  AdapterGateway,
  createGateway,
  ModelAdapter,
  ToolAdapter,
  CapabilityToken,
  ModelInvocationRequest,
  ToolInvocationRequest,
} from '../src';

// Mock model adapter
class MockModelAdapter implements ModelAdapter {
  id = 'mock-model-adapter';
  supported_families = ['openai'];

  supports(model_id: string): boolean {
    return model_id.startsWith('gpt-');
  }

  async invoke(request: ModelInvocationRequest) {
    // Adapter itself should validate token (defense in depth)
    if (!request.capability_token) {
      throw new Error('No capability token provided');
    }
    if (new Date(request.capability_token.expires_at) <= new Date()) {
      throw new Error('Token expired');
    }
    if (request.capability_token.capability !== 'model_invocation') {
      throw new Error('Invalid capability');
    }

    return {
      content: 'Mock response',
      usage: { input_tokens: 10, output_tokens: 5 },
      finish_reason: 'stop' as const,
      model_id: request.model_id,
    };
  }
}

// Mock tool adapter
class MockToolAdapter implements ToolAdapter {
  id = 'mock-tool-adapter';

  getTools() {
    return [
      {
        id: 'file_read',
        name: 'File Read',
        description: 'Read file contents',
        input_schema: {},
        category: 'file',
        risk_level: 'low' as const,
      },
    ];
  }

  supports(tool_id: string): boolean {
    return tool_id === 'file_read';
  }

  async invoke(request: ToolInvocationRequest) {
    // Adapter itself should validate token (defense in depth)
    if (!request.capability_token) {
      throw new Error('No capability token provided');
    }
    if (new Date(request.capability_token.expires_at) <= new Date()) {
      throw new Error('Token expired');
    }
    if (request.capability_token.capability !== 'tool_invocation') {
      throw new Error('Invalid capability');
    }

    return {
      output: { content: 'file contents' },
      success: true,
    };
  }
}

describe('Adapter Bypass Invariants', () => {
  let gateway: AdapterGateway;

  beforeEach(() => {
    gateway = createGateway({
      allowed_model_families: ['openai'],
      allowed_tool_categories: ['file'],
      max_tokens_per_request: 10000,
      strict_mode: true,
    });

    gateway.registerModelAdapter(new MockModelAdapter());
    gateway.registerToolAdapter(new MockToolAdapter());
  });

  describe('INVARIANT: Model calls require capability token', () => {
    it('should deny model invocation without token', async () => {
      const result = await gateway.invokeModel({
        model_id: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: null as any,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No capability token');
    });

    it('should deny model invocation with expired token', async () => {
      const expiredToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'model_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() - 1000), // Expired
        constraints: {},
      };

      const result = await gateway.invokeModel({
        model_id: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: expiredToken,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should deny model invocation with wrong capability', async () => {
      const wrongToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'tool_invocation', // Wrong capability
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      const result = await gateway.invokeModel({
        model_id: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: wrongToken,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not match');
    });

    it('should allow model invocation with valid token', async () => {
      const validToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'model_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      const result = await gateway.invokeModel({
        model_id: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: validToken,
      });

      expect(result.allowed).toBe(true);
      expect(result.result).toBeDefined();
    });
  });

  describe('INVARIANT: Tool calls require capability token', () => {
    it('should deny tool invocation without token', async () => {
      const result = await gateway.invokeTool({
        tool_id: 'file_read',
        input: { path: '/test' },
        capability_token: null as any,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No capability token');
    });

    it('should deny tool invocation with expired token', async () => {
      const expiredToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'tool_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() - 1000), // Expired
        constraints: {},
      };

      const result = await gateway.invokeTool({
        tool_id: 'file_read',
        input: { path: '/test' },
        capability_token: expiredToken,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should deny tool invocation with wrong capability', async () => {
      const wrongToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'model_invocation', // Wrong capability
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      const result = await gateway.invokeTool({
        tool_id: 'file_read',
        input: { path: '/test' },
        capability_token: wrongToken,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not match');
    });

    it('should allow tool invocation with valid token', async () => {
      const validToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'tool_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      const result = await gateway.invokeTool({
        tool_id: 'file_read',
        input: { path: '/test' },
        capability_token: validToken,
      });

      expect(result.allowed).toBe(true);
      expect(result.result).toBeDefined();
    });
  });

  describe('INVARIANT: Unknown adapters are denied', () => {
    it('should deny model invocation for unknown model', async () => {
      const validToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'model_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      const result = await gateway.invokeModel({
        model_id: 'unknown-model', // Not supported
        messages: [{ role: 'user', content: 'Hello' }],
        capability_token: validToken,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No adapter found');
    });

    it('should deny tool invocation for unknown tool', async () => {
      const validToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'tool_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      const result = await gateway.invokeTool({
        tool_id: 'unknown_tool', // Not supported
        input: {},
        capability_token: validToken,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No adapter found');
    });
  });

  describe('INVARIANT: Token budget enforcement', () => {
    it('should deny requests exceeding max tokens', async () => {
      const validToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'model_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      const result = await gateway.invokeModel({
        model_id: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        parameters: { max_tokens: 100000 }, // Exceeds limit of 10000
        capability_token: validToken,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum');
    });
  });

  describe('INVARIANT: Invocation logging for audit', () => {
    it('should log all invocation attempts', async () => {
      const validToken: CapabilityToken = {
        token_id: 'test-token',
        capability: 'model_invocation',
        oi_id: 'test-namespace',
        principal_id: 'test-principal',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };

      // Make some invocations
      await gateway.invokeModel({
        model_id: 'gpt-4',
        messages: [],
        capability_token: validToken,
      });

      await gateway.invokeModel({
        model_id: 'gpt-4',
        messages: [],
        capability_token: null as any, // Will fail
      });

      const log = gateway.getInvocationLog();
      expect(log.length).toBe(2);
      expect(log[0].allowed).toBe(true);
      expect(log[1].allowed).toBe(false);
    });
  });
});
