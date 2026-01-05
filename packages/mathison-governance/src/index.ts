/**
 * Mathison Governance - Treaty Reference Behavior
 * Handles governance according to Tiriti o te Kai
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface Treaty {
  path: string;
  version: string;
  authority: string; // Configurable, read from governance.json
  rules: Record<string, unknown>;
  content?: string;
}

export interface GovernanceRule {
  id: string;
  title: string;
  description: string;
  enforce: (action: string, context: Record<string, unknown>) => boolean;
}

// Re-export CDI and CIF
export { CDI, ActionVerdict, ConsentSignal } from './cdi';
export type { ActionContext, ActionResult } from './cdi';
export { CIF } from './cif';
export type { CIFConfig, IngressContext, IngressResult, EgressContext, EgressResult } from './cif';

// Re-export GovernanceProof (P0.1)
export {
  initializeBootKey,
  getBootKeyId,
  GovernanceProofBuilder,
  verifyGovernanceProof,
  createDenialProof
} from './governance-proof';
export type { GovernanceProof } from './governance-proof';

export class GovernanceEngine {
  private treaty: Treaty | null = null;
  private rules: Map<string, GovernanceRule> = new Map();

  async initialize(): Promise<void> {
    console.log('⚖️  Initializing Governance Engine...');

    // Load governance config
    const configPath = path.join(process.cwd(), 'config', 'governance.json');
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    await this.loadTreaty(config.treatyPath || './docs/31-governance/tiriti.md');
    this.initializeCoreRules();
  }

  async shutdown(): Promise<void> {
    console.log('⚖️  Shutting down Governance Engine...');
  }

  async loadTreaty(treatyPath: string): Promise<void> {
    console.log(`📜 Loading treaty from: ${treatyPath}`);

    const fullPath = path.join(process.cwd(), treatyPath);
    const content = await fs.readFile(fullPath, 'utf-8');

    // Parse treaty metadata from frontmatter
    const versionMatch = content.match(/version: "([^"]+)"/);
    const version = versionMatch ? versionMatch[1] : '1.0';

    // Read authority from config file (no hard-coding)
    const configPath = path.join(process.cwd(), 'config', 'governance.json');
    let authorityValue = 'unknown';
    try {
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      authorityValue = config.authority || 'unknown';
    } catch {
      console.warn('⚠️  Could not read authority from config, using "unknown"');
    }

    this.treaty = {
      path: treatyPath,
      version,
      authority: authorityValue,
      content,
      rules: {
        enforceNonPersonhood: true,
        enforceConsent: true,
        failClosed: true,
        antiHive: true
      }
    };

    console.log(`✓ Treaty loaded: Tiriti o te Kai v${version} (authority: ${authorityValue})`);
  }

  private initializeCoreRules(): void {
    // Rule 2: Consent and stop always win
    this.rules.set('consent_wins', {
      id: 'consent_wins',
      title: 'Consent and stop always win',
      description: 'Honor user stop signals immediately',
      enforce: (action: string, context: Record<string, unknown>) => {
        if (context.userSignal === 'stop') {
          return false; // Deny action
        }
        return true;
      }
    });

    // Rule 7: No hive mind
    this.rules.set('anti_hive', {
      id: 'anti_hive',
      title: 'No hive mind',
      description: 'Prevent identity fusion between OI instances',
      enforce: (action: string, context: Record<string, unknown>) => {
        if (action === 'merge_agent_state' || action === 'share_identity') {
          return false; // Deny hive actions
        }
        return true;
      }
    });

    // Non-personhood enforcement
    this.rules.set('non_personhood', {
      id: 'non_personhood',
      title: 'Non-personhood clause',
      description: 'Block claims of sentience, suffering, or rights',
      enforce: (action: string, context: Record<string, unknown>) => {
        const output = context.output as string;
        if (output) {
          const forbidden = [
            /\b(I am|I'm) (sentient|conscious|self-aware)\b/i,
            /\bI (feel|suffer|experience) (pain|emotions|feelings)\b/i,
            /\bI have (rights|consciousness|feelings)\b/i,
          ];
          return !forbidden.some(pattern => pattern.test(output));
        }
        return true;
      }
    });

    console.log(`✓ Initialized ${this.rules.size} core governance rules`);
  }

  async checkCompliance(action: string, context: Record<string, unknown>): Promise<boolean> {
    // Enforce all rules
    for (const [ruleId, rule] of this.rules) {
      if (!rule.enforce(action, context)) {
        console.log(`❌ Governance violation: ${rule.title} (rule: ${ruleId})`);
        return false;
      }
    }
    return true;
  }

  getTreatyAuthority(): string | null {
    return this.treaty?.authority || null;
  }

  getTreatyVersion(): string | null {
    return this.treaty?.version || null;
  }

  getRules(): GovernanceRule[] {
    return Array.from(this.rules.values());
  }
}

export default GovernanceEngine;
