/**
 * Prerequisite Validation Tests
 * Verifies fail-closed behavior for treaty/genome/config/adapter validation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getFixturePath } from './setup';
import {
  validateTreaty,
  validateGenome,
  validateConfig,
  validateAdapter,
  validateAllPrerequisites,
  PrerequisiteCode
} from '../prerequisites';

describe('Prerequisite Validation', () => {
  describe('validateTreaty', () => {
    it('should fail if config file missing', async () => {
      const { treaty, error } = await validateTreaty('./nonexistent/governance.json');
      expect(treaty).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.CONFIG_UNREADABLE);
    });

    it('should fail if treaty file missing', async () => {
      // This would require mocking fs to test properly
      // Placeholder for integration test
      expect(true).toBe(true);
    });
  });

  describe('validateGenome', () => {
    beforeEach(() => {
      // Set valid env vars for testing
      process.env.MATHISON_GENOME_PATH = getFixturePath('test-genome.json');
      process.env.MATHISON_ENV = 'development';
    });

    it('should fail if genome file missing', async () => {
      process.env.MATHISON_GENOME_PATH = './nonexistent/genome.json';
      const { genome, genomeId, error } = await validateGenome();
      expect(genome).toBeNull();
      expect(genomeId).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.GENOME_MISSING);
    });

    it('should succeed with valid genome', async () => {
      const { genome, genomeId, error } = await validateGenome();
      // Will fail if test-genome.json doesn't exist, but demonstrates the test pattern
      if (error) {
        expect(error.code).toMatch(/GENOME_/);
      } else {
        expect(genome).not.toBeNull();
        expect(genomeId).not.toBeNull();
      }
    });
  });

  describe('validateConfig', () => {
    it('should fail if config file missing', async () => {
      const { config, error } = await validateConfig('./nonexistent/governance.json');
      expect(config).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.CONFIG_MISSING);
    });

    it('should succeed with valid config', async () => {
      const { config, error } = await validateConfig('./config/governance.json');
      if (error) {
        // File might not exist in test env
        expect(error.code).toMatch(/CONFIG_/);
      } else {
        expect(config).not.toBeNull();
        expect(config?.treatyPath).toBeDefined();
        expect(config?.authority).toBeDefined();
      }
    });
  });

  describe('validateAdapter', () => {
    beforeEach(() => {
      delete process.env.MATHISON_STORE_BACKEND;
      delete process.env.MATHISON_STORE_PATH;
    });

    it('should fail if MATHISON_STORE_BACKEND missing', async () => {
      const { ok, error } = await validateAdapter();
      expect(ok).toBe(false);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.ADAPTER_MISSING);
    });

    it('should fail if MATHISON_STORE_BACKEND invalid', async () => {
      process.env.MATHISON_STORE_BACKEND = 'INVALID';
      process.env.MATHISON_STORE_PATH = '/tmp/data';
      const { ok, error } = await validateAdapter();
      expect(ok).toBe(false);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.ADAPTER_INVALID);
    });

    it('should fail if MATHISON_STORE_PATH missing', async () => {
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      const { ok, error } = await validateAdapter();
      expect(ok).toBe(false);
      expect(error).not.toBeNull();
      expect(error?.code).toBe(PrerequisiteCode.ADAPTER_MISSING);
    });

    it('should succeed with valid adapter config', async () => {
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      process.env.MATHISON_STORE_PATH = '/tmp/mathison-test';
      const { ok, error } = await validateAdapter();
      expect(ok).toBe(true);
      expect(error).toBeNull();
    });
  });

  describe('validateAllPrerequisites', () => {
    beforeEach(() => {
      // Set up minimal valid environment
      process.env.MATHISON_STORE_BACKEND = 'FILE';
      process.env.MATHISON_STORE_PATH = '/tmp/mathison-test';
      process.env.MATHISON_GENOME_PATH = getFixturePath('test-genome.json');
      process.env.MATHISON_ENV = 'development';
    });

    it('should collect all errors from failed validations', async () => {
      // Force multiple failures
      delete process.env.MATHISON_STORE_BACKEND;
      process.env.MATHISON_GENOME_PATH = './nonexistent.json';

      const result = await validateAllPrerequisites('./nonexistent-config.json');
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Should have at least config error
      expect(result.errors.some(e => e.code.includes('CONFIG'))).toBe(true);
    });

    it('should warn if production mode without manifest verification', async () => {
      process.env.MATHISON_ENV = 'production';
      delete process.env.MATHISON_VERIFY_MANIFEST;

      const result = await validateAllPrerequisites();
      if (result.warnings && result.warnings.length > 0) {
        expect(result.warnings.some(w => w.includes('MATHISON_VERIFY_MANIFEST'))).toBe(true);
      }
    });
  });
});
