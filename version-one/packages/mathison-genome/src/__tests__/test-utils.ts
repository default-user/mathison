/**
 * Test utilities for genome conformance tests
 * Provides real Ed25519 signature generation (no dummy signatures)
 */

import type { webcrypto } from 'crypto';
import { Genome, canonicalizeGenome } from '../index';

export interface TestKeypair {
  keyId: string;
  publicKeyBase64: string;
  privateKey: webcrypto.CryptoKey;
}

/**
 * Generate a real Ed25519 keypair for testing
 */
export async function generateTestKeypair(keyId: string): Promise<TestKeypair> {
  const { subtle } = globalThis.crypto;

  const keypair = await subtle.generateKey(
    {
      name: 'Ed25519',
      namedCurve: 'Ed25519'
    } as any,
    true,
    ['sign', 'verify']
  );

  const publicKeyRaw = await subtle.exportKey('spki', keypair.publicKey);
  const publicKeyBase64 = Buffer.from(publicKeyRaw).toString('base64');

  return {
    keyId,
    publicKeyBase64,
    privateKey: keypair.privateKey
  };
}

/**
 * Sign a genome with a real Ed25519 signature (no dummy)
 */
export async function signGenome(
  genome: Genome,
  keypair: TestKeypair
): Promise<Genome> {
  const { subtle } = globalThis.crypto;

  const canonical = canonicalizeGenome(genome);
  const canonicalBytes = Buffer.from(canonical, 'utf-8');

  const signatureBuffer = await subtle.sign(
    'Ed25519',
    keypair.privateKey,
    canonicalBytes
  );

  const sig_base64 = Buffer.from(signatureBuffer).toString('base64');

  return {
    ...genome,
    signature: {
      alg: 'ed25519',
      signer_key_id: keypair.keyId,
      sig_base64
    }
  };
}

/**
 * Sign a genome with multiple real signatures
 */
export async function multiSignGenome(
  genome: Genome,
  keypairs: TestKeypair[]
): Promise<Genome> {
  const { subtle } = globalThis.crypto;

  const canonical = canonicalizeGenome(genome);
  const canonicalBytes = Buffer.from(canonical, 'utf-8');

  const signatures = await Promise.all(
    keypairs.map(async (keypair) => {
      const signatureBuffer = await subtle.sign(
        'Ed25519',
        keypair.privateKey,
        canonicalBytes
      );

      return {
        alg: 'ed25519' as const,
        signer_key_id: keypair.keyId,
        sig_base64: Buffer.from(signatureBuffer).toString('base64')
      };
    })
  );

  return {
    ...genome,
    signatures
  };
}

/**
 * Tamper with a genome's manifest (for testing fail-closed behavior)
 */
export function tamperManifest(genome: Genome): Genome {
  if (!genome.build_manifest || !genome.build_manifest.files || genome.build_manifest.files.length === 0) {
    throw new Error('Cannot tamper: genome has no manifest files');
  }

  return {
    ...genome,
    build_manifest: {
      files: genome.build_manifest.files.map(f => ({
        ...f,
        sha256: 'tampered_' + f.sha256
      }))
    }
  };
}
