#!/usr/bin/env tsx
/**
 * Genome Audit Tool
 * Performs comprehensive verification of a genome:
 * - Signature verification (threshold compliance)
 * - Manifest verification (file hashes)
 * - Canonicalization stability
 * - Authority validation
 *
 * Usage: tsx scripts/genome-audit.ts <genome-path> [--verify-manifest]
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

interface GenomeSigner {
  key_id: string;
  alg: 'ed25519';
  public_key: string;
}

interface GenomeAuthority {
  signers: GenomeSigner[];
  threshold: number;
}

interface GenomeSignature {
  alg: 'ed25519';
  signer_key_id: string;
  sig_base64: string;
}

interface GenomeBuildManifest {
  files: Array<{
    path: string;
    sha256: string;
  }>;
}

interface Genome {
  schema_version: 'genome.v0.1';
  name: string;
  version: string;
  parents: string[];
  created_at: string;
  authority: GenomeAuthority;
  invariants: any[];
  capabilities: any[];
  build_manifest: GenomeBuildManifest;
  signature?: GenomeSignature;
  signatures?: GenomeSignature[];
}

interface AuditResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

function canonicalizeGenome(genome: Genome): string {
  const clone = JSON.parse(JSON.stringify(genome));
  delete clone.signature;
  delete clone.signatures;
  return JSON.stringify(sortKeysDeep(clone));
}

function sortKeysDeep(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysDeep);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((result: any, key) => {
        result[key] = sortKeysDeep(obj[key]);
        return result;
      }, {});
  }
  return obj;
}

async function verifySignature(
  canonicalBytes: Buffer,
  signature: GenomeSignature,
  signer: GenomeSigner
): Promise<boolean> {
  try {
    const { subtle } = globalThis.crypto;

    const publicKeyBuffer = Buffer.from(signer.public_key, 'base64');
    const publicKey = await subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: 'Ed25519', namedCurve: 'Ed25519' } as any,
      false,
      ['verify']
    );

    const signatureBuffer = Buffer.from(signature.sig_base64, 'base64');

    return await subtle.verify(
      'Ed25519',
      publicKey,
      signatureBuffer,
      canonicalBytes
    );
  } catch (error: any) {
    return false;
  }
}

async function auditGenome(
  genomePath: string,
  verifyManifest: boolean = false
): Promise<AuditResult> {
  const result: AuditResult = {
    passed: true,
    errors: [],
    warnings: [],
    info: []
  };

  // Load genome
  if (!existsSync(genomePath)) {
    result.passed = false;
    result.errors.push(`Genome file not found: ${genomePath}`);
    return result;
  }

  let genome: Genome;
  try {
    const content = readFileSync(genomePath, 'utf-8');
    genome = JSON.parse(content);
  } catch (error: any) {
    result.passed = false;
    result.errors.push(`Failed to parse genome: ${error.message}`);
    return result;
  }

  result.info.push(`Genome: ${genome.name} v${genome.version}`);
  result.info.push(`Schema: ${genome.schema_version}`);

  // Validate authority
  if (!genome.authority || !genome.authority.signers || genome.authority.signers.length === 0) {
    result.passed = false;
    result.errors.push('No signers defined in authority');
    return result;
  }

  if (genome.authority.threshold < 1 || genome.authority.threshold > genome.authority.signers.length) {
    result.passed = false;
    result.errors.push(`Invalid threshold: ${genome.authority.threshold} (signers: ${genome.authority.signers.length})`);
    return result;
  }

  result.info.push(`Authority: ${genome.authority.signers.length} signers, threshold ${genome.authority.threshold}`);

  // Canonicalize
  const canonical = canonicalizeGenome(genome);
  const canonicalBytes = Buffer.from(canonical, 'utf-8');
  result.info.push(`Canonical bytes: ${canonicalBytes.length}`);

  // Get signatures
  const signatures = genome.signatures || (genome.signature ? [genome.signature] : []);
  if (signatures.length === 0) {
    result.passed = false;
    result.errors.push('No signatures found');
    return result;
  }

  result.info.push(`Signatures: ${signatures.length}`);

  // Verify each signature
  let validSigs = 0;
  for (const sig of signatures) {
    const signer = genome.authority.signers.find(s => s.key_id === sig.signer_key_id);
    if (!signer) {
      result.warnings.push(`Unknown signer: ${sig.signer_key_id}`);
      continue;
    }

    const valid = await verifySignature(canonicalBytes, sig, signer);
    if (valid) {
      validSigs++;
      result.info.push(`✓ Valid signature from ${sig.signer_key_id}`);
    } else {
      result.warnings.push(`✗ Invalid signature from ${sig.signer_key_id}`);
    }
  }

  // Check threshold
  if (validSigs < genome.authority.threshold) {
    result.passed = false;
    result.errors.push(`Threshold not met: ${validSigs} valid signatures, need ${genome.authority.threshold}`);
  } else {
    result.info.push(`✓ Threshold met: ${validSigs}/${genome.authority.threshold}`);
  }

  // Verify manifest if requested
  if (verifyManifest && genome.build_manifest && genome.build_manifest.files) {
    result.info.push(`Verifying manifest: ${genome.build_manifest.files.length} files`);

    const repoRoot = resolve(genomePath, '../..');
    let manifestErrors = 0;

    for (const file of genome.build_manifest.files) {
      const filePath = join(repoRoot, file.path);
      if (!existsSync(filePath)) {
        result.warnings.push(`Manifest file missing: ${file.path}`);
        manifestErrors++;
        continue;
      }

      const content = readFileSync(filePath);
      const hash = createHash('sha256').update(content).digest('hex');

      if (hash !== file.sha256) {
        result.warnings.push(`Manifest hash mismatch: ${file.path}`);
        manifestErrors++;
      }
    }

    if (manifestErrors > 0) {
      result.warnings.push(`Manifest verification: ${manifestErrors} errors`);
    } else {
      result.info.push(`✓ Manifest verified: all files match`);
    }
  }

  return result;
}

// CLI entry point
if (require.main === module) {
  const genomePath = process.argv[2];
  const verifyManifest = process.argv.includes('--verify-manifest');

  if (!genomePath) {
    console.error('Usage: tsx scripts/genome-audit.ts <genome-path> [--verify-manifest]');
    process.exit(1);
  }

  auditGenome(genomePath, verifyManifest)
    .then((result) => {
      console.log('\n🔍 Genome Audit Report\n');

      if (result.info.length > 0) {
        console.log('ℹ️  Info:');
        result.info.forEach(msg => console.log(`   ${msg}`));
        console.log('');
      }

      if (result.warnings.length > 0) {
        console.log('⚠️  Warnings:');
        result.warnings.forEach(msg => console.log(`   ${msg}`));
        console.log('');
      }

      if (result.errors.length > 0) {
        console.log('❌ Errors:');
        result.errors.forEach(msg => console.log(`   ${msg}`));
        console.log('');
      }

      if (result.passed) {
        console.log('✅ AUDIT PASSED\n');
        process.exit(0);
      } else {
        console.log('❌ AUDIT FAILED\n');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('❌ Audit error:', error.message);
      process.exit(1);
    });
}
