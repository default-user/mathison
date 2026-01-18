/**
 * P1.7: Boot Key Registry - Session tracking for audit trail resilience
 *
 * Purpose: Track boot sessions to maintain audit trail continuity without
 * persisting secret key material.
 *
 * Design Decision (explicit documentation):
 * - Governance proofs are SESSION-SCOPED and CANNOT be verified across restarts
 * - This is intentional: ephemeral boot keys prevent long-term key compromise
 * - The registry stores PUBLIC metadata only (key ID, timestamps, checksums)
 * - Receipts can be attributed to sessions even if proofs cannot be re-verified
 *
 * What this enables:
 * - Detect receipts claiming to be from unknown/forged sessions
 * - Track session continuity for audit purposes
 * - Identify if receipts chain correctly within and across sessions
 *
 * What this does NOT do:
 * - Store private keys (would defeat the purpose of ephemeral keys)
 * - Allow re-verification of proofs from prior sessions
 * - Provide cryptographic proof of historical sessions
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface BootSession {
  boot_key_id: string;
  started_at: string;
  ended_at?: string;
  receipt_count: number;
  first_receipt_hash?: string;
  last_receipt_hash?: string;
  last_checkpoint_id?: string;
  parent_session_id?: string;  // For continuity chain
  checksum: string;  // Integrity checksum of session metadata
}

export interface BootKeyRegistry {
  schema_version: string;
  created_at: string;
  updated_at: string;
  sessions: BootSession[];
  current_session_id?: string;
}

/**
 * Compute checksum for session integrity
 */
function computeSessionChecksum(session: Omit<BootSession, 'checksum'>): string {
  const data = JSON.stringify({
    boot_key_id: session.boot_key_id,
    started_at: session.started_at,
    ended_at: session.ended_at,
    receipt_count: session.receipt_count,
    first_receipt_hash: session.first_receipt_hash,
    last_receipt_hash: session.last_receipt_hash,
    last_checkpoint_id: session.last_checkpoint_id,
    parent_session_id: session.parent_session_id
  });
  return createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Default registry path
 */
function getRegistryPath(): string {
  const storePath = process.env.MATHISON_STORE_PATH ?? './.mathison';
  return path.join(storePath, 'boot-key-registry.json');
}

/**
 * Load boot key registry from disk
 */
export function loadBootKeyRegistry(registryPath?: string): BootKeyRegistry | null {
  const filepath = registryPath ?? getRegistryPath();
  try {
    if (!fs.existsSync(filepath)) {
      return null;
    }
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as BootKeyRegistry;
  } catch (error) {
    console.warn(`⚠️  Failed to load boot key registry: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Save boot key registry to disk
 */
export function saveBootKeyRegistry(registry: BootKeyRegistry, registryPath?: string): void {
  const filepath = registryPath ?? getRegistryPath();
  const dir = path.dirname(filepath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  registry.updated_at = new Date().toISOString();
  fs.writeFileSync(filepath, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Create a new boot key registry
 */
export function createBootKeyRegistry(): BootKeyRegistry {
  return {
    schema_version: '1.0.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sessions: []
  };
}

/**
 * Register a new boot session
 */
export function registerBootSession(
  registry: BootKeyRegistry,
  bootKeyId: string,
  parentSessionId?: string
): BootSession {
  // End the current session if one exists
  if (registry.current_session_id) {
    const currentSession = registry.sessions.find(s => s.boot_key_id === registry.current_session_id);
    if (currentSession && !currentSession.ended_at) {
      currentSession.ended_at = new Date().toISOString();
      currentSession.checksum = computeSessionChecksum(currentSession);
    }
  }

  // Create new session
  const session: Omit<BootSession, 'checksum'> = {
    boot_key_id: bootKeyId,
    started_at: new Date().toISOString(),
    receipt_count: 0,
    parent_session_id: parentSessionId ?? registry.current_session_id
  };

  const newSession: BootSession = {
    ...session,
    checksum: computeSessionChecksum(session)
  };

  registry.sessions.push(newSession);
  registry.current_session_id = bootKeyId;
  registry.updated_at = new Date().toISOString();

  console.log(`📋 Registered boot session: ${bootKeyId}`);
  if (parentSessionId || registry.sessions.length > 1) {
    console.log(`   Parent session: ${newSession.parent_session_id ?? 'none'}`);
  }

  return newSession;
}

/**
 * Update session with receipt information
 */
export function updateSessionReceipts(
  registry: BootKeyRegistry,
  bootKeyId: string,
  receiptHash: string
): void {
  const session = registry.sessions.find(s => s.boot_key_id === bootKeyId);
  if (!session) {
    console.warn(`⚠️  Session not found for boot key: ${bootKeyId}`);
    return;
  }

  session.receipt_count++;
  if (!session.first_receipt_hash) {
    session.first_receipt_hash = receiptHash;
  }
  session.last_receipt_hash = receiptHash;
  session.checksum = computeSessionChecksum(session);
  registry.updated_at = new Date().toISOString();
}

/**
 * Check if a boot key ID is known (registered in history)
 */
export function isKnownSession(registry: BootKeyRegistry, bootKeyId: string): boolean {
  return registry.sessions.some(s => s.boot_key_id === bootKeyId);
}

/**
 * Validate session continuity (check for gaps or unknown parents)
 */
export function validateSessionContinuity(registry: BootKeyRegistry): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const session of registry.sessions) {
    // Verify checksum
    const expectedChecksum = computeSessionChecksum(session);
    if (session.checksum !== expectedChecksum) {
      errors.push(`Session ${session.boot_key_id}: checksum mismatch (tampered)`);
    }

    // Check parent exists (except for first session)
    if (session.parent_session_id) {
      if (!registry.sessions.some(s => s.boot_key_id === session.parent_session_id)) {
        warnings.push(`Session ${session.boot_key_id}: parent ${session.parent_session_id} not found in registry`);
      }
    }

    // Check for orphaned sessions without receipts
    if (session.receipt_count === 0 && session.ended_at) {
      warnings.push(`Session ${session.boot_key_id}: no receipts recorded`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get session metadata for a receipt (to include in receipt for audit)
 */
export function getSessionMetadata(registry: BootKeyRegistry, bootKeyId: string): {
  session_index: number;
  parent_session_id?: string;
  is_current: boolean;
} | null {
  const index = registry.sessions.findIndex(s => s.boot_key_id === bootKeyId);
  if (index === -1) {
    return null;
  }

  const session = registry.sessions[index];
  return {
    session_index: index,
    parent_session_id: session.parent_session_id,
    is_current: registry.current_session_id === bootKeyId
  };
}

/**
 * Boot Key Registry Manager (singleton pattern)
 */
class BootKeyRegistryManager {
  private registry: BootKeyRegistry | null = null;
  private registryPath: string | null = null;
  private autoSave: boolean = true;

  initialize(options?: {
    registryPath?: string;
    autoSave?: boolean;
  }): BootKeyRegistry {
    this.registryPath = options?.registryPath ?? getRegistryPath();
    this.autoSave = options?.autoSave ?? true;

    // Load or create registry
    this.registry = loadBootKeyRegistry(this.registryPath) ?? createBootKeyRegistry();

    console.log(`📋 Boot Key Registry: ${this.registry.sessions.length} historical sessions`);

    return this.registry;
  }

  getRegistry(): BootKeyRegistry {
    if (!this.registry) {
      throw new Error('BOOT_KEY_REGISTRY_NOT_INITIALIZED: Call initialize() first');
    }
    return this.registry;
  }

  registerSession(bootKeyId: string, parentSessionId?: string): BootSession {
    const registry = this.getRegistry();
    const session = registerBootSession(registry, bootKeyId, parentSessionId);
    if (this.autoSave && this.registryPath) {
      saveBootKeyRegistry(registry, this.registryPath);
    }
    return session;
  }

  recordReceipt(bootKeyId: string, receiptHash: string): void {
    const registry = this.getRegistry();
    updateSessionReceipts(registry, bootKeyId, receiptHash);
    if (this.autoSave && this.registryPath) {
      saveBootKeyRegistry(registry, this.registryPath);
    }
  }

  save(): void {
    if (this.registry && this.registryPath) {
      saveBootKeyRegistry(this.registry, this.registryPath);
    }
  }

  shutdown(): void {
    // End current session
    if (this.registry?.current_session_id) {
      const session = this.registry.sessions.find(
        s => s.boot_key_id === this.registry!.current_session_id
      );
      if (session && !session.ended_at) {
        session.ended_at = new Date().toISOString();
        session.checksum = computeSessionChecksum(session);
      }
    }
    this.save();
    this.registry = null;
    this.registryPath = null;
  }
}

// Global instance
let globalManager: BootKeyRegistryManager | null = null;

/**
 * Initialize the boot key registry (call at server startup)
 */
export function initializeBootKeyRegistry(options?: {
  registryPath?: string;
  autoSave?: boolean;
}): BootKeyRegistry {
  if (globalManager) {
    console.warn('⚠️  Boot key registry already initialized');
    return globalManager.getRegistry();
  }
  globalManager = new BootKeyRegistryManager();
  return globalManager.initialize(options);
}

/**
 * Get the boot key registry manager
 */
export function getBootKeyRegistryManager(): BootKeyRegistryManager {
  if (!globalManager) {
    throw new Error('BOOT_KEY_REGISTRY_NOT_INITIALIZED: Call initializeBootKeyRegistry() first');
  }
  return globalManager;
}

/**
 * Check if boot key registry is initialized
 */
export function isBootKeyRegistryInitialized(): boolean {
  return globalManager !== null;
}

/**
 * Shutdown boot key registry
 */
export function shutdownBootKeyRegistry(): void {
  if (globalManager) {
    globalManager.shutdown();
    globalManager = null;
  }
}

// Export manager class for testing
export { BootKeyRegistryManager };
