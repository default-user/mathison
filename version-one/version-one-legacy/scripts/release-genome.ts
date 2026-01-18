#!/usr/bin/env tsx
/**
 * P1.6: Genome Release Pipeline
 *
 * Complete release pipeline for producing a signed, verified genome artifact.
 *
 * Usage:
 *   tsx scripts/release-genome.ts <genome-dir> [--dist] [--sign] [--verify]
 *
 * Steps:
 *   1. Build packages (pnpm -r build) if --dist is used
 *   2. Generate build manifest hashes (--dist mode for production)
 *   3. Sign genome (if --sign is passed and GENOME_SIGNING_PRIVATE_KEY is set)
 *   4. Verify integrity (if --verify is passed)
 *
 * Examples:
 *   # Development: Update manifest with source hashes (no signing)
 *   tsx scripts/release-genome.ts genomes/TOTK_ROOT_v1.0.0
 *
 *   # Production: Build, hash dist, sign, and verify
 *   GENOME_SIGNING_PRIVATE_KEY=... tsx scripts/release-genome.ts genomes/TOTK_ROOT_v1.0.0 --dist --sign --verify
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

interface GenomeManifestFile {
  path: string;
  sha256: string;
}

interface GenomeManifest {
  files: GenomeManifestFile[];
}

interface Genome {
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
  build_manifest: GenomeManifest;
  signature?: {
    alg: string;
    signer_key_id: string;
    sig_base64: string;
  };
  signatures?: any[];
}

interface ReleaseOptions {
  genomeDir: string;
  distMode: boolean;
  sign: boolean;
  verify: boolean;
  signerKeyId: string;
}

function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  const hash = createHash('sha256');
  hash.update(content, 'utf8');
  return hash.digest('hex');
}

function resolveDistPath(srcPath: string, distMode: boolean): string {
  if (!distMode) {
    return srcPath;
  }
  if (srcPath.includes('/src/') && srcPath.endsWith('.ts')) {
    return srcPath.replace('/src/', '/dist/').replace(/\.ts$/, '.js');
  }
  return srcPath;
}

async function runRelease(options: ReleaseOptions): Promise<void> {
  const repoRoot = process.env.MATHISON_REPO_ROOT ?? resolve(__dirname, '..');
  const genomePath = join(options.genomeDir, 'genome.json');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MATHISON GENOME RELEASE PIPELINE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Genome directory: ${options.genomeDir}`);
  console.log(`  Repo root: ${repoRoot}`);
  console.log(`  Dist mode: ${options.distMode ? 'YES (production)' : 'NO (development)'}`);
  console.log(`  Sign: ${options.sign ? 'YES' : 'NO'}`);
  console.log(`  Verify: ${options.verify ? 'YES' : 'NO'}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Step 1: Build packages if dist mode
  if (options.distMode) {
    console.log('📦 Step 1: Building packages...');
    try {
      execSync('pnpm -r build', {
        cwd: repoRoot,
        stdio: 'inherit'
      });
      console.log('   ✓ Build completed');
    } catch (error) {
      console.error('   ❌ Build failed');
      throw new Error('Build failed');
    }
  } else {
    console.log('📦 Step 1: Skipping build (development mode)');
  }
  console.log('');

  // Step 2: Generate build manifest hashes
  console.log('🔐 Step 2: Generating build manifest hashes...');
  if (!existsSync(genomePath)) {
    throw new Error(`Genome file not found: ${genomePath}`);
  }

  const genomeContent = readFileSync(genomePath, 'utf-8');
  let genome: Genome = JSON.parse(genomeContent);

  console.log(`   Genome: ${genome.name} v${genome.version}`);
  console.log(`   Files: ${genome.build_manifest.files.length}`);

  let updatedCount = 0;
  let errorCount = 0;

  for (const file of genome.build_manifest.files) {
    const targetPath = resolveDistPath(file.path, options.distMode);
    const filePath = resolve(join(repoRoot, targetPath));

    if (!existsSync(filePath)) {
      console.error(`   ❌ File not found: ${targetPath}`);
      errorCount++;
      continue;
    }

    try {
      const newHash = computeFileHash(filePath);
      if (newHash !== file.sha256) {
        console.log(`   📝 Updated: ${file.path}`);
        file.sha256 = newHash;
        updatedCount++;
      } else {
        console.log(`   ✓ Unchanged: ${file.path}`);
      }
    } catch (error) {
      console.error(`   ❌ Error hashing ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
      errorCount++;
    }
  }

  if (errorCount > 0) {
    throw new Error(`Failed to hash ${errorCount} file(s)`);
  }

  // Remove existing signatures before re-signing
  const { signature, signatures, ...unsignedGenome } = genome;
  if (signature || signatures) {
    console.log('   🔓 Removed existing signature(s)');
  }

  console.log(`   ✓ Manifest updated (${updatedCount} changed, ${genome.build_manifest.files.length - updatedCount} unchanged)`);
  console.log('');

  // Step 3: Sign genome
  if (options.sign) {
    console.log('✍️  Step 3: Signing genome...');
    const privateKeyBase64 = process.env.GENOME_SIGNING_PRIVATE_KEY;
    if (!privateKeyBase64) {
      console.warn('   ⚠️  GENOME_SIGNING_PRIVATE_KEY not set - skipping signing');
      console.log('   To sign, set GENOME_SIGNING_PRIVATE_KEY environment variable');
    } else {
      try {
        // Import the canonical genome
        const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');

        // Import as Ed25519 private key
        const { subtle } = globalThis.crypto;
        const privateKey = await subtle.importKey(
          'pkcs8',
          privateKeyBuffer,
          { name: 'Ed25519' } as any,
          true,
          ['sign']
        );

        // Canonicalize genome
        const { canonicalizeGenome } = await import('../packages/mathison-genome/src/canonicalization.js');
        const canonical = canonicalizeGenome(unsignedGenome as any);
        const canonicalBytes = Buffer.from(canonical, 'utf8');

        // Sign
        const signatureArrayBuffer = await subtle.sign(
          { name: 'Ed25519' } as any,
          privateKey,
          canonicalBytes
        );
        const signatureBase64 = Buffer.from(signatureArrayBuffer).toString('base64');

        // Add signature
        genome = {
          ...unsignedGenome,
          signature: {
            alg: 'ed25519',
            signer_key_id: options.signerKeyId,
            sig_base64: signatureBase64
          }
        } as Genome;

        console.log(`   ✓ Signed with key: ${options.signerKeyId}`);
      } catch (error) {
        console.error(`   ❌ Signing failed: ${error instanceof Error ? error.message : String(error)}`);
        throw new Error('Signing failed');
      }
    }
  } else {
    console.log('✍️  Step 3: Skipping signing (--sign not specified)');
    genome = unsignedGenome as Genome;
  }
  console.log('');

  // Write updated genome
  writeFileSync(genomePath, JSON.stringify(genome, null, 2), 'utf-8');
  console.log(`📄 Wrote updated genome to: ${genomePath}`);
  console.log('');

  // Step 4: Verify integrity
  if (options.verify) {
    console.log('🔍 Step 4: Verifying integrity...');
    try {
      const { verifyGovernanceIntegrity } = await import('../packages/mathison-governance/src/integrity.js');
      const result = await verifyGovernanceIntegrity(
        genome.build_manifest.files,
        repoRoot,
        true  // strict mode
      );

      if (!result.valid) {
        console.error('   ❌ Integrity verification FAILED:');
        for (const error of result.errors) {
          console.error(`      - ${error}`);
        }
        throw new Error('Integrity verification failed');
      }

      console.log(`   ✓ Verified ${result.checked.length} files`);
      for (const check of result.checked) {
        console.log(`      ✓ ${check.path}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Integrity verification failed') {
        throw error;
      }
      console.error(`   ❌ Verification error: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error('Verification failed');
    }
  } else {
    console.log('🔍 Step 4: Skipping verification (--verify not specified)');
  }
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RELEASE COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Genome: ${genome.name} v${genome.version}`);
  console.log(`  Output: ${genomePath}`);
  console.log(`  Signed: ${genome.signature ? 'YES' : 'NO'}`);
  console.log(`  Verified: ${options.verify ? 'YES' : 'SKIPPED'}`);
  console.log('');
  console.log('  Next steps:');
  if (!genome.signature) {
    console.log('    - Sign genome: GENOME_SIGNING_PRIVATE_KEY=... tsx scripts/release-genome.ts ... --sign');
  }
  if (!options.verify) {
    console.log('    - Verify: tsx scripts/release-genome.ts ... --verify');
  }
  if (genome.signature) {
    console.log('    - Deploy genome to production');
    console.log('    - Set MATHISON_GENOME_PATH=/path/to/genome.json');
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Mathison Genome Release Pipeline

Usage:
  tsx scripts/release-genome.ts <genome-dir> [options]

Options:
  --dist          Build packages and hash dist/*.js instead of src/*.ts
  --sign          Sign the genome (requires GENOME_SIGNING_PRIVATE_KEY env var)
  --verify        Verify integrity after release
  --signer <id>   Signer key ID (default: dev-key-001)

Examples:
  # Development: Update manifest with source hashes
  tsx scripts/release-genome.ts genomes/TOTK_ROOT_v1.0.0

  # Production: Full release pipeline
  GENOME_SIGNING_PRIVATE_KEY=... tsx scripts/release-genome.ts genomes/TOTK_ROOT_v1.0.0 --dist --sign --verify

Environment Variables:
  GENOME_SIGNING_PRIVATE_KEY  Base64-encoded PKCS8 Ed25519 private key
  MATHISON_REPO_ROOT          Repository root (default: script parent dir)
`);
    process.exit(0);
  }

  const genomeDir = args[0];
  const distMode = args.includes('--dist');
  const sign = args.includes('--sign');
  const verify = args.includes('--verify');

  let signerKeyId = 'dev-key-001';
  const signerIdx = args.indexOf('--signer');
  if (signerIdx !== -1 && args[signerIdx + 1]) {
    signerKeyId = args[signerIdx + 1];
  }

  runRelease({
    genomeDir,
    distMode,
    sign,
    verify,
    signerKeyId
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('');
      console.error('❌ Release failed:', error.message);
      process.exit(1);
    });
}
