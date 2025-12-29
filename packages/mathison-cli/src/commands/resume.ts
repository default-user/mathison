/**
 * Resume command - Resume a failed/incomplete job
 */

import CheckpointEngine, { JobStatus } from 'mathison-checkpoint';
import EventLog from 'mathison-receipts';
import { TiritiAuditJob, TiritiAuditInputs } from 'mathison-jobs';

export interface ResumeOptions {
  jobId: string;
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  console.log(`🔄 Mathison - Resuming job ${options.jobId}...\n`);

  const checkpointEngine = new CheckpointEngine();
  const eventLog = new EventLog();

  await checkpointEngine.initialize();
  await eventLog.initialize();

  // Load checkpoint
  const checkpoint = await checkpointEngine.loadCheckpoint(options.jobId);

  if (!checkpoint) {
    throw new Error(`Job not found: ${options.jobId}`);
  }

  // Check if job can be resumed
  if (checkpoint.status === JobStatus.COMPLETED) {
    console.log('✅ Job already completed. Nothing to resume.');
    return;
  }

  if (checkpoint.status === JobStatus.FAILED) {
    throw new Error(`Job failed and cannot be resumed. Error: ${checkpoint.error}`);
  }

  console.log(`Status: ${checkpoint.status}`);
  console.log(`Current Stage: ${checkpoint.current_stage}`);
  console.log(`Completed Stages: ${checkpoint.completed_stages.join(', ')}`);
  console.log('');

  // Resume based on job type
  if (checkpoint.job_type === 'tiriti_audit') {
    const job = new TiritiAuditJob(options.jobId, checkpointEngine, eventLog);
    const inputs = checkpoint.inputs as unknown as TiritiAuditInputs;
    await job.run(inputs);
  } else {
    throw new Error(`Unknown job type: ${checkpoint.job_type}`);
  }

  console.log('\n📊 Resume Summary:');
  console.log(`  Checkpoint: .mathison/checkpoints/${options.jobId}.json`);
  console.log(`  Event Log: .mathison/eventlog.jsonl`);
}
