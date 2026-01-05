/**
 * P0.1: GovernanceProof - Cryptographic proof that governance pipeline actually ran
 *
 * Purpose: Close verification asymmetry - prove governance ran, don't just log it
 *
 * Each request generates a proof chain:
 * 1. CIF ingress hash (proves CIF ingress checked the request)
 * 2. CDI action hash (proves CDI evaluated the action)
 * 3. Handler hash (proves handler executed with governed inputs)
 * 4. CDI output hash (proves CDI checked the output)
 * 5. CIF egress hash (proves CIF sanitized the response)
 * 6. Cumulative hash (chains all stages together)
 * 7. Signature (HMAC with ephemeral boot key - prevents forgery)
 */

import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Ephemeral boot key - rotates on every server restart
 * Not persisted, derived at runtime from secure random
 */
let BOOT_KEY: Buffer | null = null;
let BOOT_KEY_ID: string | null = null;

/**
 * Initialize boot key (call once at server startup)
 */
export function initializeBootKey(): void {
  BOOT_KEY = randomBytes(32); // 256-bit key
  BOOT_KEY_ID = createHash('sha256')
    .update(BOOT_KEY)
    .digest('hex')
    .substring(0, 16); // First 16 chars as ID
  console.log(`🔐 GovernanceProof: Boot key initialized (ID: ${BOOT_KEY_ID})`);
}

/**
 * Get current boot key (throws if not initialized)
 */
function getBootKey(): Buffer {
  if (!BOOT_KEY) {
    throw new Error('BOOT_KEY_NOT_INITIALIZED: Call initializeBootKey() first');
  }
  return BOOT_KEY;
}

/**
 * Get current boot key ID
 */
export function getBootKeyId(): string {
  if (!BOOT_KEY_ID) {
    throw new Error('BOOT_KEY_NOT_INITIALIZED: Call initializeBootKey() first');
  }
  return BOOT_KEY_ID;
}

/**
 * Get boot key for external use (e.g., receipt chaining)
 * P0.3: Exposed for receipt chain to use same boot key
 */
export function getBootKeyForChaining(): { key: Buffer; id: string } {
  return {
    key: getBootKey(),
    id: getBootKeyId()
  };
}

/**
 * Hash a governance stage (input + output)
 */
export function hashStage(stageName: string, input: unknown, output: unknown): string {
  const data = JSON.stringify({
    stage: stageName,
    input,
    output,
    timestamp: Date.now()
  });
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute cumulative hash from all stage hashes
 */
export function computeCumulativeHash(stageHashes: Record<string, string>): string {
  const data = JSON.stringify(stageHashes);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Sign proof with HMAC using boot key
 */
export function signProof(cumulativeHash: string): string {
  const bootKey = getBootKey();
  return createHmac('sha256', bootKey)
    .update(cumulativeHash)
    .digest('hex');
}

/**
 * Verify proof signature
 */
export function verifyProof(cumulativeHash: string, signature: string): boolean {
  try {
    const bootKey = getBootKey();
    const expectedSignature = createHmac('sha256', bootKey)
      .update(cumulativeHash)
      .digest('hex');
    return signature === expectedSignature;
  } catch (error) {
    console.error('GovernanceProof verification failed:', error);
    return false;
  }
}

/**
 * Governance proof structure attached to receipts
 */
export interface GovernanceProof {
  request_id: string;
  request_hash: string;

  // Stage hashes (each proves that stage ran)
  stage_hashes: {
    cif_ingress?: string;
    cdi_action?: string;
    handler?: string;
    cdi_output?: string;
    cif_egress?: string;
  };

  // Cumulative hash (chains all stages)
  cumulative_hash: string;

  // Signature (HMAC with boot key)
  signature: string;
  boot_key_id: string;

  // Metadata
  timestamp: string;
  verdict: 'allow' | 'deny' | 'uncertain';
}

/**
 * Builder for constructing governance proofs incrementally
 */
export class GovernanceProofBuilder {
  private requestId: string;
  private requestHash: string;
  private stageHashes: Record<string, string> = {};
  private verdict: 'allow' | 'deny' | 'uncertain' = 'uncertain';

  constructor(requestId: string, request: unknown) {
    this.requestId = requestId;
    this.requestHash = createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');
  }

  /**
   * Add CIF ingress stage proof
   */
  addCIFIngress(input: unknown, output: unknown): void {
    this.stageHashes.cif_ingress = hashStage('cif_ingress', input, output);
  }

  /**
   * Add CDI action stage proof
   */
  addCDIAction(input: unknown, output: unknown): void {
    this.stageHashes.cdi_action = hashStage('cdi_action', input, output);
  }

  /**
   * Add handler stage proof
   */
  addHandler(input: unknown, output: unknown): void {
    this.stageHashes.handler = hashStage('handler', input, output);
  }

  /**
   * Add CDI output stage proof
   */
  addCDIOutput(input: unknown, output: unknown): void {
    this.stageHashes.cdi_output = hashStage('cdi_output', input, output);
  }

  /**
   * Add CIF egress stage proof
   */
  addCIFEgress(input: unknown, output: unknown): void {
    this.stageHashes.cif_egress = hashStage('cif_egress', input, output);
  }

  /**
   * Set final verdict
   */
  setVerdict(verdict: 'allow' | 'deny' | 'uncertain'): void {
    this.verdict = verdict;
  }

  /**
   * Build final proof with signature
   */
  build(): GovernanceProof {
    const cumulativeHash = computeCumulativeHash(this.stageHashes);
    const signature = signProof(cumulativeHash);

    return {
      request_id: this.requestId,
      request_hash: this.requestHash,
      stage_hashes: this.stageHashes,
      cumulative_hash: cumulativeHash,
      signature,
      boot_key_id: getBootKeyId(),
      timestamp: new Date().toISOString(),
      verdict: this.verdict
    };
  }
}

/**
 * Verify a complete governance proof
 */
export function verifyGovernanceProof(proof: GovernanceProof): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check boot key ID matches
  if (proof.boot_key_id !== getBootKeyId()) {
    errors.push('Boot key ID mismatch (proof from different boot session)');
  }

  // Verify cumulative hash
  const expectedCumulativeHash = computeCumulativeHash(proof.stage_hashes);
  if (proof.cumulative_hash !== expectedCumulativeHash) {
    errors.push('Cumulative hash mismatch (proof tampered)');
  }

  // Verify signature
  if (!verifyProof(proof.cumulative_hash, proof.signature)) {
    errors.push('Signature verification failed (proof forged)');
  }

  // Check at least one stage is present
  const stageCount = Object.keys(proof.stage_hashes).length;
  if (stageCount === 0) {
    errors.push('No stages recorded (empty proof)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Create a denial proof (for requests that were blocked)
 */
export function createDenialProof(
  requestId: string,
  request: unknown,
  deniedAt: 'cif_ingress' | 'cdi_action' | 'cdi_output' | 'cif_egress',
  input: unknown,
  output: unknown
): GovernanceProof {
  const builder = new GovernanceProofBuilder(requestId, request);

  // Record the stage that denied
  switch (deniedAt) {
    case 'cif_ingress':
      builder.addCIFIngress(input, output);
      break;
    case 'cdi_action':
      builder.addCDIAction(input, output);
      break;
    case 'cdi_output':
      builder.addCDIOutput(input, output);
      break;
    case 'cif_egress':
      builder.addCIFEgress(input, output);
      break;
  }

  builder.setVerdict('deny');
  return builder.build();
}
