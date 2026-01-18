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

  // Get dependency tree by parsing pnpm-lock.yaml
  let dependencies = [];
  try {
    // Try to read the lockfile
    const lockfilePath = resolve(process.cwd(), 'pnpm-lock.yaml');
    const lockfileContent = await readFile(lockfilePath, 'utf-8');

    // Extract package names and versions from lockfile
    // Format: /@scope/packagename@version or /packagename@version
    const packageRegex = /^\s+\/?(@?[\w\-@./]+)@([\d.]+(?:-[\w.]+)?(?:\+[\w.]+)?)/gm;
    let match;
    const seen = new Set();

    while ((match = packageRegex.exec(lockfileContent)) !== null) {
      let name = match[1];
      const version = match[2];

      // Clean up package name (remove leading /)
      if (name.startsWith('/')) {
        name = name.substring(1);
      }

      // Skip file: protocol and workspace: protocol packages
      if (name.includes('file:') || name.includes('workspace:')) {
        continue;
      }

      const key = `${name}@${version}`;

      if (!seen.has(key)) {
        seen.add(key);
        dependencies.push({ name, version, from: 'lockfile' });
      }
    }

    console.log(`  Found ${dependencies.length} dependencies in lockfile`);
  } catch (error) {
    console.warn(`Warning: Could not parse lockfile: ${error.message}`);
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
