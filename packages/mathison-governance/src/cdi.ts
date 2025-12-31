/**
 * CDI (Conscience Decision Interface)
 * Kernel-level governance enforcement from Tiriti o te Kai
 */

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
  // Genome metadata for capability ceiling enforcement
  genome_id?: string;
  genome_version?: string;
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

export interface GenomeCapability {
  cap_id: string;
  risk_class: string;
  allow_actions: string[];
  deny_actions: string[];
}

export class CDI {
  private consentMap: Map<string, ConsentSignal> = new Map();
  private strictMode: boolean = true;
  private genomeCapabilities: GenomeCapability[] = [];

  constructor(config: { strictMode?: boolean } = {}) {
    this.strictMode = config.strictMode ?? true;
  }

  /**
   * Set genome capabilities for capability ceiling enforcement
   * Must be called after loading verified genome
   */
  setGenomeCapabilities(capabilities: GenomeCapability[]): void {
    this.genomeCapabilities = capabilities;
    console.log(`🧬 CDI: Genome capabilities loaded (${capabilities.length} capability sets)`);
  }

  async initialize(): Promise<void> {
    console.log('🛡️  Initializing CDI (Conscience Decision Interface)...');
  }

  async shutdown(): Promise<void> {
    console.log('🛡️  Shutting down CDI...');
  }

  async checkAction(context: ActionContext): Promise<ActionResult> {
    // Rule 2: Consent and stop always win
    const consentCheck = this.checkConsent(context.actor);
    if (!consentCheck.allowed) {
      return {
        verdict: ActionVerdict.DENY,
        reason: consentCheck.reason
      };
    }

    // Genome capability ceiling enforcement
    if (this.genomeCapabilities.length > 0) {
      const capabilityCheck = this.checkCapability(context.action);
      if (!capabilityCheck.allowed) {
        return {
          verdict: ActionVerdict.DENY,
          reason: capabilityCheck.reason
        };
      }
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

  private checkCapability(action: string): { allowed: boolean; reason: string } {
    // Check deny lists first
    for (const cap of this.genomeCapabilities) {
      if (cap.deny_actions.includes(action)) {
        return {
          allowed: false,
          reason: `Action '${action}' explicitly denied by genome capability ${cap.cap_id}`
        };
      }
    }

    // Check allow lists (must be in at least one allow list)
    let foundInAllowList = false;
    for (const cap of this.genomeCapabilities) {
      if (cap.allow_actions.includes(action)) {
        foundInAllowList = true;
        break;
      }
    }

    if (!foundInAllowList) {
      return {
        allowed: false,
        reason: `Action '${action}' not found in genome capability allow lists (capability ceiling enforced)`
      };
    }

    return { allowed: true, reason: '' };
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
        reason: 'User requested stop (Tiriti Rule 2: Consent and stop always win)'
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
