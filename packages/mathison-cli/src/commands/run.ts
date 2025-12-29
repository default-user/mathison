/**
 * Run command - Start a new job
 */

import * as path from 'path';
import * as crypto from 'crypto';
import CheckpointEngine from 'mathison-checkpoint';
import EventLog from 'mathison-receipts';
import { TiritiAuditJob } from 'mathison-jobs';
import { CDI } from 'mathison-governance/dist/cdi';

export interface RunOptions {
  job: string;
  in: string;
  outdir: string;
  policy?: string;
  jobId?: string;
}

export async function runCommand(options: RunOptions): Promise<void> {
  console.log('🚀 Mathison - Starting job...\n');

  // Fail-closed: Check governance availability BEFORE starting job
  const cdi = new CDI();
  try {
    await cdi.initialize();
  } catch (error) {
    // Governance unavailable - fail closed
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TREATY_UNAVAILABLE: Cannot start job without governance. ${message}`);
  }

  // Validate job type
  if (options.job !== 'tiriti-audit') {
    throw new Error(`Unknown job type: ${options.job}. Supported: tiriti-audit`);
  }

  // Generate job ID if not provided
  const jobId = options.jobId || generateJobId(options.job);

  console.log(`Job ID: ${jobId}`);
  console.log(`Job Type: ${options.job}`);
  console.log(`Input: ${options.in}`);
  console.log(`Output Dir: ${options.outdir}`);
  console.log('');

  // Initialize engines
  const checkpointEngine = new CheckpointEngine();
  const eventLog = new EventLog();

  // Run the job
  const job = new TiritiAuditJob(jobId, checkpointEngine, eventLog);

  await job.run({
    inputPath: options.in,
    outputDir: options.outdir,
    policyPath: options.policy
  });

  console.log('\n📊 Job Summary:');
  console.log(`  Checkpoint: .mathison/checkpoints/${jobId}.json`);
  console.log(`  Event Log: .mathison/eventlog.jsonl`);
  console.log(`  Outputs: ${options.outdir}/`);
}

function generateJobId(jobType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const random = crypto.randomBytes(4).toString('hex');
  return `${jobType}-${timestamp}-${random}`;
}
