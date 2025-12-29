/**
 * ActionGate: Structural enforcement of governance pipeline
 *
 * This wrapper makes bypass structurally difficult by:
 * 1. Encapsulating the entire CIF→CDI→execute→CDI→CIF pipeline
 * 2. Preventing direct access to business logic without governance
 * 3. Type-safe action declarations
 *
 * Usage:
 *   const gate = new ActionGate(governanceContext);
 *   await gate.execute('run_job', request, reply, async (ctx) => {
 *     // Business logic here - only runs if governance allows
 *     return { job_id: '...' };
 *   });
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { GovernanceContext, actionCheckHook, egressHook } from './governance';

export type ActionHandler<T = any> = (ctx: {
  request: FastifyRequest;
  reply: FastifyReply;
  governance: {
    ingressResult: any;
    actionResult: any;
  };
}) => Promise<T>;

export class ActionGate {
  constructor(private context: GovernanceContext) {}

  /**
   * Execute an action with full governance enforcement
   *
   * Pipeline:
   * 1. CIF ingress (already ran in global preHandler)
   * 2. CDI checkAction
   * 3. Execute handler (only if ALLOW)
   * 4. CDI checkOutput
   * 5. CIF egress
   * 6. Return response
   *
   * @param action - Action name for CDI (e.g., 'run_job')
   * @param request - Fastify request
   * @param reply - Fastify reply
   * @param actionContext - Context for CDI action check
   * @param handler - Business logic (only runs if governance allows)
   * @returns Response payload (or throws if denied)
   */
  async execute<T>(
    action: string,
    request: FastifyRequest,
    reply: FastifyReply,
    actionContext: Record<string, unknown>,
    handler: ActionHandler<T>
  ): Promise<T | void> {
    // Step 1: CIF ingress already ran (global preHandler)
    // Verify governance context exists
    const governed = request as any;
    if (!governed.governance) {
      reply.code(503).send({
        error: 'Service Unavailable',
        message: 'CIF ingress did not run',
        code: 'GOVERNANCE_PIPELINE_BROKEN'
      });
      return;
    }

    // Step 2: CDI checkAction
    const actionAllowed = await actionCheckHook(
      this.context,
      request,
      reply,
      action,
      actionContext
    );

    if (!actionAllowed) {
      // actionCheckHook already sent error response
      return;
    }

    // Step 3: Execute handler (only if ALLOW)
    let handlerResult: T;
    try {
      handlerResult = await handler({
        request,
        reply,
        governance: governed.governance
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown';
      const errorPayload = {
        error: 'Internal Server Error',
        message: `Action execution failed: ${errorMessage}`,
        code: 'ACTION_EXECUTION_FAILED'
      };

      // Even errors go through egress
      const egressResult = await egressHook(this.context, request, reply, errorPayload);
      if (!egressResult.allowed) {
        return;
      }

      reply.code(500).send(egressResult.sanitizedPayload || errorPayload);
      return;
    }

    // Step 4 & 5: CDI checkOutput + CIF egress
    const egressResult = await egressHook(this.context, request, reply, handlerResult);

    if (!egressResult.allowed) {
      // egressHook already sent error response
      return;
    }

    // Step 6: Return sanitized response
    return egressResult.sanitizedPayload as T || handlerResult;
  }
}

/**
 * Helper for creating governed route handlers
 *
 * Example:
 *   fastify.post('/v1/jobs/run', governedHandler(
 *     governanceContext,
 *     'run_job',
 *     async (ctx) => {
 *       const { job, in: inPath, outdir } = ctx.request.body;
 *       // ... business logic ...
 *       return { job_id: '...', status: 'COMPLETED' };
 *     }
 *   ));
 */
export function governedHandler<T = any>(
  governanceContext: GovernanceContext,
  action: string,
  handler: ActionHandler<T>
) {
  const gate = new ActionGate(governanceContext);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const actionContext = {
      ...(request.body as Record<string, unknown> || {}),
      ...(request.params as Record<string, unknown> || {}),
      url: request.url
    };

    const result = await gate.execute(action, request, reply, actionContext, handler);

    if (result !== undefined && !reply.sent) {
      reply.send(result);
    }
  };
}
