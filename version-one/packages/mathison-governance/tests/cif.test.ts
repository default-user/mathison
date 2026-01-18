// WHY: Test CIF validation to ensure schema enforcement is working

import {
  validateCIF,
  CreateThreadRequestSchema,
  CIF_MAX_STRING_LENGTH,
} from '../src/cif';

describe('CIF Validation', () => {
  describe('validateCIF', () => {
    test('should accept valid CreateThreadRequest', () => {
      const validInput = {
        namespace_id: 'ns-123',
        scope: 'project-alpha',
        priority: 50,
      };

      const result = validateCIF(CreateThreadRequestSchema, validInput);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(validInput);
      expect(result.errors).toBeUndefined();
    });

    test('should reject oversized string fields', () => {
      // WHY: Ensure max length constraint is enforced to prevent payload bombing
      const oversizedScope = 'x'.repeat(CIF_MAX_STRING_LENGTH + 1);
      const oversizedInput = {
        namespace_id: 'ns-123',
        scope: oversizedScope,
        priority: 50,
      };

      const result = validateCIF(CreateThreadRequestSchema, oversizedInput);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0]).toContain('scope');
    });

    test('should reject malformed payload with missing required fields', () => {
      // WHY: Ensure required field enforcement catches incomplete payloads
      const malformedInput = {
        namespace_id: 'ns-123',
        // missing scope and priority
      };

      const result = validateCIF(CreateThreadRequestSchema, malformedInput);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    test('should reject null/undefined input', () => {
      const resultNull = validateCIF(CreateThreadRequestSchema, null);
      expect(resultNull.valid).toBe(false);
      expect(resultNull.errors).toContain('Input cannot be null or undefined');

      const resultUndef = validateCIF(CreateThreadRequestSchema, undefined);
      expect(resultUndef.valid).toBe(false);
      expect(resultUndef.errors).toContain('Input cannot be null or undefined');
    });

    test('should reject invalid types', () => {
      const invalidTypeInput = {
        namespace_id: 'ns-123',
        scope: 'valid-scope',
        priority: 'not-a-number', // should be number
      };

      const result = validateCIF(CreateThreadRequestSchema, invalidTypeInput);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('priority');
    });

    test('should reject priority outside bounds', () => {
      // WHY: Priority constraints (0-100) prevent abuse
      const tooHighPriority = {
        namespace_id: 'ns-123',
        scope: 'valid-scope',
        priority: 150, // max is 100
      };

      const result = validateCIF(CreateThreadRequestSchema, tooHighPriority);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});
