/**
 * Genome loading and signature verification
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { Genome, GenomeVerificationResult } from './types';
import { validateGenomeSchema } from './validation';
import { canonicalizeGenome, computeGenomeId } from './canonicalization';

/**
 * Load genome from file path
 * Validates schema but does NOT verify signature
 */
export function loadGenome(filePath: string): Genome {
  const fileContent = readFileSync(filePath, 'utf-8');
  const genome = JSON.parse(fileContent);

  const validation = validateGenomeSchema(genome);
  if (!validation.valid) {
    throw new Error(`Invalid genome schema:\n${validation.errors.join('\n')}`);
  }

  return genome as Genome;
}

/**
 * Verify a single signature against canonical bytes
 */
async function verifySingleSignature(
  canonicalBytes: Buffer,
  signature: { alg: string; signer_key_id: string; sig_base64: string },
  signers: Array<{ key_id: string; alg: string; public_key: string }>
): Promise<{ valid: boolean; signer_key_id?: string; error?: string }> {
  // Find signer in authority
  const signer = signers.find(s => s.key_id === signature.signer_key_id);
  if (!signer) {
    return {
      valid: false,
      error: `Signer key_id not found in authority: ${signature.signer_key_id}`
    };
  }

  // Verify algorithm match
  if (signature.alg !== 'ed25519' || signer.alg !== 'ed25519') {
    return {
      valid: false,
      error: 'Only ed25519 signatures are supported'
    };
  }

  try {
    // Decode public key and signature from base64
    const publicKeyBuffer = Buffer.from(signer.public_key, 'base64');
    const signatureBuffer = Buffer.from(signature.sig_base64, 'base64');

    // Import public key using Web Crypto API (Node 18+)
    const { subtle } = globalThis.crypto;
    const publicKey = await subtle.importKey(
      'spki',
      publicKeyBuffer,
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519'
      } as any,
      false,
      ['verify']
    );

    // Verify signature using Web Crypto API
    const verified = await subtle.verify(
      { name: 'Ed25519' } as any,
      publicKey,
      signatureBuffer,
      canonicalBytes
    );

    if (!verified) {
      return {
        valid: false,
        error: `Invalid signature from signer: ${signature.signer_key_id}`
      };
    }

    return {
      valid: true,
      signer_key_id: signature.signer_key_id
    };
  } catch (error) {
    return {
      valid: false,
      error: `Signature verification error for ${signature.signer_key_id}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Verify genome signature(s) using ed25519
 * Supports both single signature and multi-signature with threshold
 * Returns verification result with genome_id
 */
export async function verifyGenomeSignature(genome: Genome): Promise<GenomeVerificationResult> {
  const errors: string[] = [];
  const genome_id = computeGenomeId(genome);

  // Collect all signatures (legacy single + new multi)
  const allSignatures: Array<{ alg: string; signer_key_id: string; sig_base64: string }> = [];
  if (genome.signature) {
    allSignatures.push(genome.signature);
  }
  if (genome.signatures) {
    allSignatures.push(...genome.signatures);
  }

  // Check at least one signature exists
  if (allSignatures.length === 0) {
    return {
      verified: false,
      genome_id,
      errors: ['Genome missing signature(s)']
    };
  }

  try {
    // Prepare canonical bytes for verification
    const canonical = canonicalizeGenome(genome);
    const canonicalBytes = Buffer.from(canonical, 'utf8');

    // Verify each signature and collect valid signers (deduplicated)
    const validSigners = new Set<string>();
    for (const sig of allSignatures) {
      const result = await verifySingleSignature(canonicalBytes, sig, genome.authority.signers);
      if (result.valid && result.signer_key_id) {
        validSigners.add(result.signer_key_id);
      } else if (result.error) {
        errors.push(result.error);
      }
    }

    // Check threshold enforcement
    const threshold = genome.authority.threshold;
    if (validSigners.size < threshold) {
      return {
        verified: false,
        genome_id,
        errors: [
          ...errors,
          `Threshold not met: ${validSigners.size} valid signature(s), but threshold is ${threshold}`
        ]
      };
    }

    return {
      verified: true,
      genome_id,
      errors: []
    };
  } catch (error) {
    return {
      verified: false,
      genome_id,
      errors: [`Signature verification error: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

/**
 * Verify build manifest file hashes
 * Computes SHA-256 for each file and compares to declared hash
 *
 * IMPORTANT: Uses raw bytes (Buffer) not utf8 string for stable cross-platform hashing
 * This ensures consistent hashes regardless of line endings or encoding
 */
export function verifyBuildManifest(genome: Genome, repoRoot: string): { verified: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const file of genome.build_manifest.files) {
    const filePath = resolve(join(repoRoot, file.path));

    // Check file exists
    if (!existsSync(filePath)) {
      errors.push(`Build manifest file missing: ${file.path}`);
      continue;
    }

    // Compute SHA-256 hash using RAW BYTES for stable cross-platform hashing
    try {
      // Read as raw Buffer, not string - this ensures consistent hashing
      // regardless of line endings (CRLF vs LF) or text encoding
      const fileBytes = readFileSync(filePath);
      const hash = createHash('sha256');
      hash.update(fileBytes);
      const computedHash = hash.digest('hex');

      // Compare to declared hash
      if (computedHash !== file.sha256) {
        errors.push(`Build manifest hash mismatch for ${file.path}: expected ${file.sha256}, got ${computedHash}`);
      }
    } catch (error) {
      errors.push(`Failed to verify ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    verified: errors.length === 0,
    errors
  };
}

/**
 * Load and verify genome in one operation
 * Throws if invalid or unverified
 *
 * Options:
 * - verifyManifest: If true, verify build_manifest file hashes (default: false)
 * - repoRoot: Repository root for manifest verification (default: process.cwd())
 */
export async function loadAndVerifyGenome(
  filePath: string,
  options?: { verifyManifest?: boolean; repoRoot?: string }
): Promise<{ genome: Genome; genome_id: string }> {
  const genome = loadGenome(filePath);
  const verification = await verifyGenomeSignature(genome);

  if (!verification.verified) {
    throw new Error(`Genome verification failed:\n${verification.errors.join('\n')}`);
  }

  // Optionally verify build manifest
  if (options?.verifyManifest) {
    const repoRoot = options.repoRoot || process.cwd();
    const manifestVerification = verifyBuildManifest(genome, repoRoot);

    if (!manifestVerification.verified) {
      throw new Error(`Build manifest verification failed:\n${manifestVerification.errors.join('\n')}`);
    }
  }

  return {
    genome,
    genome_id: verification.genome_id
  };
}
