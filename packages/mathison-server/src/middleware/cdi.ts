// WHY: CDI middleware gates decisions

import { Request, Response, NextFunction } from 'express';
import { checkCDI } from '@mathison/governance';

/**
 * WHY: CDI pre-action check middleware
 */
export function cdiPreActionMiddleware(action: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const decision = await checkCDI(action, {
        namespace_id: req.body?.namespace_id || req.query?.namespace_id,
        user_id: req.headers['x-user-id'], // TODO: Extract from auth
      });

      if (!decision.allowed) {
        return res.status(403).json({
          error: 'CDI decision: denied',
          reason: decision.reason,
        });
      }

      if (decision.requires_confirmation) {
        // TODO: Handle confirmation flow
        return res.status(202).json({
          message: 'Action requires confirmation',
          reason: decision.reason,
        });
      }

      next();
    } catch (error: any) {
      res.status(500).json({
        error: 'CDI check failed',
        message: error.message,
      });
    }
  };
}

/**
 * WHY: CDI post-action check middleware (stub)
 */
export function cdiPostActionMiddleware(req: Request, res: Response, next: NextFunction) {
  // TODO: Implement post-action checks
  // TODO: Verify output doesn't violate policy
  // TODO: Redact cross-namespace leakage
  next();
}
