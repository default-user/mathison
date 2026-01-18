// WHY: Test authority config loading and validation

import * as fs from 'fs';
import * as path from 'path';
import { loadAuthorityConfig, getCurrentPrincipal } from '../src/authority';

describe('Authority', () => {
  const testConfigPath = path.join(__dirname, 'test-authority.json');

  beforeAll(() => {
    // Create test config
    const testConfig = {
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
        allow_cross_namespace_transfer: false,
      },
    };
    fs.writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));
  });

  afterAll(() => {
    // Clean up test config
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  test('should load valid authority config', () => {
    const config = loadAuthorityConfig(testConfigPath);
    expect(config.principal.id).toBe('test-principal');
    expect(config.version).toBe('1.0');
  });

  test('should get current principal after loading config', () => {
    loadAuthorityConfig(testConfigPath);
    const principal = getCurrentPrincipal();
    expect(principal.id).toBe('test-principal');
    expect(principal.name).toBe('Test Principal');
  });

  test('should throw if config file not found', () => {
    expect(() => {
      loadAuthorityConfig('/nonexistent/path.json');
    }).toThrow('Authority config not found');
  });
});
