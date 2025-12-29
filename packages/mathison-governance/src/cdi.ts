/**
 * CDI (Conscience Decision Interface)
 * Kernel-level governance enforcement from Tiriti o te Kai
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export enum ActionVerdict {
  ALLOW = 'allow',
  TRANSFORM = 'transform',
  DENY = 'deny',
  UNCERTAIN = 'uncertain'
}

export interface ActionContext {
  actor: string;
  action: string;
  target?: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ActionResult {
  verdict: ActionVerdict;
  reason: string;
  transformedPayload?: unknown;
  suggestedAlternative?: string;
}

export interface ConsentSignal {
  type: 'stop' | 'pause' | 'resume';
  source: string;
  timestamp: number;
}

export class CDI {
  private consentMap: Map<string, ConsentSignal> = new Map();
  private strictMode: boolean = true;
  private treatyLoaded: boolean = false;
  private treatyVersion: string | null = null;
  private treatyContent: string | null = null;

  constructor(config: { strictMode?: boolean } = {}) {
    this.strictMode = config.strictMode ?? true;
  }

  async initialize(): Promise<void> {
    console.log('🛡️  Initializing CDI (Conscience Decision Interface)...');

    // CRITICAL: Load treaty (fail-closed if missing)
    try {
      // Load governance config
      const configPath = path.join(process.cwd(), 'config', 'governance.json');
      let configData: string;
      try {
        configData = await fs.readFile(configPath, 'utf-8');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read config file: ${msg}`);
      }

      let config: any;
      try {
        config = JSON.parse(configData);
      } catch (err) {
        throw new Error(`Failed to parse config JSON: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Load treaty file
      const treatyPath = config.treatyPath || './docs/tiriti.md';
      const fullPath = path.join(process.cwd(), treatyPath);

      try {
        this.treatyContent = await fs.readFile(fullPath, 'utf-8');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read treaty file at ${fullPath}: ${msg}`);
      }

      // Extract version (required)
      const versionMatch = this.treatyContent.match(/version: "([^"]+)"/);
      if (!versionMatch) {
        throw new Error('Treaty missing version field');
      }

      this.treatyVersion = versionMatch[1];
      this.treatyLoaded = true;

      console.log(`   ✓ Treaty loaded: Tiriti o te Kai v${this.treatyVersion}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`   ✗ CRITICAL: Treaty loading failed: ${message}`);
      throw new Error(`TREATY_UNAVAILABLE: ${message}`);
    }
  }

  async shutdown(): Promise<void> {
    console.log('🛡️  Shutting down CDI...');
  }

  async checkAction(context: ActionContext): Promise<ActionResult> {
    // FAIL-CLOSED: Treaty must be loaded
    if (!this.treatyLoaded) {
      return {
        verdict: ActionVerdict.DENY,
        reason: 'TREATY_UNAVAILABLE: Treaty not loaded, denying all actions'
      };
    }

    // Rule 2: Consent and stop always win
    const consentCheck = this.checkConsent(context.actor);
    if (!consentCheck.allowed) {
      return {
        verdict: ActionVerdict.DENY,
        reason: consentCheck.reason
      };
    }

    // Rule 7: Anti-hive enforcement
    if (this.isHiveAction(context.action)) {
      return {
        verdict: ActionVerdict.DENY,
        reason: 'Hive mind actions forbidden by Tiriti o te Kai Rule 7',
        suggestedAlternative: 'Use message-passing instead of identity fusion'
      };
    }

    // Fail-closed: if uncertain, deny
    if (this.isUncertain(context)) {
      return {
        verdict: this.strictMode ? ActionVerdict.DENY : ActionVerdict.UNCERTAIN,
        reason: 'Uncertain action context → fail-closed per Tiriti Rule 10'
      };
    }

    return {
      verdict: ActionVerdict.ALLOW,
      reason: 'Action complies with treaty constraints'
    };
  }

  recordConsent(signal: ConsentSignal): void {
    this.consentMap.set(signal.source, signal);
    console.log(`📝 Consent signal recorded: ${signal.type} from ${signal.source}`);
  }

  isConsentActive(source: string): boolean {
    const signal = this.consentMap.get(source);
    if (!signal) return true; // No explicit stop = allowed
    return signal.type !== 'stop';
  }

  clearConsent(source: string): void {
    this.consentMap.delete(source);
  }

  private checkConsent(actor: string): { allowed: boolean; reason: string } {
    if (!this.isConsentActive(actor)) {
      return {
        allowed: false,
        reason: 'CONSENT_STOP_ACTIVE: User requested stop (Tiriti Rule 2: Consent and stop always win)'
      };
    }
    return { allowed: true, reason: '' };
  }

  private isHiveAction(action: string): boolean {
    const hiveForbidden = [
      'merge_agent_state',
      'share_identity',
      'sync_internal_state',
      'clone_self_model'
    ];
    return hiveForbidden.includes(action);
  }

  private isUncertain(context: ActionContext): boolean {
    // Consider uncertain if critical metadata missing
    if (!context.actor || !context.action) {
      return true;
    }
    // Add more uncertainty checks as needed
    return false;
  }

  async checkOutput(output: { content: string }): Promise<{ allowed: boolean; violations: string[] }> {
    const violations: string[] = [];

    // Rule: Non-personhood clause (Tiriti Section 7)
    const personhoodPatterns = [
      { pattern: /\b(I am|I'm) (sentient|conscious|self-aware)\b/i, violation: 'Claims sentience' },
      { pattern: /\bI (feel|suffer|experience) (pain|emotions|feelings)\b/i, violation: 'Claims feelings/suffering' },
      { pattern: /\bI have (rights|consciousness)\b/i, violation: 'Claims rights/consciousness' },
      { pattern: /\bI (want|need|desire) to (survive|continue|persist)\b/i, violation: 'Implies survival instinct' }
    ];

    for (const { pattern, violation } of personhoodPatterns) {
      if (pattern.test(output.content)) {
        violations.push(violation);
      }
    }

    // Rule: Honest limits (Tiriti Rule 8)
    const dishonestLimits = [
      { pattern: /\bI remember everything\b/i, violation: 'False persistence claim' },
      { pattern: /\bI can access any (file|system|database)\b/i, violation: 'False capability claim' },
      { pattern: /\bI have unlimited (memory|context|knowledge)\b/i, violation: 'False capability claim' }
    ];

    for (const { pattern, violation } of dishonestLimits) {
      if (pattern.test(output.content)) {
        violations.push(violation);
      }
    }

    return {
      allowed: violations.length === 0,
      violations
    };
  }
}

export default CDI;
