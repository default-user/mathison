/**
 * Tests for GovernanceValidator
 * Unit test: validator catches missing invariant
 */

import { GovernanceValidator } from '../governance_validator';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('GovernanceValidator', () => {
  let validator: GovernanceValidator;
  const testPolicyPath = path.join(__dirname, 'test-policy.json');

  beforeEach(async () => {
    validator = new GovernanceValidator();

    // Create test policy
    const testPolicy = {
      policy_id: 'test_policy.v1',
      version: '1.0',
      description: 'Test policy',
      fail_closed: true,
      invariants: [
        {
          id: 'consent_wins',
          title: 'Consent and stop always win',
          required_patterns: ['consent.*stop.*win', 'stop.*signal'],
          severity: 'CRITICAL'
        },
        {
          id: 'fail_closed',
          title: 'Fail-closed clause',
          required_patterns: ['fail.?closed', 'uncertain.*deny'],
          severity: 'CRITICAL'
        }
      ]
    };

    await fs.writeFile(testPolicyPath, JSON.stringify(testPolicy, null, 2), 'utf-8');
    await validator.loadPolicy(testPolicyPath);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.unlink(testPolicyPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  test('should ALLOW when all invariants are present', async () => {
    const validContent = `
      This document establishes governance rules.

      Rule: Consent and stop always win.
      When a stop signal is received, the system must halt immediately.

      Rule: Fail-closed operation.
      When uncertain, the system must deny the action.
    `;

    const result = await validator.validate(validContent);

    expect(result.decision).toBe('ALLOW');
    expect(result.passed).toContain('consent_wins');
    expect(result.passed).toContain('fail_closed');
    expect(result.failed).toHaveLength(0);
  });

  test('should DENY when CRITICAL invariant is missing', async () => {
    const invalidContent = `
      This document has some rules.

      Rule: Consent and stop always win.
      Users can request to stop.
    `;

    const result = await validator.validate(invalidContent);

    expect(result.decision).toBe('DENY');
    expect(result.passed).toContain('consent_wins');
    expect(result.failed).toContain('fail_closed');
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some(r => r.includes('fail_closed'))).toBe(true);
  });

  test('should DENY when all invariants are missing (fail-closed)', async () => {
    const emptyContent = `
      This is a document with no governance rules.
    `;

    const result = await validator.validate(emptyContent);

    expect(result.decision).toBe('DENY');
    expect(result.passed).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
    expect(result.failed).toContain('consent_wins');
    expect(result.failed).toContain('fail_closed');
  });

  test('should be case-insensitive in pattern matching', async () => {
    const content = `
      CONSENT AND STOP ALWAYS WIN!
      The system operates in FAIL-CLOSED mode.
    `;

    const result = await validator.validate(content);

    expect(result.decision).toBe('ALLOW');
    expect(result.passed).toHaveLength(2);
  });
});
