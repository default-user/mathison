/**
 * Governance Invariants Validator
 * Fail-closed: missing invariants result in DENY
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface Invariant {
  id: string;
  title: string;
  required_patterns: string[];
  section_hint?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

export interface Policy {
  policy_id: string;
  version: string;
  description: string;
  fail_closed: boolean;
  invariants: Invariant[];
}

export interface ValidationResult {
  decision: 'ALLOW' | 'DENY';
  policy_id: string;
  passed: string[];
  failed: string[];
  reasons: string[];
}

export class GovernanceValidator {
  private policy: Policy | null = null;

  async loadPolicy(policyPath: string): Promise<void> {
    const content = await fs.readFile(policyPath, 'utf-8');
    this.policy = JSON.parse(content) as Policy;
  }

  /**
   * Validate treaty document against governance invariants
   * Fail-closed: any missing invariant results in DENY
   */
  async validate(tiritiContent: string): Promise<ValidationResult> {
    if (!this.policy) {
      throw new Error('Policy not loaded. Call loadPolicy() first.');
    }

    const passed: string[] = [];
    const failed: string[] = [];
    const reasons: string[] = [];

    // Normalize content for pattern matching
    const normalizedContent = tiritiContent.toLowerCase();

    for (const invariant of this.policy.invariants) {
      const found = this.checkInvariant(normalizedContent, invariant);

      if (found) {
        passed.push(invariant.id);
      } else {
        failed.push(invariant.id);
        reasons.push(
          `Missing required invariant: ${invariant.title} (${invariant.id})${
            invariant.section_hint ? ` [expected in section ${invariant.section_hint}]` : ''
          }`
        );
      }
    }

    // Fail-closed logic
    const decision = failed.length === 0 ? 'ALLOW' : 'DENY';

    // If any CRITICAL invariant fails, it's a DENY
    if (failed.length > 0) {
      const criticalFailed = failed.filter(id => {
        const inv = this.policy!.invariants.find(i => i.id === id);
        return inv?.severity === 'CRITICAL';
      });

      if (criticalFailed.length > 0) {
        reasons.unshift(`CRITICAL invariants missing: ${criticalFailed.join(', ')}`);
      }
    }

    return {
      decision,
      policy_id: this.policy.policy_id,
      passed,
      failed,
      reasons
    };
  }

  /**
   * Check if an invariant's patterns are present in the content
   */
  private checkInvariant(normalizedContent: string, invariant: Invariant): boolean {
    // At least one pattern must match
    return invariant.required_patterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(normalizedContent);
    });
  }

  /**
   * Get loaded policy info
   */
  getPolicyInfo(): { id: string; version: string; description: string } | null {
    if (!this.policy) return null;

    return {
      id: this.policy.policy_id,
      version: this.policy.version,
      description: this.policy.description
    };
  }
}

export default GovernanceValidator;
