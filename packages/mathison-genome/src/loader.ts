/**
 * Genome loading and signature verification
 */

import { readFileSync } from 'fs';
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
 * Verify genome signature using ed25519
 * Returns verification result with genome_id
 */
export async function verifyGenomeSignature(genome: Genome): Promise<GenomeVerificationResult> {
  const errors: string[] = [];
  const genome_id = computeGenomeId(genome);

  // Check signature exists
  if (!genome.signature) {
    return {
      verified: false,
      genome_id,
      errors: ['Genome missing signature']
    };
  }

  // Find signer in authority
  const signer = genome.authority.signers.find(s => s.key_id === genome.signature!.signer_key_id);
  if (!signer) {
    return {
      verified: false,
      genome_id,
      errors: [`Signer key_id not found in authority: ${genome.signature.signer_key_id}`]
    };
  }

  // Verify algorithm match
  if (genome.signature.alg !== 'ed25519' || signer.alg !== 'ed25519') {
    return {
      verified: false,
      genome_id,
      errors: ['Only ed25519 signatures are supported']
    };
  }

  try {
    // Prepare canonical bytes for verification
    const canonical = canonicalizeGenome(genome);
    const canonicalBytes = Buffer.from(canonical, 'utf8');

    // Decode public key and signature from base64
    const publicKeyBuffer = Buffer.from(signer.public_key, 'base64');
    const signatureBuffer = Buffer.from(genome.signature.sig_base64, 'base64');

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
        verified: false,
        genome_id,
        errors: ['Signature verification failed']
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
 * Load and verify genome in one operation
 * Throws if invalid or unverified
 */
export async function loadAndVerifyGenome(filePath: string): Promise<{ genome: Genome; genome_id: string }> {
  const genome = loadGenome(filePath);
  const verification = await verifyGenomeSignature(genome);

  if (!verification.verified) {
    throw new Error(`Genome verification failed:\n${verification.errors.join('\n')}`);
  }

  return {
    genome,
    genome_id: verification.genome_id
  };
}
