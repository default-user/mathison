/**
 * Governance Middleware
 * Mandatory CIF ingress -> CDI checkAction -> CDI checkOutput -> CIF egress pipeline
 * Fail-closed: any governance component failure -> 503/403
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { CDI, ActionContext, ActionResult } from 'mathison-governance/dist/cdi';
import { CIF, IngressContext, EgressContext } from 'mathison-governance/dist/cif';

export interface GovernanceContext {
  cdi: CDI;
  cif: CIF;
}

export interface GovernedRequest extends FastifyRequest {
  governance?: {
    ingressResult: any;
    actionResult: any;
    actionName?: string;
  };
}

/**
 * Ingress hook - CIF boundary protection
 * Runs before route handler
 */
export async function ingressHook(
  context: GovernanceContext,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Fail-closed: if CIF not initialized, deny
  if (!context.cif) {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Governance components not initialized (CIF missing)',
      code: 'GOVERNANCE_NOT_READY'
    });
    return;
  }

  try {
    const ingressContext: IngressContext = {
      clientId: request.ip,
      endpoint: request.url,
      payload: request.body || {},
      headers: request.headers as Record<string, string>,
      timestamp: Date.now()
    };

    const ingressResult = await context.cif.ingress(ingressContext);

    if (!ingressResult.allowed) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'CIF ingress denied',
        violations: ingressResult.violations,
        code: 'CIF_INGRESS_DENIED'
      });
      return;
    }

    // Store ingress result for later stages
    (request as GovernedRequest).governance = {
      ingressResult,
      actionResult: null // placeholder
    };
  } catch (error) {
    // Fail-closed: ingress error -> deny
    reply.code(503).send({
      error: 'Service Unavailable',
      message: `CIF ingress error: ${error instanceof Error ? error.message : 'unknown'}`,
      code: 'CIF_INGRESS_ERROR'
    });
  }
}

/**
 * Action check - CDI governance evaluation
 * Runs after ingress, before business logic
 */
export async function actionCheckHook(
  context: GovernanceContext,
  request: FastifyRequest,
  reply: FastifyReply,
  action: string,
  actionContext: Record<string, unknown>
): Promise<boolean> {
  // Fail-closed: if CDI not initialized, deny
  if (!context.cdi) {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Governance components not initialized (CDI missing)',
      code: 'GOVERNANCE_NOT_READY'
    });
    return false;
  }

  try {
    const ctx: ActionContext = {
      actor: request.ip,
      action,
      payload: actionContext,
      metadata: {
        timestamp: new Date().toISOString(),
        url: request.url
      }
    };

    const actionResult = await context.cdi.checkAction(ctx);

    if (actionResult.verdict === 'deny' || actionResult.verdict === 'uncertain') {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'CDI action denied',
        reason: actionResult.reason,
        verdict: actionResult.verdict,
        code: 'CDI_ACTION_DENIED'
      });
      return false;
    }

    // Store action result
    if ((request as GovernedRequest).governance) {
      (request as GovernedRequest).governance!.actionResult = actionResult;
      (request as GovernedRequest).governance!.actionName = action;
    }

    return true;
  } catch (error) {
    // Fail-closed: action check error -> deny
    reply.code(503).send({
      error: 'Service Unavailable',
      message: `CDI action check error: ${error instanceof Error ? error.message : 'unknown'}`,
      code: 'CDI_ACTION_ERROR'
    });
    return false;
  }
}

/**
 * Egress hook - CDI output check + CIF egress protection
 * Runs before sending response
 */
export async function egressHook(
  context: GovernanceContext,
  request: FastifyRequest,
  reply: FastifyReply,
  responsePayload: any
): Promise<{ allowed: boolean; sanitizedPayload?: any }> {
  // Fail-closed: if governance not initialized, deny
  if (!context.cdi || !context.cif) {
    reply.code(503).send({
      error: 'Service Unavailable',
      message: 'Governance components not initialized',
      code: 'GOVERNANCE_NOT_READY'
    });
    return { allowed: false };
  }

  try {
    // CDI output check
    const responseText = typeof responsePayload === 'string'
      ? responsePayload
      : JSON.stringify(responsePayload);

    const outputResult = await context.cdi.checkOutput({ content: responseText });

    if (!outputResult.allowed) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'CDI output check denied',
        violations: outputResult.violations,
        code: 'CDI_OUTPUT_DENIED'
      });
      return { allowed: false };
    }

    // CIF egress
    const egressContext: EgressContext = {
      clientId: request.ip,
      endpoint: request.url,
      payload: responsePayload,
      metadata: {
        action: (request as GovernedRequest).governance?.actionName || 'unknown',
        timestamp: new Date().toISOString()
      }
    };

    const egressResult = await context.cif.egress(egressContext);

    if (!egressResult.allowed) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'CIF egress denied',
        violations: egressResult.violations,
        code: 'CIF_EGRESS_DENIED'
      });
      return { allowed: false };
    }

    // Return sanitized output if CIF modified it
    return {
      allowed: true,
      sanitizedPayload: egressResult.sanitizedPayload !== undefined
        ? egressResult.sanitizedPayload
        : responsePayload
    };
  } catch (error) {
    // Fail-closed: egress error -> deny
    reply.code(503).send({
      error: 'Service Unavailable',
      message: `Egress check error: ${error instanceof Error ? error.message : 'unknown'}`,
      code: 'EGRESS_ERROR'
    });
    return { allowed: false };
  }
}
