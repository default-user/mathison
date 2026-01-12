#!/usr/bin/env node
import { SDKGenerator } from './index';
import * as path from 'path';

// Find repo root (go up from packages/mathison-sdk-generator)
const repoRoot = path.resolve(__dirname, '../../..');

async function main() {
  const generator = new SDKGenerator();

  console.log('🚀 Generating SDKs...');
  console.log(`   Repo root: ${repoRoot}`);

  await generator.generate({
    language: 'typescript',
    outputPath: path.join(repoRoot, 'sdks/typescript')
  });

  await generator.generate({
    language: 'python',
    outputPath: path.join(repoRoot, 'sdks/python')
  });

  await generator.generate({
    language: 'rust',
    outputPath: path.join(repoRoot, 'sdks/rust')
  });

  console.log('✅ All SDKs generated successfully');
}

main().catch(console.error);
