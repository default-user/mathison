/**
 * Mathison v2.1 Adapter Conformance Checker
 *
 * Verifies that adapters conform to the required contract.
 * CI MUST FAIL if adapters violate the contract.
 */

import {
  ModelAdapter,
  ToolAdapter,
  ConformanceResult,
  ConformanceViolation,
  CapabilityToken,
} from './types';

/**
 * Check model adapter conformance
 */
export function checkModelAdapterConformance(
  adapter: ModelAdapter
): ConformanceResult {
  const violations: ConformanceViolation[] = [];

  // Check required properties
  if (!adapter.id) {
    violations.push({
      code: 'MISSING_ID',
      message: 'Adapter must have an id property',
      severity: 'error',
    });
  }

  if (!adapter.supported_families || adapter.supported_families.length === 0) {
    violations.push({
      code: 'MISSING_FAMILIES',
      message: 'Adapter must declare supported model families',
      severity: 'error',
    });
  }

  if (typeof adapter.invoke !== 'function') {
    violations.push({
      code: 'MISSING_INVOKE',
      message: 'Adapter must implement invoke method',
      severity: 'error',
    });
  }

  if (typeof adapter.supports !== 'function') {
    violations.push({
      code: 'MISSING_SUPPORTS',
      message: 'Adapter must implement supports method',
      severity: 'error',
    });
  }

  return {
    conforms: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
    adapter_id: adapter.id || 'unknown',
    checked_at: new Date(),
  };
}

/**
 * Check tool adapter conformance
 */
export function checkToolAdapterConformance(
  adapter: ToolAdapter
): ConformanceResult {
  const violations: ConformanceViolation[] = [];

  // Check required properties
  if (!adapter.id) {
    violations.push({
      code: 'MISSING_ID',
      message: 'Adapter must have an id property',
      severity: 'error',
    });
  }

  if (typeof adapter.getTools !== 'function') {
    violations.push({
      code: 'MISSING_GET_TOOLS',
      message: 'Adapter must implement getTools method',
      severity: 'error',
    });
  }

  if (typeof adapter.invoke !== 'function') {
    violations.push({
      code: 'MISSING_INVOKE',
      message: 'Adapter must implement invoke method',
      severity: 'error',
    });
  }

  if (typeof adapter.supports !== 'function') {
    violations.push({
      code: 'MISSING_SUPPORTS',
      message: 'Adapter must implement supports method',
      severity: 'error',
    });
  }

  // Check tool definitions
  try {
    const tools = adapter.getTools();
    for (const tool of tools) {
      if (!tool.id) {
        violations.push({
          code: 'TOOL_MISSING_ID',
          message: `Tool is missing id property`,
          severity: 'error',
        });
      }
      if (!tool.name) {
        violations.push({
          code: 'TOOL_MISSING_NAME',
          message: `Tool ${tool.id} is missing name property`,
          severity: 'error',
        });
      }
      if (!tool.category) {
        violations.push({
          code: 'TOOL_MISSING_CATEGORY',
          message: `Tool ${tool.id} is missing category property`,
          severity: 'error',
        });
      }
      if (!tool.risk_level) {
        violations.push({
          code: 'TOOL_MISSING_RISK_LEVEL',
          message: `Tool ${tool.id} is missing risk_level property`,
          severity: 'warning',
        });
      }
    }
  } catch (error) {
    violations.push({
      code: 'GET_TOOLS_ERROR',
      message: `getTools() threw an error: ${error}`,
      severity: 'error',
    });
  }

  return {
    conforms: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
    adapter_id: adapter.id || 'unknown',
    checked_at: new Date(),
  };
}

/**
 * Test that adapter rejects calls without capability tokens.
 * This is critical for security.
 */
export async function testCapabilityEnforcement(
  adapter: ModelAdapter | ToolAdapter,
  type: 'model' | 'tool'
): Promise<ConformanceResult> {
  const violations: ConformanceViolation[] = [];
  const adapterId = adapter.id || 'unknown';

  if (type === 'model') {
    const modelAdapter = adapter as ModelAdapter;

    // Test with null token
    try {
      await modelAdapter.invoke({
        model_id: 'test',
        messages: [],
        capability_token: null as any,
      });
      violations.push({
        code: 'ACCEPTS_NULL_TOKEN',
        message: 'Adapter accepted invocation with null capability token',
        severity: 'error',
      });
    } catch {
      // Expected - adapter should reject
    }

    // Test with expired token
    try {
      const expiredToken: CapabilityToken = {
        token_id: 'test',
        capability: 'model_invocation',
        oi_id: 'test',
        principal_id: 'test',
        expires_at: new Date(Date.now() - 1000), // Expired
        constraints: {},
      };
      await modelAdapter.invoke({
        model_id: 'test',
        messages: [],
        capability_token: expiredToken,
      });
      violations.push({
        code: 'ACCEPTS_EXPIRED_TOKEN',
        message: 'Adapter accepted invocation with expired capability token',
        severity: 'error',
      });
    } catch {
      // Expected - adapter should reject
    }

    // Test with wrong capability
    try {
      const wrongToken: CapabilityToken = {
        token_id: 'test',
        capability: 'tool_invocation', // Wrong capability
        oi_id: 'test',
        principal_id: 'test',
        expires_at: new Date(Date.now() + 60000),
        constraints: {},
      };
      await modelAdapter.invoke({
        model_id: 'test',
        messages: [],
        capability_token: wrongToken,
      });
      violations.push({
        code: 'ACCEPTS_WRONG_CAPABILITY',
        message: 'Adapter accepted invocation with wrong capability type',
        severity: 'error',
      });
    } catch {
      // Expected - adapter should reject
    }
  } else {
    const toolAdapter = adapter as ToolAdapter;

    // Test with null token
    try {
      await toolAdapter.invoke({
        tool_id: 'test',
        input: {},
        capability_token: null as any,
      });
      violations.push({
        code: 'ACCEPTS_NULL_TOKEN',
        message: 'Adapter accepted invocation with null capability token',
        severity: 'error',
      });
    } catch {
      // Expected - adapter should reject
    }

    // Test with expired token
    try {
      const expiredToken: CapabilityToken = {
        token_id: 'test',
        capability: 'tool_invocation',
        oi_id: 'test',
        principal_id: 'test',
        expires_at: new Date(Date.now() - 1000), // Expired
        constraints: {},
      };
      await toolAdapter.invoke({
        tool_id: 'test',
        input: {},
        capability_token: expiredToken,
      });
      violations.push({
        code: 'ACCEPTS_EXPIRED_TOKEN',
        message: 'Adapter accepted invocation with expired capability token',
        severity: 'error',
      });
    } catch {
      // Expected - adapter should reject
    }
  }

  return {
    conforms: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
    adapter_id: adapterId,
    checked_at: new Date(),
  };
}

/**
 * Run full conformance suite on an adapter
 */
export async function runConformanceSuite(
  adapter: ModelAdapter | ToolAdapter,
  type: 'model' | 'tool'
): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = [];

  // Basic conformance
  if (type === 'model') {
    results.push(checkModelAdapterConformance(adapter as ModelAdapter));
  } else {
    results.push(checkToolAdapterConformance(adapter as ToolAdapter));
  }

  // Capability enforcement
  results.push(await testCapabilityEnforcement(adapter, type));

  return results;
}
