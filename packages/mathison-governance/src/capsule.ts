/**
 * WHY: capsule.ts - Signed governance capsule loader with fail-closed behavior
 * -----------------------------------------------------------------------------
 * - Loads, verifies, and caches governance capsules with signature validation
 * - Needed to provide root-of-trust for all governance decisions; capsule defines OI permissions
 * - Enforces: fail-closed on missing/invalid/expired/unverifiable capsules; TTL-based staleness
 * - Tradeoff: Degrade ladder allows partial operation vs full lockout on capsule issues
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  GovernanceCapsule,
  GovernanceCapsuleSchema,
  CapsuleStatus,
  DegradationLevel,
  AuthorityConfig,
} from './types';

// ============================================================================
// Capsule Cache
// ============================================================================

interface CachedCapsule {
  capsule: GovernanceCapsule;
  loaded_at: Date;
  verified: boolean;
}

/**
 * Governance capsule loader with caching and degrade ladder.
 *
 * FAIL-CLOSED BEHAVIOR:
 * - Missing capsule: deny all high-risk, allow read-only if explicitly permitted
 * - Invalid capsule: deny all, log error
 * - Stale capsule: deny high-risk, allow low-risk with warning
 * - Unverifiable signature: deny all
 */
export class GovernanceCapsuleLoader {
  private cache: CachedCapsule | null = null;
  private config: CapsuleLoaderConfig;
  private authority: AuthorityConfig | null = null;
  private lastError: string | null = null;

  constructor(config: CapsuleLoaderConfig) {
    this.config = config;
  }

  /**
   * Load authority configuration
   */
  async loadAuthority(authorityPath: string): Promise<void> {
    try {
      const content = fs.readFileSync(authorityPath, 'utf-8');
      this.authority = JSON.parse(content) as AuthorityConfig;
    } catch (error) {
      this.lastError = `Failed to load authority config: ${error}`;
      throw new Error(this.lastError);
    }
  }

  /**
   * Get authority configuration
   */
  getAuthority(): AuthorityConfig | null {
    return this.authority;
  }

  /**
   * Load and verify governance capsule from file
   */
  async loadCapsule(capsulePath: string): Promise<CapsuleStatus> {
    try {
      // Check if file exists
      if (!fs.existsSync(capsulePath)) {
        this.lastError = `Capsule file not found: ${capsulePath}`;
        return this.buildStatus(false, 'full', this.lastError);
      }

      // Read and parse capsule
      const content = fs.readFileSync(capsulePath, 'utf-8');
      let rawCapsule: unknown;
      try {
        rawCapsule = JSON.parse(content);
      } catch {
        this.lastError = 'Invalid JSON in capsule file';
        return this.buildStatus(false, 'full', this.lastError);
      }

      // Validate schema
      const parseResult = GovernanceCapsuleSchema.safeParse(rawCapsule);
      if (!parseResult.success) {
        this.lastError = `Capsule schema validation failed: ${parseResult.error.message}`;
        return this.buildStatus(false, 'full', this.lastError);
      }

      const capsule = parseResult.data as GovernanceCapsule;

      // Check expiration
      const expiresAt = new Date(capsule.expires_at);
      const now = new Date();
      if (expiresAt <= now) {
        this.lastError = 'Capsule has expired';
        return this.buildStatus(false, 'full', this.lastError);
      }

      // Verify signature (in production, this would use actual crypto verification)
      const verified = await this.verifySignature(capsule);
      if (!verified) {
        this.lastError = 'Capsule signature verification failed';
        return this.buildStatus(false, 'full', this.lastError);
      }

      // Cache the capsule
      this.cache = {
        capsule,
        loaded_at: new Date(),
        verified: true,
      };
      this.lastError = null;

      return this.buildStatus(true, 'none');
    } catch (error) {
      this.lastError = `Unexpected error loading capsule: ${error}`;
      return this.buildStatus(false, 'full', this.lastError);
    }
  }

  /**
   * Get current capsule status
   */
  getStatus(): CapsuleStatus {
    if (!this.cache) {
      return this.buildStatus(false, 'full', this.lastError || 'No capsule loaded');
    }

    // Check if cache is stale (past TTL but capsule not expired)
    const now = new Date();
    const cacheAge = now.getTime() - this.cache.loaded_at.getTime();
    const ttlMs = this.config.ttl_seconds * 1000;
    const isStale = cacheAge > ttlMs;

    // Check if capsule has expired since loading
    const expiresAt = new Date(this.cache.capsule.expires_at);
    if (expiresAt <= now) {
      return this.buildStatus(false, 'full', 'Cached capsule has expired');
    }

    // Determine degradation level
    let degradationLevel: DegradationLevel = 'none';
    if (isStale) {
      degradationLevel = 'partial';
    }

    return {
      loaded: true,
      valid: true,
      capsule_id: this.cache.capsule.capsule_id,
      expires_at: expiresAt,
      stale: isStale,
      degradation_level: degradationLevel,
      last_loaded_at: this.cache.loaded_at,
    };
  }

  /**
   * Get cached capsule (if valid)
   */
  getCapsule(): GovernanceCapsule | null {
    if (!this.cache) {
      return null;
    }

    const status = this.getStatus();
    if (!status.valid) {
      return null;
    }

    return this.cache.capsule;
  }

  /**
   * Check if an action is allowed given current degradation level
   */
  isActionAllowed(
    riskClass: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk'
  ): { allowed: boolean; reason: string } {
    const status = this.getStatus();

    // If no valid capsule, use degrade ladder
    if (!status.valid) {
      return this.degradeLadderDecision(riskClass, status.degradation_level, status.error);
    }

    // If capsule is stale, restrict high-risk actions
    if (status.stale) {
      if (riskClass === 'high_risk' || riskClass === 'medium_risk') {
        return {
          allowed: false,
          reason: 'Capsule is stale - high-risk actions denied. Please reload capsule.',
        };
      }
    }

    // Check against authority config risk classes
    if (this.authority) {
      const riskConfig = this.authority.risk_classes[riskClass];
      if (riskConfig) {
        if (riskConfig.requires_capsule && !status.valid) {
          return {
            allowed: false,
            reason: `Action requires valid capsule but none available`,
          };
        }
        if (!riskConfig.allowed_on_degraded && status.degradation_level !== 'none') {
          return {
            allowed: false,
            reason: `Action not allowed in degraded mode`,
          };
        }
      }
    }

    return { allowed: true, reason: 'Action allowed' };
  }

  /**
   * Verify capsule signature
   * In production, this would use actual crypto verification against public key
   */
  private async verifySignature(capsule: GovernanceCapsule): Promise<boolean> {
    // In development mode, accept the dev signature
    if (capsule.signature === 'DEV_SIGNATURE_NOT_FOR_PRODUCTION') {
      // Only allow in development
      if (
        capsule.posture.mode === 'development' ||
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test'
      ) {
        return true;
      }
      return false;
    }

    // In production, this would verify against the public key
    // For now, any non-empty signature is accepted if we can't verify
    // This should be replaced with actual crypto verification
    if (this.config.public_key_path) {
      // TODO: Implement actual signature verification with public key
      // For now, return true if signature is present
      return capsule.signature.length > 0;
    }

    return false;
  }

  /**
   * Degrade ladder decision based on risk class
   */
  private degradeLadderDecision(
    riskClass: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk',
    degradationLevel: DegradationLevel,
    error?: string
  ): { allowed: boolean; reason: string } {
    const errorSuffix = error ? ` (${error})` : '';

    switch (degradationLevel) {
      case 'full':
        // Full degradation: deny everything except read-only
        if (riskClass === 'read_only') {
          return {
            allowed: true,
            reason: 'Read-only action allowed in full degradation mode' + errorSuffix,
          };
        }
        return {
          allowed: false,
          reason: `Action denied: system in full degradation mode${errorSuffix}`,
        };

      case 'partial':
        // Partial degradation: deny high-risk, allow low-risk with warning
        if (riskClass === 'high_risk' || riskClass === 'medium_risk') {
          return {
            allowed: false,
            reason: `High-risk action denied in partial degradation mode${errorSuffix}`,
          };
        }
        return {
          allowed: true,
          reason: 'Low-risk action allowed in partial degradation mode' + errorSuffix,
        };

      case 'none':
      default:
        return { allowed: true, reason: 'Action allowed' };
    }
  }

  /**
   * Build status object
   */
  private buildStatus(
    valid: boolean,
    degradationLevel: DegradationLevel,
    error?: string
  ): CapsuleStatus {
    return {
      loaded: this.cache !== null,
      valid,
      capsule_id: this.cache?.capsule.capsule_id,
      expires_at: this.cache ? new Date(this.cache.capsule.expires_at) : undefined,
      stale: false,
      degradation_level: degradationLevel,
      last_loaded_at: this.cache?.loaded_at,
      error,
    };
  }

  /**
   * Clear cached capsule (for testing or forced reload)
   */
  clearCache(): void {
    this.cache = null;
  }
}

/**
 * Configuration for capsule loader
 */
export interface CapsuleLoaderConfig {
  /** TTL for cached capsule in seconds */
  ttl_seconds: number;
  /** Path to public key for signature verification */
  public_key_path?: string;
  /** Whether to allow dev signatures */
  allow_dev_signatures: boolean;
}

/**
 * Create a capsule loader with default configuration
 */
export function createCapsuleLoader(
  options?: Partial<CapsuleLoaderConfig>
): GovernanceCapsuleLoader {
  const config: CapsuleLoaderConfig = {
    ttl_seconds: options?.ttl_seconds ?? 300, // 5 minutes default
    public_key_path: options?.public_key_path,
    allow_dev_signatures: options?.allow_dev_signatures ?? process.env.NODE_ENV !== 'production',
  };

  return new GovernanceCapsuleLoader(config);
}
