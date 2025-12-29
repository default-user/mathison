/**
 * Audit command - Generate conformance report / audit pack
 *
 * P2-A deliverable: External audit pack
 * Fresh machine can run 1-2 commands and verify governance claims
 */

import * as path from 'path';
import { ConformanceReportGenerator } from 'mathison-audit';
import { FileCheckpointStore, FileReceiptStore } from 'mathison-storage';

export interface AuditOptions {
  format?: 'json' | 'markdown' | 'both';
  output?: string;
}

export async function auditCommand(options: AuditOptions): Promise<void> {
  console.log('📋 Mathison Governance Audit Pack Generator\n');

  const format = options.format || 'both';
  const outputDir = options.output || './audit-pack';

  // Initialize storage adapters
  const checkpointStore = new FileCheckpointStore();
  const receiptStore = new FileReceiptStore();

  // Create conformance report generator
  const generator = new ConformanceReportGenerator(
    checkpointStore,
    receiptStore,
    process.cwd()
  );

  console.log('🔍 Generating conformance report...');
  console.log(`   Format: ${format}`);
  console.log(`   Output: ${outputDir}\n`);

  try {
    // Generate report
    const report = await generator.generate();

    // Export based on format
    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(outputDir, 'conformance-report.json');
      await generator.exportJSON(jsonPath);
      console.log(`✅ JSON report: ${jsonPath}`);
    }

    if (format === 'markdown' || format === 'both') {
      const mdPath = path.join(outputDir, 'conformance-report.md');
      await generator.exportMarkdown(mdPath);
      console.log(`✅ Markdown report: ${mdPath}`);
    }

    console.log('\n📊 Report Summary:');
    console.log(`   Treaty: ${report.treaty.version} (hash: ${report.treaty.hash.substring(0, 12)}...)`);
    console.log(`   Reason Codes: ${report.reason_codes.length}`);
    console.log(`   Route Coverage: ${report.route_coverage.coverage_percent.toFixed(1)}%`);
    console.log(`   Test Suites: ${report.conformance_tests.total_suites}`);
    console.log(`   Total Tests: ${report.conformance_tests.total_tests}`);
    console.log(`   Passed: ${report.conformance_tests.passed_tests}`);
    console.log(`   Failed: ${report.conformance_tests.failed_tests}`);
    console.log(`   Skipped: ${report.conformance_tests.skipped_tests}`);
    console.log(`   Claims Mapped: ${report.claims.length}`);

    console.log('\n✅ Audit pack generated successfully!');
    console.log(`\nTo verify governance claims, review:`);
    console.log(`   ${path.join(outputDir, 'conformance-report.md')}`);
  } catch (error) {
    console.error('❌ Failed to generate audit pack:', error);
    process.exit(1);
  }
}
