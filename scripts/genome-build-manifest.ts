#!/usr/bin/env tsx
/**
 * Genome build manifest script
 * Computes SHA-256 hashes for all files in build_manifest and updates genome
 * Usage: tsx scripts/genome-build-manifest.ts <genome-dir>
 *
 * Example: tsx scripts/genome-build-manifest.ts genomes/TOTK_ROOT_v1.0.0
 *
 * This script:
 * 1. Reads genome.json from the specified directory
 * 2. Computes SHA-256 hashes for all files in build_manifest
 * 3. Updates genome.json with the new hashes
 * 4. Does NOT sign the genome (run genome-sign.ts separately)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

interface GenomeManifest {
  files: Array<{
    path: string;
    sha256: string;
  }>;
}

interface Genome {
  schema_version: string;
  name: string;
  version: string;
  parents: string[];
  created_at: string;
  authority: any;
  invariants: any[];
  capabilities: any[];
  build_manifest: GenomeManifest;
  signature?: any;
  signatures?: any[];
}

function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  const hash = createHash('sha256');
  hash.update(content, 'utf8');
  return hash.digest('hex');
}

/**
 * Resolve dist path from src path if dist mode is enabled
 * E.g., packages/foo/src/index.ts -> packages/foo/dist/index.js
 */
function resolveDistPath(srcPath: string, distMode: boolean): string {
  if (!distMode) {
    return srcPath;
  }

  // Check if path is a TypeScript source file
  if (srcPath.includes('/src/') && srcPath.endsWith('.ts')) {
    // Convert src/*.ts to dist/*.js
    return srcPath.replace('/src/', '/dist/').replace(/\.ts$/, '.js');
  }

  return srcPath;
}

async function buildManifest(genomeDir: string, distMode: boolean = false): Promise<void> {
  const genomePath = join(genomeDir, 'genome.json');

  // Read genome
  if (!existsSync(genomePath)) {
    throw new Error(`Genome file not found: ${genomePath}`);
  }

  const genomeContent = readFileSync(genomePath, 'utf-8');
  const genome: Genome = JSON.parse(genomeContent);

  // Get repo root (use MATHISON_REPO_ROOT env var if set, otherwise assume script is in scripts/)
  const repoRoot = process.env.MATHISON_REPO_ROOT ?? resolve(__dirname, '..');

  console.log(`📦 Building manifest for ${genome.name} v${genome.version}`);
  console.log(`   Repo root: ${repoRoot}`);
  console.log(`   Dist mode: ${distMode ? 'enabled (using dist/*.js)' : 'disabled (using src/*.ts)'}`);
  console.log(`   Files to hash: ${genome.build_manifest.files.length}`);

  // Compute hashes for all files
  let updatedCount = 0;
  let errorCount = 0;

  for (const file of genome.build_manifest.files) {
    // Resolve dist path if dist mode is enabled
    const targetPath = resolveDistPath(file.path, distMode);
    const filePath = resolve(join(repoRoot, targetPath));

    if (!existsSync(filePath)) {
      console.error(`   ❌ File not found: ${targetPath} (resolved from ${file.path})`);
      errorCount++;
      continue;
    }

    try {
      const newHash = computeFileHash(filePath);
      const oldHash = file.sha256;

      if (newHash !== oldHash) {
        console.log(`   📝 Updated: ${file.path}${distMode ? ` (hashed ${targetPath})` : ''}`);
        console.log(`      Old: ${oldHash.substring(0, 16)}...`);
        console.log(`      New: ${newHash.substring(0, 16)}...`);
        file.sha256 = newHash;
        updatedCount++;
      } else {
        console.log(`   ✓ Unchanged: ${file.path}${distMode ? ` (hashed ${targetPath})` : ''}`);
      }
    } catch (error) {
      console.error(`   ❌ Error hashing ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
      errorCount++;
    }
  }

  if (errorCount > 0) {
    throw new Error(`Failed to hash ${errorCount} file(s)`);
  }

  // Remove signature/signatures fields (they will be invalid after manifest changes)
  const { signature, signatures, ...unsignedGenome } = genome;
  if (signature || signatures) {
    console.log(`   🔓 Removed existing signature(s) (genome must be re-signed)`);
  }

  // Write updated genome
  writeFileSync(genomePath, JSON.stringify(unsignedGenome, null, 2), 'utf-8');

  console.log(`✅ Manifest built successfully`);
  console.log(`   Updated: ${updatedCount} file(s)`);
  console.log(`   Unchanged: ${genome.build_manifest.files.length - updatedCount} file(s)`);
  console.log(`   Next step: Sign genome with genome-sign.ts`);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: tsx scripts/genome-build-manifest.ts <genome-dir> [--dist]');
    console.error('Example: tsx scripts/genome-build-manifest.ts genomes/TOTK_ROOT_v1.0.0');
    console.error('         tsx scripts/genome-build-manifest.ts genomes/TOTK_ROOT_v1.0.0 --dist');
    console.error('');
    console.error('Options:');
    console.error('  --dist    Hash dist/*.js files instead of src/*.ts files (production mode)');
    process.exit(1);
  }

  const genomeDir = args[0];
  const distMode = args.includes('--dist');

  buildManifest(genomeDir, distMode)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Build manifest failed:', error.message);
      process.exit(1);
    });
}
