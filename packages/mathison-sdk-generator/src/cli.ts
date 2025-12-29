#!/usr/bin/env node
import { SDKGenerator } from './index';

async function main() {
  const generator = new SDKGenerator();

  console.log('🚀 Generating SDKs...');

  await generator.generate({
    language: 'typescript',
    outputPath: './sdks/typescript'
  });

  await generator.generate({
    language: 'python',
    outputPath: './sdks/python'
  });

  await generator.generate({
    language: 'rust',
    outputPath: './sdks/rust'
  });

  console.log('✅ All SDKs generated successfully');
}

main().catch(console.error);
