/**
 * Jobs API Routes
 * All endpoints protected by governance pipeline
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CheckpointEngine } from 'mathison-checkpoint';
import { EventLog } from 'mathison-receipts';
import { TiritiAuditJob, TiritiAuditInputs } from 'mathison-jobs/dist/tiriti_audit_job';
import { GovernanceContext, actionCheckHook, egressHook } from '../middleware/governance';
import * as path from 'path';
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
 * Register job routes with governance protection
 */
export async function registerJobRoutes(
  fastify: FastifyInstance,
  context: GovernanceContext,
  checkpointEngine: CheckpointEngine,
  eventLog: EventLog
): Promise<void> {
  /**
   * POST /v1/jobs/run
   * Run a new job with full governance checks
   */
  fastify.post<{ Body: RunJobRequest }>(
    '/v1/jobs/run',
    async (request: FastifyRequest<{ Body: RunJobRequest }>, reply: FastifyReply) => {
      const { job, in: inPath, outdir, policy } = request.body;

      // Validate required fields
      if (!job || !inPath || !outdir) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Missing required fields: job, in, outdir',
          code: 'MISSING_FIELDS'
        });
      }

      // CDI action check
      const allowed = await actionCheckHook(context, request, reply, 'run_job', {
        job,
        inPath,
        outdir,
        policy
      });

      if (!allowed) {
        return; // actionCheckHook already sent error response
      }

      try {
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

          const responsePayload: JobRunResponse = {
            job_id: jobId,
            status: 'COMPLETED',
            message: 'Job completed successfully'
          };

          // CDI output check + CIF egress
          const egressResult = await egressHook(context, request, reply, responsePayload);
          if (!egressResult.allowed) {
            return; // egressHook already sent error response
          }

          return reply.code(200).send(egressResult.sanitizedPayload || responsePayload);
        } else {
          return reply.code(400).send({
            error: 'Bad Request',
            message: `Unknown job type: ${job}`,
            code: 'UNKNOWN_JOB_TYPE'
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        const responsePayload = {
          error: 'Internal Server Error',
          message: `Job execution failed: ${errorMessage}`,
          code: 'JOB_EXECUTION_FAILED'
        };

        // Even error responses go through egress
        const egressResult = await egressHook(context, request, reply, responsePayload);
        if (!egressResult.allowed) {
          return;
        }

        return reply.code(500).send(egressResult.sanitizedPayload || responsePayload);
      }
    }
  );

  /**
   * GET /v1/jobs/:job_id/status
   * Get job status from checkpoint
   */
  fastify.get<{ Params: { job_id: string } }>(
    '/v1/jobs/:job_id/status',
    async (request: FastifyRequest<{ Params: { job_id: string } }>, reply: FastifyReply) => {
      const { job_id } = request.params;

      // CDI action check
      const allowed = await actionCheckHook(context, request, reply, 'get_job_status', {
        job_id
      });

      if (!allowed) {
        return;
      }

      try {
        const checkpoint = await checkpointEngine.loadCheckpoint(job_id);

        if (!checkpoint) {
          const responsePayload = {
            error: 'Not Found',
            message: `Job not found: ${job_id}`,
            code: 'JOB_NOT_FOUND'
          };

          const egressResult = await egressHook(context, request, reply, responsePayload);
          if (!egressResult.allowed) {
            return;
          }

          return reply.code(404).send(egressResult.sanitizedPayload || responsePayload);
        }

        const responsePayload = {
          job_id: checkpoint.job_id,
          job_type: checkpoint.job_type,
          status: checkpoint.status,
          current_stage: checkpoint.current_stage,
          completed_stages: checkpoint.completed_stages,
          created_at: checkpoint.created_at,
          updated_at: checkpoint.updated_at,
          error: checkpoint.error
        };

        const egressResult = await egressHook(context, request, reply, responsePayload);
        if (!egressResult.allowed) {
          return;
        }

        return reply.code(200).send(egressResult.sanitizedPayload || responsePayload);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        const responsePayload = {
          error: 'Internal Server Error',
          message: `Failed to get job status: ${errorMessage}`,
          code: 'STATUS_FETCH_FAILED'
        };

        const egressResult = await egressHook(context, request, reply, responsePayload);
        if (!egressResult.allowed) {
          return;
        }

        return reply.code(500).send(egressResult.sanitizedPayload || responsePayload);
      }
    }
  );

  /**
   * POST /v1/jobs/:job_id/resume
   * Resume a failed or incomplete job
   */
  fastify.post<{ Params: { job_id: string } }>(
    '/v1/jobs/:job_id/resume',
    async (request: FastifyRequest<{ Params: { job_id: string } }>, reply: FastifyReply) => {
      const { job_id } = request.params;

      // CDI action check
      const allowed = await actionCheckHook(context, request, reply, 'resume_job', {
        job_id
      });

      if (!allowed) {
        return;
      }

      try {
        const checkpoint = await checkpointEngine.loadCheckpoint(job_id);

        if (!checkpoint) {
          const responsePayload = {
            error: 'Not Found',
            message: `Job not found: ${job_id}`,
            code: 'JOB_NOT_FOUND'
          };

          const egressResult = await egressHook(context, request, reply, responsePayload);
          if (!egressResult.allowed) {
            return;
          }

          return reply.code(404).send(egressResult.sanitizedPayload || responsePayload);
        }

        if (checkpoint.status === 'COMPLETED') {
          const responsePayload = {
            error: 'Bad Request',
            message: 'Job already completed',
            code: 'JOB_ALREADY_COMPLETED'
          };

          const egressResult = await egressHook(context, request, reply, responsePayload);
          if (!egressResult.allowed) {
            return;
          }

          return reply.code(400).send(egressResult.sanitizedPayload || responsePayload);
        }

        if (checkpoint.status === 'FAILED') {
          const responsePayload = {
            error: 'Bad Request',
            message: 'Job failed permanently, cannot resume',
            code: 'JOB_FAILED_PERMANENT'
          };

          const egressResult = await egressHook(context, request, reply, responsePayload);
          if (!egressResult.allowed) {
            return;
          }

          return reply.code(400).send(egressResult.sanitizedPayload || responsePayload);
        }

        // Dispatch by job type
        if (checkpoint.job_type === 'tiriti-audit') {
          const inputs = checkpoint.inputs as unknown as TiritiAuditInputs;
          const job = new TiritiAuditJob(job_id, checkpointEngine, eventLog);
          await job.run(inputs);

          const responsePayload = {
            job_id,
            status: 'COMPLETED',
            message: 'Job resumed and completed successfully'
          };

          const egressResult = await egressHook(context, request, reply, responsePayload);
          if (!egressResult.allowed) {
            return;
          }

          return reply.code(200).send(egressResult.sanitizedPayload || responsePayload);
        } else {
          const responsePayload = {
            error: 'Bad Request',
            message: `Unknown job type: ${checkpoint.job_type}`,
            code: 'UNKNOWN_JOB_TYPE'
          };

          const egressResult = await egressHook(context, request, reply, responsePayload);
          if (!egressResult.allowed) {
            return;
          }

          return reply.code(400).send(egressResult.sanitizedPayload || responsePayload);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        const responsePayload = {
          error: 'Internal Server Error',
          message: `Failed to resume job: ${errorMessage}`,
          code: 'RESUME_FAILED'
        };

        const egressResult = await egressHook(context, request, reply, responsePayload);
        if (!egressResult.allowed) {
          return;
        }

        return reply.code(500).send(egressResult.sanitizedPayload || responsePayload);
      }
    }
  );

  /**
   * GET /v1/jobs/:job_id/receipts
   * Get all receipts (event log entries) for a job
   */
  fastify.get<{ Params: { job_id: string } }>(
    '/v1/jobs/:job_id/receipts',
    async (request: FastifyRequest<{ Params: { job_id: string } }>, reply: FastifyReply) => {
      const { job_id } = request.params;

      // CDI action check
      const allowed = await actionCheckHook(context, request, reply, 'get_job_receipts', {
        job_id
      });

      if (!allowed) {
        return;
      }

      try {
        const receipts = await eventLog.readByJob(job_id);

        const responsePayload = {
          job_id,
          count: receipts.length,
          receipts
        };

        const egressResult = await egressHook(context, request, reply, responsePayload);
        if (!egressResult.allowed) {
          return;
        }

        return reply.code(200).send(egressResult.sanitizedPayload || responsePayload);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        const responsePayload = {
          error: 'Internal Server Error',
          message: `Failed to fetch receipts: ${errorMessage}`,
          code: 'RECEIPTS_FETCH_FAILED'
        };

        const egressResult = await egressHook(context, request, reply, responsePayload);
        if (!egressResult.allowed) {
          return;
        }

        return reply.code(500).send(egressResult.sanitizedPayload || responsePayload);
      }
    }
  );
}
