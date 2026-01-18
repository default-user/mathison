// WHY: Test CDI cross-namespace policy enforcement

import * as fs from 'fs';
import * as path from 'path';
import { loadAuthorityConfig } from '../src/authority';
import {
  checkCDI,
  isCrossNamespaceOperation,
  evaluateCrossNamespacePolicy,
  CDIContext,
} from '../src/cdi';
import { AuthorityConfig } from '../src/types';

describe('CDI Cross-Namespace Policy', () => {
  const testConfigPath = path.join(__dirname, 'test-cdi-authority.json');

  // WHY: Create test configs with different cross-namespace settings
  const createTestConfig = (allowCrossNamespace: boolean): AuthorityConfig => ({
    version: '1.0',
    principal: {
      id: 'test-principal',
      name: 'Test Principal',
      type: 'personal',
    },
    admins: [],
    delegations: [],
    default_permissions: {
      allow_thread_creation: true,
      allow_namespace_creation: true,
      allow_cross_namespace_transfer: allowCrossNamespace,
    },
  });

  afterEach(() => {
    // Clean up test config
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  describe('isCrossNamespaceOperation', () => {
    test('should return false for same-namespace operation', () => {
      const context: CDIContext = {
        source_namespace_id: 'ns-123',
        target_namespace_id: 'ns-123',
      };
      expect(isCrossNamespaceOperation(context)).toBe(false);
    });

    test('should return true for cross-namespace operation', () => {
      const context: CDIContext = {
        source_namespace_id: 'ns-123',
        target_namespace_id: 'ns-456',
      };
      expect(isCrossNamespaceOperation(context)).toBe(true);
    });

    test('should return false when no target namespace specified', () => {
      const context: CDIContext = {
        source_namespace_id: 'ns-123',
      };
      expect(isCrossNamespaceOperation(context)).toBe(false);
    });
  });

  describe('evaluateCrossNamespacePolicy', () => {
    test('should deny cross-namespace operation when not allowed in config', () => {
      // WHY: Default-deny behavior must block cross-namespace without explicit permission
      const context: CDIContext = {
        source_namespace_id: 'ns-123',
        target_namespace_id: 'ns-456',
      };
      const config = createTestConfig(false);

      const result = evaluateCrossNamespacePolicy(context, config);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cross-namespace operation denied');
      expect(result.reason).toContain('ns-123');
      expect(result.reason).toContain('ns-456');
    });

    test('should allow same-namespace operation even when cross-namespace disabled', () => {
      // WHY: Same-namespace operations should never be blocked by cross-namespace policy
      const context: CDIContext = {
        source_namespace_id: 'ns-123',
        target_namespace_id: 'ns-123',
      };
      const config = createTestConfig(false);

      const result = evaluateCrossNamespacePolicy(context, config);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Same-namespace operation permitted');
    });

    test('should allow cross-namespace when explicitly permitted', () => {
      const context: CDIContext = {
        source_namespace_id: 'ns-123',
        target_namespace_id: 'ns-456',
      };
      const config = createTestConfig(true);

      const result = evaluateCrossNamespacePolicy(context, config);

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('explicitly permitted');
    });
  });

  describe('checkCDI integration', () => {
    test('should deny cross-namespace transfer via checkCDI when config forbids it', async () => {
      // WHY: Full integration test of cross-namespace denial through the main checkCDI function
      const config = createTestConfig(false);
      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      loadAuthorityConfig(testConfigPath);

      const context: CDIContext = {
        source_namespace_id: 'ns-source',
        target_namespace_id: 'ns-target',
      };

      const result = await checkCDI('transfer_thread', context);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cross-namespace operation denied');
    });

    test('should allow same-namespace operation via checkCDI', async () => {
      // WHY: Verify same-namespace operations pass through CDI even with cross-namespace disabled
      const config = createTestConfig(false);
      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));
      loadAuthorityConfig(testConfigPath);

      const context: CDIContext = {
        source_namespace_id: 'ns-same',
        target_namespace_id: 'ns-same',
      };

      const result = await checkCDI('transfer_thread', context);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Permitted by policy');
    });
  });
});
