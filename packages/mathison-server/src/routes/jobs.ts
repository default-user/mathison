/**
 * Jobs API Routes
 * All endpoints structurally enforced via ActionGate
 *
 * GOVERNANCE ARCHITECTURE:
 * - No manual governance calls (actionCheckHook/egressHook)
 * - All routes use governedHandler() wrapper
 * - ActionGate orchestrates: CIF ingress → CDI action → execute → CDI output → CIF egress
 * - Bypass structurally difficult (requires intentional ActionGate removal)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CheckpointEngine } from 'mathison-checkpoint';
import { EventLog } from 'mathison-receipts';
import { TiritiAuditJob, TiritiAuditInputs } from 'mathison-jobs/dist/tiriti_audit_job';
import { GovernanceContext } from '../middleware/governance';
import { governedHandler } from '../middleware/action-gate';
import * as crypto from 'crypto';

interface RunJobRequest {
  job: string;
  in: string;
  outdir: string;
  policy?: string;
}

interface JobRunResponse {
  job_id: string;
  status: string;
  message: string;
}

/**
 * Business logic: Execute a job run
 * CRITICAL: This function is ONLY callable via ActionGate
 * Direct imports/calls bypassing governance are forbidden
 */
async function executeJobRun(
  request: FastifyRequest,
  checkpointEngine: CheckpointEngine,
  eventLog: EventLog
): Promise<JobRunResponse> {
  const { job, in: inPath, outdir, policy } = request.body as RunJobRequest;

  // Input validation (400 errors don't need governance - no side effects)
  if (!job || !inPath || !outdir) {
    throw {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Missing required fields: job, in, outdir',
      code: 'MISSING_FIELDS'
    };
  }

  // Generate job ID
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomHex = crypto.randomBytes(4).toString('hex');
  const jobId = `${job}-${timestamp}-${randomHex}`;

  // Dispatch to job type
  if (job === 'tiriti-audit') {
    const inputs: TiritiAuditInputs = {
      inputPath: inPath,
      outputDir: outdir,
      policyPath: policy || 'policies/tiriti_invariants.v1.json'
    };

    const tiritiJob = new TiritiAuditJob(jobId, checkpointEngine, eventLog);
    await tiritiJob.run(inputs);

    return {
      job_id: jobId,
      status: 'COMPLETED',
      message: 'Job completed successfully'
    };
  } else {
    throw {
      statusCode: 400,
      error: 'Bad Request',
      message: `Unknown job type: ${job}`,
      code: 'UNKNOWN_JOB_TYPE'
    };
  }
}

/**
 * Business logic: Get job status
 */
async function getJobStatus(
  request: FastifyRequest,
  checkpointEngine: CheckpointEngine
): Promise<any> {
  const { job_id } = request.params as { job_id: string };

  const checkpoint = await checkpointEngine.loadCheckpoint(job_id);

  if (!checkpoint) {
    throw {
      statusCode: 404,
      error: 'Not Found',
      message: `Job not found: ${job_id}`,
      code: 'JOB_NOT_FOUND'
    };
  }

  return {
    job_id: checkpoint.job_id,
    job_type: checkpoint.job_type,
    status: checkpoint.status,
    current_stage: checkpoint.current_stage,
    completed_stages: checkpoint.completed_stages,
    created_at: checkpoint.created_at,
    updated_at: checkpoint.updated_at,
    error: checkpoint.error
  };
}

/**
 * Business logic: Resume a job
 */
async function resumeJob(
  request: FastifyRequest,
  checkpointEngine: CheckpointEngine,
  eventLog: EventLog
): Promise<any> {
  const { job_id } = request.params as { job_id: string };

  const checkpoint = await checkpointEngine.loadCheckpoint(job_id);

  if (!checkpoint) {
    throw {
      statusCode: 404,
      error: 'Not Found',
      message: `Job not found: ${job_id}`,
      code: 'JOB_NOT_FOUND'
    };
  }

  if (checkpoint.status === 'COMPLETED') {
    throw {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Job already completed',
      code: 'JOB_ALREADY_COMPLETED'
    };
  }

  if (checkpoint.status === 'FAILED') {
    throw {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Job failed permanently, cannot resume',
      code: 'JOB_FAILED_PERMANENT'
    };
  }

  // Dispatch by job type
  if (checkpoint.job_type === 'tiriti-audit') {
    const inputs = checkpoint.inputs as unknown as TiritiAuditInputs;
    const job = new TiritiAuditJob(job_id, checkpointEngine, eventLog);
    await job.run(inputs);

    return {
      job_id,
      status: 'COMPLETED',
      message: 'Job resumed and completed successfully'
    };
  } else {
    throw {
      statusCode: 400,
      error: 'Bad Request',
      message: `Unknown job type: ${checkpoint.job_type}`,
      code: 'UNKNOWN_JOB_TYPE'
    };
  }
}

/**
 * Business logic: Get job receipts
 */
async function getJobReceipts(
  request: FastifyRequest,
  eventLog: EventLog
): Promise<any> {
  const { job_id } = request.params as { job_id: string };

  const receipts = await eventLog.readByJob(job_id);

  return {
    job_id,
    count: receipts.length,
    receipts
  };
}

/**
 * Register job routes with ActionGate enforcement
 *
 * GOVERNANCE GUARANTEE:
 * All routes registered here MUST use governedHandler().
 * Any route bypassing governedHandler() violates architecture spec.
 */
export async function registerJobRoutes(
  fastify: FastifyInstance,
  context: GovernanceContext,
  checkpointEngine: CheckpointEngine,
  eventLog: EventLog
): Promise<void> {
  /**
   * POST /v1/jobs/run
   * ActionGate enforces: CIF ingress → CDI action → execute → CDI output → CIF egress
   */
  fastify.post<{ Body: RunJobRequest }>(
    '/v1/jobs/run',
    governedHandler(
      context,
      'run_job',
      async (ctx) => {
        try {
          return await executeJobRun(ctx.request, checkpointEngine, eventLog);
        } catch (err: any) {
          // Handle business logic errors with proper status codes
          if (err.statusCode) {
            ctx.reply.code(err.statusCode).send({
              error: err.error,
              message: err.message,
              code: err.code
            });
            return;
          }
          throw err; // Re-throw unknown errors for ActionGate to handle
        }
      }
    )
  );

  /**
   * GET /v1/jobs/:job_id/status
   * ActionGate enforces full governance pipeline
   */
  fastify.get<{ Params: { job_id: string } }>(
    '/v1/jobs/:job_id/status',
    governedHandler(
      context,
      'get_job_status',
      async (ctx) => {
        try {
          return await getJobStatus(ctx.request, checkpointEngine);
        } catch (err: any) {
          if (err.statusCode) {
            ctx.reply.code(err.statusCode).send({
              error: err.error,
              message: err.message,
              code: err.code
            });
            return;
          }
          throw err;
        }
      }
    )
  );

  /**
   * POST /v1/jobs/:job_id/resume
   * ActionGate enforces full governance pipeline
   */
  fastify.post<{ Params: { job_id: string } }>(
    '/v1/jobs/:job_id/resume',
    governedHandler(
      context,
      'resume_job',
      async (ctx) => {
        try {
          return await resumeJob(ctx.request, checkpointEngine, eventLog);
        } catch (err: any) {
          if (err.statusCode) {
            ctx.reply.code(err.statusCode).send({
              error: err.error,
              message: err.message,
              code: err.code
            });
            return;
          }
          throw err;
        }
      }
    )
  );

  /**
   * GET /v1/jobs/:job_id/receipts
   * ActionGate enforces full governance pipeline
   */
  fastify.get<{ Params: { job_id: string } }>(
    '/v1/jobs/:job_id/receipts',
    governedHandler(
      context,
      'get_job_receipts',
      async (ctx) => {
        try {
          return await getJobReceipts(ctx.request, eventLog);
        } catch (err: any) {
          if (err.statusCode) {
            ctx.reply.code(err.statusCode).send({
              error: err.error,
              message: err.message,
              code: err.code
            });
            return;
          }
          throw err;
        }
      }
    )
  );
}
