// WHY: Health check endpoint

import { Router } from 'express';

const router = Router();

/**
 * WHY: Health check for load balancers
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;
