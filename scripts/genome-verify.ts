#!/usr/bin/env tsx
/**
 * Genome verification utility
 * Usage: tsx scripts/genome-verify.ts <genome-path>
 *
 * Verifies genome schema and signature without loading into server
 */

import { loadAndVerifyGenome } from '../packages/mathison-genome/src/index';

async function verifyGenome(genomePath: string): Promise<void> {
  console.log(`🔍 Verifying genome: ${genomePath}`);
  console.log('');

  try {
    const { genome, genome_id } = await loadAndVerifyGenome(genomePath);

    console.log('✅ Genome verification successful!');
    console.log('');
    console.log('Genome Details:');
    console.log(`  Name: ${genome.name}`);
    console.log(`  Version: ${genome.version}`);
    console.log(`  Genome ID: ${genome_id}`);
    console.log(`  Created: ${genome.created_at}`);
    console.log(`  Parents: ${genome.parents.length === 0 ? '(root genome)' : genome.parents.join(', ')}`);
    console.log('');
    console.log('Authority:');
    console.log(`  Signers: ${genome.authority.signers.length}`);
    console.log(`  Threshold: ${genome.authority.threshold}`);
    for (const signer of genome.authority.signers) {
      console.log(`    - ${signer.key_id} (${signer.alg})`);
    }
    console.log('');
    console.log('Governance:');
    console.log(`  Invariants: ${genome.invariants.length}`);
    for (const inv of genome.invariants) {
      console.log(`    - ${inv.id} [${inv.severity}]: ${inv.testable_claim}`);
    }
    console.log('');
    console.log(`  Capabilities: ${genome.capabilities.length}`);
    for (const cap of genome.capabilities) {
      console.log(`    - ${cap.cap_id} [${cap.risk_class}]: ${cap.allow_actions.length} allowed, ${cap.deny_actions.length} denied`);
    }
    console.log('');
    console.log('✅ This genome is ready for production use.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Set MATHISON_GENOME_PATH environment variable to this file path');
    console.log('2. Start the Mathison server');
    console.log('3. Verify genome loaded via GET /genome endpoint');

    process.exit(0);
  } catch (error) {
    console.error('❌ Genome verification FAILED');
    console.error('');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('This genome CANNOT be used in production.');
    console.error('');
    console.error('Common issues:');
    console.error('  - Invalid JSON syntax');
    console.error('  - Missing required fields');
    console.error('  - Invalid signature (wrong key or tampered content)');
    console.error('  - Schema version mismatch');
    console.error('');
    console.error('See PRODUCTION_REQUIREMENTS.md for genome creation instructions.');

    process.exit(1);
  }
}

// CLI entry point
if (require.main === module) {
  const genomePath = process.argv[2];
  if (!genomePath) {
    console.error('Usage: tsx scripts/genome-verify.ts <genome-path>');
    console.error('');
    console.error('Example:');
    console.error('  tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json');
    process.exit(1);
  }

  verifyGenome(genomePath).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
