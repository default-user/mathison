/**
 * Status command - Show job status
 */

import CheckpointEngine, { JobCheckpoint, JobStatus } from 'mathison-checkpoint';
import EventLog from 'mathison-receipts';

export interface StatusOptions {
  jobId?: string;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const checkpointEngine = new CheckpointEngine();
  const eventLog = new EventLog();

  await checkpointEngine.initialize();
  await eventLog.initialize();

  if (options.jobId) {
    // Show specific job
    await showJobDetails(options.jobId, checkpointEngine, eventLog);
  } else {
    // Show all jobs
    await showAllJobs(checkpointEngine);
  }
}

async function showAllJobs(checkpointEngine: CheckpointEngine): Promise<void> {
  const checkpoints = await checkpointEngine.listCheckpoints();

  if (checkpoints.length === 0) {
    console.log('No jobs found.');
    return;
  }

  console.log(`\n📋 Jobs (${checkpoints.length}):\n`);

  for (const checkpoint of checkpoints) {
    const statusIcon = getStatusIcon(checkpoint.status);
    const progress = `${checkpoint.completed_stages.length}/${getTotalStages(checkpoint.job_type)} stages`;

    console.log(`${statusIcon} ${checkpoint.job_id}`);
    console.log(`   Type: ${checkpoint.job_type}`);
    console.log(`   Status: ${checkpoint.status}`);
    console.log(`   Progress: ${progress}`);
    console.log(`   Current Stage: ${checkpoint.current_stage}`);
    console.log(`   Updated: ${new Date(checkpoint.updated_at).toLocaleString()}`);

    if (checkpoint.error) {
      console.log(`   Error: ${checkpoint.error}`);
    }

    console.log('');
  }
}

async function showJobDetails(
  jobId: string,
  checkpointEngine: CheckpointEngine,
  eventLog: EventLog
): Promise<void> {
  const checkpoint = await checkpointEngine.loadCheckpoint(jobId);

  if (!checkpoint) {
    console.log(`Job not found: ${jobId}`);
    return;
  }

  const statusIcon = getStatusIcon(checkpoint.status);

  console.log(`\n${statusIcon} Job: ${checkpoint.job_id}\n`);
  console.log(`Type: ${checkpoint.job_type}`);
  console.log(`Status: ${checkpoint.status}`);
  console.log(`Current Stage: ${checkpoint.current_stage}`);
  console.log(`Completed Stages: ${checkpoint.completed_stages.join(', ') || 'none'}`);
  console.log(`Created: ${new Date(checkpoint.created_at).toLocaleString()}`);
  console.log(`Updated: ${new Date(checkpoint.updated_at).toLocaleString()}`);

  if (checkpoint.error) {
    console.log(`\nError: ${checkpoint.error}`);
  }

  console.log('\nInputs:');
  console.log(JSON.stringify(checkpoint.inputs, null, 2));

  // Show recent events
  const receipts = await eventLog.readByJob(jobId);
  if (receipts.length > 0) {
    console.log(`\n📝 Recent Events (last 5):`);
    const recent = receipts.slice(-5);
    for (const receipt of recent) {
      console.log(`  [${receipt.timestamp}] ${receipt.stage} - ${receipt.action}`);
      if (receipt.notes) {
        console.log(`    ${receipt.notes}`);
      }
    }
  }

  console.log('');
}

function getStatusIcon(status: JobStatus): string {
  switch (status) {
    case JobStatus.COMPLETED:
      return '✅';
    case JobStatus.IN_PROGRESS:
      return '🔄';
    case JobStatus.FAILED:
      return '❌';
    case JobStatus.RESUMABLE_FAILURE:
      return '⚠️';
    case JobStatus.PENDING:
      return '⏳';
    default:
      return '❓';
  }
}

function getTotalStages(jobType: string): number {
  // tiriti-audit has 6 stages: LOAD, NORMALIZE, GOVERNANCE_CHECK, RENDER, VERIFY, DONE
  if (jobType === 'tiriti_audit') {
    return 6;
  }
  return 0;
}
