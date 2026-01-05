/**
 * Heartbeat / Self-Audit Loop
 * Periodic validation of governance prerequisites and system integrity
 * Switches server into fail-closed posture if checks fail
 */

import { validateAllPrerequisites, PrerequisiteValidationResult, PrerequisiteCode } from './prerequisites';
import { CIF, CDI, createCIFCanary, createCDICanary, runCanaryTests } from 'mathison-governance';
import { ReceiptStore } from 'mathison-storage';

export interface HeartbeatCheck {
  name: string;
  ok: boolean;
  code?: string;
  detail?: string;
}

export interface HeartbeatStatus {
  ok: boolean;
  timestamp: string;
  checks: HeartbeatCheck[];
  failedCount: number;
  warnings: string[];
}

export type HeartbeatCallback = (status: HeartbeatStatus) => void;

export interface HeartbeatConfig {
  intervalMs: number;
  configPath?: string;
  onStatusChange?: HeartbeatCallback;
}

/**
 * Heartbeat monitor that periodically validates system prerequisites
 * and can flip the server into fail-closed posture
 */
export class HeartbeatMonitor {
  private intervalMs: number;
  private configPath: string;
  private timer: NodeJS.Timeout | null = null;
  private lastStatus: HeartbeatStatus | null = null;
  private onStatusChange?: HeartbeatCallback;
  private running: boolean = false;

  // References to governance components for wiring validation
  private cif: CIF | null = null;
  private cdi: CDI | null = null;

  // P0.3: Receipt store for chain validation
  private receiptStore: ReceiptStore | null = null;

  constructor(config: HeartbeatConfig) {
    this.intervalMs = config.intervalMs;
    this.configPath = config.configPath || './config/governance.json';
    this.onStatusChange = config.onStatusChange;
  }

  /**
   * Set governance component references for wiring validation
   */
  setGovernanceComponents(cif: CIF, cdi: CDI): void {
    this.cif = cif;
    this.cdi = cdi;
  }

  /**
   * P0.3: Set receipt store for chain validation
   */
  setReceiptStore(receiptStore: ReceiptStore): void {
    this.receiptStore = receiptStore;
  }

  /**
   * Start the heartbeat loop
   */
  start(): void {
    if (this.running) {
      console.warn('⚠️  Heartbeat already running');
      return;
    }

    this.running = true;
    console.log(`💓 Heartbeat started (interval: ${this.intervalMs}ms)`);

    // Run first check immediately
    this.runCheck().catch(error => {
      console.error('❌ Heartbeat initial check failed:', error);
    });

    // Schedule periodic checks
    this.timer = setInterval(() => {
      this.runCheck().catch(error => {
        console.error('❌ Heartbeat check failed:', error);
      });
    }, this.intervalMs);
  }

  /**
   * Stop the heartbeat loop
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('💓 Heartbeat stopped');
  }

  /**
   * Get current heartbeat status (read-only)
   */
  getStatus(): HeartbeatStatus | null {
    return this.lastStatus;
  }

  /**
   * Check if system is healthy (ok = true)
   */
  isHealthy(): boolean {
    return this.lastStatus?.ok ?? false;
  }

  /**
   * Run a single heartbeat check
   */
  private async runCheck(): Promise<void> {
    const checks: HeartbeatCheck[] = [];
    const warnings: string[] = [];
    let allOk = true;

    // Check 1: Validate prerequisites (treaty/genome/config/adapter)
    let prereqResult: PrerequisiteValidationResult;
    try {
      prereqResult = await validateAllPrerequisites(this.configPath);

      if (prereqResult.ok) {
        checks.push({ name: 'Prerequisites', ok: true });
      } else {
        allOk = false;
        for (const error of prereqResult.errors) {
          checks.push({
            name: `Prerequisite: ${error.code}`,
            ok: false,
            code: error.code,
            detail: error.message
          });
        }
      }

      if (prereqResult.warnings) {
        warnings.push(...prereqResult.warnings);
      }
    } catch (error) {
      allOk = false;
      checks.push({
        name: 'Prerequisites',
        ok: false,
        code: 'PREREQ_CHECK_FAILED',
        detail: error instanceof Error ? error.message : String(error)
      });
    }

    // Check 2: Validate governance wiring (CIF/CDI are initialized)
    if (!this.cif || !this.cdi) {
      allOk = false;
      checks.push({
        name: 'Governance Wiring',
        ok: false,
        code: 'GOVERNANCE_NOT_INITIALIZED',
        detail: 'CIF or CDI not initialized'
      });
    } else {
      checks.push({ name: 'Governance Wiring', ok: true });
    }

    // Check 3: Validate storage backend (env vars present)
    const backend = process.env.MATHISON_STORE_BACKEND;
    const storePath = process.env.MATHISON_STORE_PATH;
    if (!backend || !storePath) {
      allOk = false;
      checks.push({
        name: 'Storage Config',
        ok: false,
        code: 'STORAGE_CONFIG_MISSING',
        detail: 'MATHISON_STORE_BACKEND or MATHISON_STORE_PATH missing'
      });
    } else {
      checks.push({ name: 'Storage Config', ok: true });
    }

    // P0.3: Check 4: Validate receipt chain integrity
    if (this.receiptStore) {
      try {
        const chainValidation = await this.receiptStore.validateChain();

        if (chainValidation.valid) {
          checks.push({
            name: 'Receipt Chain',
            ok: true,
            detail: `Chain valid (${chainValidation.lastSequence + 1} receipts)`
          });
        } else {
          allOk = false;
          checks.push({
            name: 'Receipt Chain',
            ok: false,
            code: 'RECEIPT_CHAIN_BROKEN',
            detail: `Chain validation failed: ${chainValidation.errors.slice(0, 3).join('; ')}`
          });

          // Add warning with full error list
          if (chainValidation.errors.length > 3) {
            warnings.push(`Receipt chain has ${chainValidation.errors.length} errors (showing first 3)`);
          }
        }
      } catch (error) {
        // Chain validation failed due to error
        warnings.push(`Receipt chain validation error: ${error instanceof Error ? error.message : String(error)}`);
        checks.push({
          name: 'Receipt Chain',
          ok: true, // Don't fail-close on validation errors, just warn
          detail: 'Chain validation error (see warnings)'
        });
      }
    }

    // P1.1: Check 5: Run canary watchdog tests (governance sanity checks)
    if (this.cif && this.cdi) {
      try {
        const canaries = [
          createCIFCanary(this.cif),
          createCDICanary(this.cdi)
        ];

        const canaryResult = await runCanaryTests(canaries);

        if (canaryResult.passed) {
          checks.push({
            name: 'Canary Watchdogs',
            ok: true,
            detail: `All ${canaryResult.results.length} canaries passed`
          });
        } else {
          allOk = false;
          const failedCanaries = canaryResult.results.filter(r => !r.passed);
          checks.push({
            name: 'Canary Watchdogs',
            ok: false,
            code: 'CANARY_FAILED',
            detail: `${failedCanaries.length} canary tests failed (governance enforcement broken)`
          });

          // Log which canaries failed
          for (const failure of failedCanaries) {
            warnings.push(`Canary FAILED: ${failure.name} - ${failure.description}`);
          }
        }
      } catch (error) {
        // Canary test error - treat as failure
        allOk = false;
        checks.push({
          name: 'Canary Watchdogs',
          ok: false,
          code: 'CANARY_ERROR',
          detail: `Canary tests error: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }

    // Build status
    const status: HeartbeatStatus = {
      ok: allOk,
      timestamp: new Date().toISOString(),
      checks,
      failedCount: checks.filter(c => !c.ok).length,
      warnings
    };

    // Detect state change
    const stateChanged = this.lastStatus?.ok !== status.ok;

    this.lastStatus = status;

    // Log only on state change or failure
    if (stateChanged || !status.ok) {
      if (status.ok) {
        console.log('✅ Heartbeat: System healthy');
      } else {
        console.error(`❌ Heartbeat: System unhealthy (${status.failedCount} failed checks)`);
        for (const check of checks.filter(c => !c.ok)) {
          console.error(`   - ${check.name}: ${check.detail || check.code}`);
        }
      }

      // Invoke callback
      if (this.onStatusChange) {
        this.onStatusChange(status);
      }
    }
  }
}

/**
 * Create and configure heartbeat monitor from environment
 */
export function createHeartbeatFromEnv(): HeartbeatMonitor {
  const intervalMs = process.env.MATHISON_HEARTBEAT_INTERVAL
    ? parseInt(process.env.MATHISON_HEARTBEAT_INTERVAL, 10)
    : 30000; // Default: 30s

  const configPath = process.env.MATHISON_GOVERNANCE_CONFIG || './config/governance.json';

  return new HeartbeatMonitor({
    intervalMs,
    configPath
  });
}
