#!/usr/bin/env tsx
/**
 * Genome signing script
 * Usage: tsx scripts/genome-sign.ts <unsigned-genome.json> <output-genome.json>
 *
 * Requires GENOME_SIGNING_PRIVATE_KEY environment variable (base64-encoded raw ed25519 private key)
 *
 * WARNING: NEVER commit private keys to the repository!
 */

import { readFileSync, writeFileSync } from 'fs';
import { sign } from 'crypto';

interface UnsignedGenome {
  schema_version: string;
  name: string;
  version: string;
  parents: string[];
  created_at: string;
  authority: {
    signers: Array<{
      key_id: string;
      alg: string;
      public_key: string;
    }>;
    threshold: number;
  };
  invariants: any[];
  capabilities: any[];
  build_manifest: any;
}

interface SignedGenome extends UnsignedGenome {
  signature: {
    alg: 'ed25519';
    signer_key_id: string;
    sig_base64: string;
  };
}

function canonicalizeGenome(genome: UnsignedGenome): string {
  return JSON.stringify(genome, Object.keys(genome).sort(), 2);
}

async function signGenome(inputPath: string, outputPath: string, signerKeyId: string): Promise<void> {
  // Read unsigned genome
  const genomeContent = readFileSync(inputPath, 'utf-8');
  const genome: UnsignedGenome = JSON.parse(genomeContent);

  // Get private key from environment
  const privateKeyBase64 = process.env.GENOME_SIGNING_PRIVATE_KEY;
  if (!privateKeyBase64) {
    throw new Error('GENOME_SIGNING_PRIVATE_KEY environment variable not set');
  }

  // Decode private key (PKCS8 format from keygen)
  const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');

  // Import as Ed25519 private key using Web Crypto API (Node 18+)
  const { subtle } = globalThis.crypto;
  const privateKey = await subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    {
      name: 'Ed25519',
      namedCurve: 'Ed25519'
    } as any,
    true,
    ['sign']
  );

  // Canonicalize genome
  const canonical = canonicalizeGenome(genome);
  const canonicalBytes = Buffer.from(canonical, 'utf8');

  // Sign using Web Crypto API
  const signatureArrayBuffer = await subtle.sign(
    { name: 'Ed25519' } as any,
    privateKey,
    canonicalBytes
  );
  const signatureBase64 = Buffer.from(signatureArrayBuffer).toString('base64');

  // Create signed genome
  const signedGenome: SignedGenome = {
    ...genome,
    signature: {
      alg: 'ed25519',
      signer_key_id: signerKeyId,
      sig_base64: signatureBase64
    }
  };

  // Write signed genome
  writeFileSync(outputPath, JSON.stringify(signedGenome, null, 2), 'utf-8');
  console.log(`✅ Genome signed successfully`);
  console.log(`   Input: ${inputPath}`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Signer: ${signerKeyId}`);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: tsx scripts/genome-sign.ts <unsigned-genome.json> <output-genome.json> [signer-key-id]');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];
  const signerKeyId = args[2] || 'dev-key-001';

  signGenome(inputPath, outputPath, signerKeyId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Signing failed:', error.message);
      process.exit(1);
    });
}
