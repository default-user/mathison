/**
 * Unit tests for ToolGateway
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ToolGateway, ToolDefinition, ResourceScope } from '../tool-gateway';
import { mintSingleUseToken, initializeTokenKey } from '../../capability-token';
import { actionRegistry } from '../../action-registry';

// Initialize token signing key for tests
beforeEach(() => {
  const testKey = Buffer.from('test-key-for-token-signing-32bytes!');
  initializeTokenKey(testKey, 'test-boot-key');
});

describe('ToolGateway', () => {
  test('deny-by-default: unregistered tool is denied', async () => {
    const gateway = new ToolGateway();
    const token = mintSingleUseToken('action:read:health', 'test-actor');

    const result = await gateway.invoke(
      'unknown-tool',
      {},
      token,
      { actor: 'test-actor' }
    );

    expect(result.success).toBe(false);
    expect(result.denied_reason).toContain('TOOL_NOT_REGISTERED');
  });

  test('registered tool with valid token succeeds', async () => {
    const gateway = new ToolGateway();

    // Register a test tool
    const toolDef: ToolDefinition = {
      name: 'test-tool',
      description: 'Test tool',
      action_id: 'action:read:health',
      required_scopes: [{ type: 'governance:validate' }],
      handler: async (args) => ({ result: 'success', args })
    };
    gateway.registerTool(toolDef);

    const token = mintSingleUseToken('action:read:health', 'test-actor');

    const result = await gateway.invoke(
      'test-tool',
      { test: 'data' },
      token,
      { actor: 'test-actor' }
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ result: 'success', args: { test: 'data' } });
  });

  test('invalid token is denied', async () => {
    const gateway = new ToolGateway();

    const toolDef: ToolDefinition = {
      name: 'test-tool',
      description: 'Test tool',
      action_id: 'action:read:health',
      required_scopes: [],
      handler: async () => ({ result: 'success' })
    };
    gateway.registerTool(toolDef);

    // Create token with wrong action_id
    const token = mintSingleUseToken('action:read:genome', 'test-actor');

    const result = await gateway.invoke(
      'test-tool',
      {},
      token,
      { actor: 'test-actor' }
    );

    expect(result.success).toBe(false);
    expect(result.denied_reason).toContain('CAPABILITY_DENIED');
  });

  test('expired token is denied', async () => {
    const gateway = new ToolGateway();

    const toolDef: ToolDefinition = {
      name: 'test-tool',
      description: 'Test tool',
      action_id: 'action:read:health',
      required_scopes: [],
      handler: async () => ({ result: 'success' })
    };
    gateway.registerTool(toolDef);

    // Create token that expires immediately
    const { mintToken } = await import('../../capability-token');
    const token = mintToken({
      action_id: 'action:read:health',
      actor: 'test-actor',
      ttl_ms: -1000 // Already expired
    });

    const result = await gateway.invoke(
      'test-tool',
      {},
      token,
      { actor: 'test-actor' }
    );

    expect(result.success).toBe(false);
    expect(result.denied_reason).toContain('CAPABILITY_DENIED');
    expect(result.denied_reason).toContain('expired');
  });

  test('tool handler error is caught and returned', async () => {
    const gateway = new ToolGateway();

    const toolDef: ToolDefinition = {
      name: 'failing-tool',
      description: 'Tool that fails',
      action_id: 'action:read:health',
      required_scopes: [],
      handler: async () => {
        throw new Error('Tool execution failed');
      }
    };
    gateway.registerTool(toolDef);

    const token = mintSingleUseToken('action:read:health', 'test-actor');

    const result = await gateway.invoke(
      'failing-tool',
      {},
      token,
      { actor: 'test-actor' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Tool execution failed');
    expect(result.denied_reason).toBe('TOOL_EXECUTION_FAILED');
  });

  test('listTools returns registered tools', () => {
    const gateway = new ToolGateway();

    gateway.registerTool({
      name: 'tool1',
      description: 'Tool 1',
      action_id: 'action:read:health',
      required_scopes: [],
      handler: async () => ({})
    });

    gateway.registerTool({
      name: 'tool2',
      description: 'Tool 2',
      action_id: 'action:read:genome',
      required_scopes: [],
      handler: async () => ({})
    });

    const tools = gateway.listTools();
    expect(tools).toEqual(['tool1', 'tool2']);
  });

  test('duplicate tool registration is rejected', () => {
    const gateway = new ToolGateway();

    const toolDef: ToolDefinition = {
      name: 'duplicate-tool',
      description: 'Test',
      action_id: 'action:read:health',
      required_scopes: [],
      handler: async () => ({})
    };

    gateway.registerTool(toolDef);

    expect(() => {
      gateway.registerTool(toolDef);
    }).toThrow('TOOL_ALREADY_REGISTERED');
  });

  test('invocation log is maintained', async () => {
    const gateway = new ToolGateway();

    gateway.registerTool({
      name: 'logged-tool',
      description: 'Test',
      action_id: 'action:read:health',
      required_scopes: [],
      handler: async () => ({})
    });

    const token = mintSingleUseToken('action:read:health', 'test-actor');

    await gateway.invoke('logged-tool', {}, token, { actor: 'test-actor' });

    const log = gateway.getInvocationLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[log.length - 1].tool).toBe('logged-tool');
    expect(log[log.length - 1].actor).toBe('test-actor');
    expect(log[log.length - 1].result).toBe('allow');
  });
});
