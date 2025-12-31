#!/usr/bin/env node
/**
 * Generate SBOM (Software Bill of Materials) in CycloneDX format
 *
 * This script creates a minimal SBOM by parsing pnpm lockfile and package.json files.
 * It's a workaround for cyclonedx-npm incompatibility with pnpm 10.x.
 */

import { readFile, writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import { resolve } from 'path';

async function generateSBOM() {
  console.log('📦 Generating SBOM...');

  // Read root package.json
  const packageJson = JSON.parse(
    await readFile(resolve(process.cwd(), 'package.json'), 'utf-8')
  );

  // Get dependency tree from pnpm
  let dependencies = [];
  try {
    const output = execSync('pnpm list --json --depth=99 --recursive 2>/dev/null || pnpm list --json --depth=99', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const parsed = JSON.parse(output);

    // Extract dependencies from all workspace packages
    if (Array.isArray(parsed)) {
      for (const pkg of parsed) {
        // Add direct dependencies
        if (pkg.dependencies) {
          for (const [name, info] of Object.entries(pkg.dependencies)) {
            dependencies.push({
              name,
              version: typeof info === 'object' ? info.version : info,
              from: pkg.name
            });
          }
        }
        // Add dev dependencies
        if (pkg.devDependencies) {
          for (const [name, info] of Object.entries(pkg.devDependencies)) {
            dependencies.push({
              name,
              version: typeof info === 'object' ? info.version : info,
              from: pkg.name,
              scope: 'dev'
            });
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not get full dependency tree: ${error.message}`);
    console.warn('Falling back to package.json files...');
  }

  // Deduplicate
  const depMap = new Map();
  for (const dep of dependencies) {
    if (!depMap.has(dep.name)) {
      depMap.set(dep.name, dep);
    }
  }

  // Build CycloneDX SBOM
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.4',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: 'Mathison',
          name: 'generate-sbom.mjs',
          version: '1.0.0'
        }
      ],
      component: {
        type: 'application',
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description
      }
    },
    components: Array.from(depMap.values()).map(dep => ({
      type: 'library',
      name: dep.name,
      version: dep.version,
      purl: `pkg:npm/${dep.name}@${dep.version}`
    }))
  };

  // Write SBOM
  const outputPath = resolve(process.cwd(), 'SBOM.cdx.json');
  await writeFile(outputPath, JSON.stringify(sbom, null, 2));

  console.log(`✓ SBOM generated: ${outputPath}`);
  console.log(`  - Components: ${sbom.components.length}`);
  console.log(`  - Format: CycloneDX ${sbom.specVersion}`);
}

// Simple UUID v4 generator
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

generateSBOM().catch(error => {
  console.error('Error generating SBOM:', error);
  process.exit(1);
});
