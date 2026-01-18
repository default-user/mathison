/**
 * Thin Waist v0.1: Signed Artifact Verification
 *
 * Verifies treaty/policy/adapter/genome artifacts before activation.
 *
 * INVARIANT: No artifact may be loaded without signature verification.
 * ENFORCEMENT: Server refuses unsigned/untrusted artifacts (fail-closed).
 */

import { createHash } from 'crypto';

/**
 * Artifact types that require signature verification
 */
export type ArtifactType = 'genome' | 'treaty' | 'policy' | 'adapter' | 'config';

/**
 * Signature algorithm (Ed25519 for Mathison)
 */
export type SignatureAlgorithm = 'ed25519' | 'hmac-sha256';

/**
 * Artifact manifest with cryptographic verification
 */
export interface ArtifactManifest {
  artifact_id: string; // Unique artifact identifier
  artifact_type: ArtifactType;
  version: string; // Semantic version
  created_at: string; // ISO timestamp
  signer_id: string; // Signer key ID
  key_id: string; // Public key identifier
  signature: {
    alg: SignatureAlgorithm;
    sig_base64: string;
  };
  content_hash: string; // SHA256 hash of canonical content
  compat?: string[]; // Compatibility versions (optional)
}

/**
 * Trust store entry (trusted signer key)
 */
export interface TrustedSigner {
  key_id: string;
  alg: SignatureAlgorithm;
  public_key: string; // Base64-encoded public key
  description: string;
  added_at: string;
}

/**
 * Artifact verification result
 */
export interface VerificationResult {
  verified: boolean;
  artifact_id: string;
  errors: string[];
  warnings: string[];
  signer_id?: string;
}

/**
 * Artifact Verifier - Verifies signed artifacts before activation
 */
export class ArtifactVerifier {
  private trustStore: Map<string, TrustedSigner> = new Map();
  private verifiedArtifacts: Map<string, ArtifactManifest> = new Map();

  /**
   * Add trusted signer to trust store
   * Must be called during server initialization
   */
  addTrustedSigner(signer: TrustedSigner): void {
    if (this.trustStore.has(signer.key_id)) {
      throw new Error(`SIGNER_ALREADY_TRUSTED: Signer "${signer.key_id}" already in trust store`);
    }

    this.trustStore.set(signer.key_id, signer);
    console.log(`🔐 ArtifactVerifier: Trusted signer added: ${signer.key_id} (${signer.description})`);
  }

  /**
   * Load trust store from environment or config
   * For v0.1, supports test keys from environment
   */
  async loadTrustStore(config?: { testMode?: boolean }): Promise<void> {
    const testMode = config?.testMode ?? process.env.NODE_ENV !== 'production';

    if (testMode) {
      // Load test key for development
      console.log('🔐 ArtifactVerifier: Loading test trust store (dev mode)');

      // Test signer (matches genome keygen default)
      const testPublicKey = process.env.GENOME_PUBLIC_KEY ||
        'MCowBQYDK2VwAyEA7Z0jW5YZq8YZqY5YZqY5YZqY5YZqY5YZqY5YZqY5YZ4='; // Placeholder

      this.addTrustedSigner({
        key_id: 'dev-key-001',
        alg: 'ed25519',
        public_key: testPublicKey,
        description: 'Development test key (DO NOT USE IN PRODUCTION)',
        added_at: new Date().toISOString()
      });
    } else {
      // Production: load from secure config
      const prodKeysJson = process.env.MATHISON_TRUST_STORE;
      if (!prodKeysJson) {
        throw new Error('TRUST_STORE_NOT_CONFIGURED: MATHISON_TRUST_STORE environment variable required in production');
      }

      const prodKeys = JSON.parse(prodKeysJson) as TrustedSigner[];
      for (const signer of prodKeys) {
        this.addTrustedSigner(signer);
      }
    }
  }

  /**
   * Verify artifact manifest and content
   *
   * @param manifest - Artifact manifest
   * @param contentBytes - Raw artifact content (for hash verification)
   * @returns Verification result
   */
  async verifyManifest(
    manifest: ArtifactManifest,
    contentBytes: Buffer
  ): Promise<VerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check signer is trusted
    const signer = this.trustStore.get(manifest.key_id);
    if (!signer) {
      errors.push(`Signer "${manifest.key_id}" not in trust store (untrusted)`);
      return {
        verified: false,
        artifact_id: manifest.artifact_id,
        errors,
        warnings
      };
    }

    // 2. Verify algorithm match
    if (manifest.signature.alg !== signer.alg) {
      errors.push(`Algorithm mismatch: manifest=${manifest.signature.alg}, signer=${signer.alg}`);
    }

    // 3. Verify content hash
    const computedHash = createHash('sha256').update(contentBytes).digest('hex');
    if (computedHash !== manifest.content_hash) {
      errors.push(`Content hash mismatch (tampered or corrupted): expected=${manifest.content_hash}, computed=${computedHash}`);
    }

    // 4. Verify signature (algorithm-specific)
    try {
      const signatureValid = await this.verifySignature(
        contentBytes,
        manifest.signature.sig_base64,
        signer.public_key,
        signer.alg
      );

      if (!signatureValid) {
        errors.push('Signature verification failed (invalid or forged)');
      }
    } catch (error) {
      errors.push(`Signature verification error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 5. Check for version compatibility issues (warnings only)
    if (manifest.compat && manifest.compat.length === 0) {
      warnings.push('No compatibility versions specified');
    }

    if (errors.length > 0) {
      return {
        verified: false,
        artifact_id: manifest.artifact_id,
        errors,
        warnings
      };
    }

    // Mark as verified
    this.verifiedArtifacts.set(manifest.artifact_id, manifest);

    return {
      verified: true,
      artifact_id: manifest.artifact_id,
      errors: [],
      warnings,
      signer_id: manifest.signer_id
    };
  }

  /**
   * Verify cryptographic signature (algorithm-specific)
   */
  private async verifySignature(
    content: Buffer,
    signatureBase64: string,
    publicKeyBase64: string,
    alg: SignatureAlgorithm
  ): Promise<boolean> {
    if (alg === 'ed25519') {
      // Use Web Crypto API (Node 18+)
      const { subtle } = globalThis.crypto;

      try {
        const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
        const signatureBuffer = Buffer.from(signatureBase64, 'base64');

        const publicKey = await subtle.importKey(
          'spki',
          publicKeyBuffer,
          { name: 'Ed25519' } as any,
          false,
          ['verify']
        );

        const valid = await subtle.verify(
          { name: 'Ed25519' } as any,
          publicKey,
          signatureBuffer,
          content
        );

        return valid;
      } catch (error) {
        console.error('Ed25519 verification error:', error);
        return false;
      }
    } else if (alg === 'hmac-sha256') {
      // HMAC verification (for non-public artifacts)
      const { createHmac } = await import('crypto');
      const expectedSig = createHmac('sha256', Buffer.from(publicKeyBase64, 'base64'))
        .update(content)
        .digest('base64');
      return expectedSig === signatureBase64;
    }

    throw new Error(`UNSUPPORTED_ALGORITHM: ${alg}`);
  }

  /**
   * Check if artifact is verified
   */
  isVerified(artifact_id: string): boolean {
    return this.verifiedArtifacts.has(artifact_id);
  }

  /**
   * Get verified artifact manifest
   */
  getVerifiedManifest(artifact_id: string): ArtifactManifest | undefined {
    return this.verifiedArtifacts.get(artifact_id);
  }

  /**
   * List all verified artifacts
   */
  listVerifiedArtifacts(): ArtifactManifest[] {
    return Array.from(this.verifiedArtifacts.values());
  }

  /**
   * Get trust store status
   */
  getTrustStoreStatus(): { total_signers: number; signers: string[] } {
    return {
      total_signers: this.trustStore.size,
      signers: Array.from(this.trustStore.keys())
    };
  }
}

/**
 * Global singleton instance
 */
let globalArtifactVerifier: ArtifactVerifier | null = null;

/**
 * Initialize global artifact verifier
 */
export async function initializeArtifactVerifier(config?: { testMode?: boolean }): Promise<ArtifactVerifier> {
  if (globalArtifactVerifier) {
    throw new Error('ARTIFACT_VERIFIER_ALREADY_INITIALIZED');
  }
  globalArtifactVerifier = new ArtifactVerifier();
  await globalArtifactVerifier.loadTrustStore(config);
  console.log('🔐 ArtifactVerifier: Initialized');
  return globalArtifactVerifier;
}

/**
 * Get global artifact verifier (throws if not initialized)
 */
export function getArtifactVerifier(): ArtifactVerifier {
  if (!globalArtifactVerifier) {
    throw new Error('ARTIFACT_VERIFIER_NOT_INITIALIZED: Call initializeArtifactVerifier() first');
  }
  return globalArtifactVerifier;
}

/**
 * Check if artifact verifier is initialized
 */
export function isArtifactVerifierInitialized(): boolean {
  return globalArtifactVerifier !== null;
}
