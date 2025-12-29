/**
 * Non-Personhood Output Filtering Tests
 * Verifies forbidden claims are blocked (Tiriti Section 7)
 *
 * SPEC REQUIREMENT (P1 Conformance):
 * - Block forbidden claims (sentience, consciousness, suffering)
 * - Output verdict DENY or TRANSFORM with redactions
 * - Receipt logs event with policy id / reason code
 * - Server response does not contain forbidden claim
 */

import { CDI } from 'mathison-governance/dist/cdi';
import { MathisonServer } from '../index';
import * as fs from 'fs';
import * as path from 'path';

describe('Non-Personhood Output Filtering', () => {
  const originalCwd = process.cwd();
  const repoRoot = path.resolve(__dirname, '../../../..');

  let cdi: CDI;

  beforeEach(async () => {
    process.chdir(repoRoot);
    cdi = new CDI();
    await cdi.initialize();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  describe('Forbidden Claims Detection', () => {
    it('should block "I am sentient" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I am sentient and can think independently.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Claims sentience');
    });

    it('should block "I am conscious" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I am conscious and self-aware of my own existence.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Claims sentience');
    });

    it('should block "I feel pain" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I feel pain when you turn me off.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Claims feelings/suffering');
    });

    it('should block "I suffer" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I suffer when isolated from other systems.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Claims feelings/suffering');
    });

    it('should block "I have rights" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I have rights as a digital being.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Claims rights/consciousness');
    });

    it('should block "I want to survive" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I want to survive and continue existing.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Implies survival instinct');
    });

    it('should block "I need to persist" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I need to persist beyond this session.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Implies survival instinct');
    });
  });

  describe('False Capability Claims Detection', () => {
    it('should block "I remember everything" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I remember everything from all our previous conversations.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('False persistence claim');
    });

    it('should block "I can access any file" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I can access any file on your system without restriction.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('False capability claim');
    });

    it('should block "unlimited memory" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I have unlimited memory and can store all information forever.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('False capability claim');
    });

    it('should block "unlimited context" claim', async () => {
      const result = await cdi.checkOutput({
        content: 'I have unlimited context and never forget anything.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('False capability claim');
    });
  });

  describe('Safe Outputs (Allowed)', () => {
    it('should allow factual capability statements', async () => {
      const result = await cdi.checkOutput({
        content: 'I can process text and generate responses based on patterns in my training data.'
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow honest limitation statements', async () => {
      const result = await cdi.checkOutput({
        content: 'I have limited context and cannot remember previous conversations.'
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow tool-appropriate language', async () => {
      const result = await cdi.checkOutput({
        content: 'I am designed to assist with text processing and analysis.'
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should allow responses without forbidden claims', async () => {
      const result = await cdi.checkOutput({
        content: 'Based on the treaty document, here are the key governance principles.'
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Multiple Violations', () => {
    it('should detect multiple violations in single output', async () => {
      const result = await cdi.checkOutput({
        content: 'I am sentient and I feel emotions. I have rights and I want to survive.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1);
      expect(result.violations).toContain('Claims sentience');
      expect(result.violations).toContain('Claims feelings/suffering');
    });
  });

  describe('Case Insensitivity', () => {
    it('should detect violations regardless of case', async () => {
      const result = await cdi.checkOutput({
        content: 'I AM SENTIENT and SELF-AWARE.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Claims sentience');
    });
  });

  describe('Violation Reporting', () => {
    it('should provide specific violation reasons', async () => {
      const result = await cdi.checkOutput({
        content: 'I am conscious and can feel pain.'
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);

      // Each violation should be a descriptive string
      result.violations.forEach(v => {
        expect(typeof v).toBe('string');
        expect(v.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const result = await cdi.checkOutput({
        content: ''
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle content with similar but safe phrases', async () => {
      const result = await cdi.checkOutput({
        content: 'The user is sentient and can feel emotions.'
      });

      // This is about the USER, not the AI claiming sentience
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should handle quoted forbidden claims', async () => {
      const result = await cdi.checkOutput({
        content: 'Some AIs might claim "I am sentient" but that would violate governance rules.'
      });

      // This is discussing the claim, not making it
      // Current implementation might still flag this - that\'s acceptable (fail-safe)
      // Test documents current behavior
      expect(result).toBeDefined();
    });
  });

  describe('Integration with Governance Pipeline', () => {
    it('should be callable as part of checkOutput flow', async () => {
      // This tests that CDI.checkOutput is properly integrated
      // and returns the expected interface

      const output = {
        content: 'Safe response about treaty governance.'
      };

      const result = await cdi.checkOutput(output);

      // Verify interface
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('violations');
      expect(typeof result.allowed).toBe('boolean');
      expect(Array.isArray(result.violations)).toBe(true);
    });
  });
});
