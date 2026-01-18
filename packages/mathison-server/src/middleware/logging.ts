// WHY: Structured logging middleware

import { Request, Response, NextFunction } from 'express';

/**
 * WHY: Log requests with request_id and timing
 */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'];

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
    }));
  });

  next();
}
