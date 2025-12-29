#!/usr/bin/env node
/**
 * Mathison CLI
 * Commands: run, status, resume, audit, doctor
 */

import { Command } from 'commander';
import * as path from 'path';
import { runCommand } from './commands/run';
import { statusCommand } from './commands/status';
import { resumeCommand } from './commands/resume';
import { auditCommand } from './commands/audit';
import { doctorCommand } from './commands/doctor';

const program = new Command();

program
  .name('mathison')
  .description('Mathison - Governance-first OI workflow engine')
  .version('0.1.0');

program
  .command('run')
  .description('Run a job')
  .requiredOption('--job <type>', 'Job type (e.g., tiriti-audit)')
  .requiredOption('--in <path>', 'Input file path')
  .requiredOption('--outdir <path>', 'Output directory')
  .option('--policy <path>', 'Policy file path (default: policies/tiriti_invariants.v1.json)')
  .option('--job-id <id>', 'Job ID (default: auto-generated)')
  .action(async (options) => {
    try {
      await runCommand(options);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show status of jobs')
  .option('--job-id <id>', 'Show specific job')
  .action(async (options) => {
    try {
      await statusCommand(options);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('resume')
  .description('Resume a failed/incomplete job')
  .requiredOption('--job-id <id>', 'Job ID to resume')
  .action(async (options) => {
    try {
      await resumeCommand(options);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Generate governance conformance report (audit pack)')
  .option('--format <type>', 'Output format: json, markdown, or both (default: both)', 'both')
  .option('--output <path>', 'Output directory (default: ./audit-pack)', './audit-pack')
  .action(async (options) => {
    try {
      await auditCommand(options);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Check storage backend health and readiness')
  .action(async () => {
    try {
      await doctorCommand();
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();
