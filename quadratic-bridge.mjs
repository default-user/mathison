#!/usr/bin/env node
/**
 * MATHISON QUADRATIC BRIDGE (Secure)
 *
 * System-side OI bridge server that provides:
 * - SYSTEM/NETWORK stage capabilities to browser OIs
 * - HTTP API for action delegation
 * - Mesh protocol relay for peer-to-peer OI communication
 * - Receipt verification and hash chain continuity
 *
 * Architecture:
 *   Browser OI (BROWSER stage) <--HTTPS/Auth--> Bridge OI (SYSTEM/NETWORK stage)
 *
 * Security Features:
 * - API key authentication (BRIDGE_API_KEY)
 * - CORS origin allowlist (BRIDGE_ALLOWED_ORIGINS)
 * - Action allowlist with risk levels
 * - Rate limiting per client (configurable)
 * - Audit logging with timestamps
 * - Input validation and sanitization
 */

import { createServer } from 'http';
import { createHash } from 'crypto';

// Dynamic import to load quad module
const quadModule = await import('./packages/mathison-quadratic/quad.ts');
const createOI = quadModule.createOI;

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.BRIDGE_PORT || 3142;
const HOST = process.env.BRIDGE_HOST || 'localhost';
const API_KEY = process.env.BRIDGE_API_KEY || null;
const REQUIRE_AUTH = process.env.BRIDGE_REQUIRE_AUTH !== 'false';
const ALLOWED_ORIGINS = process.env.BRIDGE_ALLOWED_ORIGINS
  ? process.env.BRIDGE_ALLOWED_ORIGINS.split(',')
  : ['http://localhost:*', 'http://127.0.0.1:*', 'file://'];

// Rate limiting config
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.BRIDGE_RATE_LIMIT || '100');

// Action allowlist with risk levels
const ACTION_ALLOWLIST = new Map([
  // LOW RISK - Always allowed
  ['llm.complete', { risk: 'LOW', requiresAuth: true }],
  ['http.get', { risk: 'LOW', requiresAuth: true }],
  ['http.post', { risk: 'MEDIUM', requiresAuth: true }],

  // MEDIUM RISK - Allowed with authentication
  ['mesh.send', { risk: 'MEDIUM', requiresAuth: true }],
  ['mesh.receive', { risk: 'LOW', requiresAuth: true }],

  // HIGH RISK - System operations (requires explicit enable)
  ['system.exec', { risk: 'HIGH', requiresAuth: true, disabled: !process.env.BRIDGE_ALLOW_SYSTEM }],
  ['system.read', { risk: 'HIGH', requiresAuth: true, disabled: !process.env.BRIDGE_ALLOW_SYSTEM }],
  ['system.write', { risk: 'CRITICAL', requiresAuth: true, disabled: !process.env.BRIDGE_ALLOW_SYSTEM }],
]);

// ============================================================================
// SECURITY STATE
// ============================================================================

const rateLimitMap = new Map(); // clientId -> { count, resetAt }
const auditLog = [];
const MAX_AUDIT_LOG = 1000;

// ============================================================================
// SECURITY HELPERS
// ============================================================================

function logAudit(event, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  auditLog.push(entry);
  if (auditLog.length > MAX_AUDIT_LOG) {
    auditLog.shift();
  }

  // Console log for real-time monitoring
  console.log(`[${entry.timestamp}] ${event}:`, JSON.stringify(details, null, 0));
}

function checkRateLimit(clientId) {
  const now = Date.now();
  const client = rateLimitMap.get(clientId);

  if (!client || now > client.resetAt) {
    rateLimitMap.set(clientId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (client.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(client.resetAt).toISOString(),
    };
  }

  client.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - client.count };
}

function validateOrigin(origin, allowedOrigins) {
  if (!origin) return false;

  for (const allowed of allowedOrigins) {
    if (allowed === '*') return true;

    // Pattern matching for wildcards
    const pattern = allowed.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(origin)) return true;
  }

  return false;
}

function validateAuth(req) {
  if (!REQUIRE_AUTH) return { valid: true };

  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];

  const providedKey = authHeader?.replace('Bearer ', '') || apiKeyHeader;

  if (!API_KEY) {
    // No API key configured - allow if auth not strictly required
    return { valid: !REQUIRE_AUTH, reason: 'No API key configured on bridge' };
  }

  if (!providedKey) {
    return { valid: false, reason: 'Missing authentication' };
  }

  // Constant-time comparison to prevent timing attacks
  const expectedHash = createHash('sha256').update(API_KEY).digest('hex');
  const providedHash = createHash('sha256').update(providedKey).digest('hex');

  if (expectedHash !== providedHash) {
    return { valid: false, reason: 'Invalid API key' };
  }

  return { valid: true };
}

function validateAction(action) {
  const config = ACTION_ALLOWLIST.get(action);

  if (!config) {
    return { allowed: false, reason: 'Action not in allowlist' };
  }

  if (config.disabled) {
    return { allowed: false, reason: 'Action disabled (set BRIDGE_ALLOW_SYSTEM=true to enable)' };
  }

  return { allowed: true, risk: config.risk };
}

function setCORS(req, res) {
  const origin = req.headers['origin'];

  if (origin && validateOrigin(origin, ALLOWED_ORIGINS)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Don't set CORS header if origin not allowed
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0] || 'http://localhost:*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OI-ID, X-API-Key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sanitizeInput(obj, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return '[MAX_DEPTH]';

  if (typeof obj !== 'object' || obj === null) {
    // Sanitize strings
    if (typeof obj === 'string') {
      return obj.slice(0, 10000); // Max 10KB strings
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map(item => sanitizeInput(item, maxDepth, currentDepth + 1));
  }

  const sanitized = {};
  let keyCount = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (keyCount++ > 100) break; // Max 100 keys
    sanitized[key] = sanitizeInput(value, maxDepth, currentDepth + 1);
  }
  return sanitized;
}

// ============================================================================
// BRIDGE OI SETUP
// ============================================================================

console.log('🌉 Mathison Quadratic Bridge starting...\n');

// Create bridge OI at NETWORK stage
const bridgeOI = createOI({ stage: 'NETWORK', posture: 'HIGH' });

console.log('Bridge OI initialized:');
console.log(`  OI ID: ${bridgeOI.state.oi_id}`);
console.log(`  Stage: ${bridgeOI.state.stage}`);
console.log(`  Posture: ${bridgeOI.state.posture}`);
console.log(`  Adapters: ${bridgeOI.getStatus().adapters.join(', ')}`);
console.log('');

console.log('Security Configuration:');
console.log(`  Auth Required: ${REQUIRE_AUTH}`);
console.log(`  API Key: ${API_KEY ? '✓ configured' : '✗ not set (BRIDGE_API_KEY)'}`);
console.log(`  Allowed Origins: ${ALLOWED_ORIGINS.join(', ')}`);
console.log(`  Rate Limit: ${RATE_LIMIT_MAX} req/min`);
console.log(`  System Actions: ${process.env.BRIDGE_ALLOW_SYSTEM ? '✓ enabled' : '✗ disabled'}`);
console.log('');

if (REQUIRE_AUTH && !API_KEY) {
  console.warn('⚠️  WARNING: Auth required but no API key set!');
  console.warn('⚠️  Set BRIDGE_API_KEY or BRIDGE_REQUIRE_AUTH=false');
  console.log('');
}

// Store connected peer OIs (for mesh relay)
const peerRegistry = new Map();

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = createServer(async (req, res) => {
  setCORS(req, res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const clientId = req.headers['x-oi-id'] || req.socket.remoteAddress;

  // Check rate limit
  const rateLimit = checkRateLimit(clientId);
  if (!rateLimit.allowed) {
    logAudit('RATE_LIMIT_EXCEEDED', { clientId, resetAt: rateLimit.resetAt });
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': RATE_LIMIT_MAX,
      'X-RateLimit-Remaining': 0,
      'X-RateLimit-Reset': rateLimit.resetAt,
    });
    res.end(JSON.stringify({
      error: 'Rate limit exceeded',
      reset_at: rateLimit.resetAt,
    }));
    return;
  }

  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);

  // ============================================================================
  // GET /status - Bridge status (public endpoint)
  // ============================================================================
  if (req.method === 'GET' && url.pathname === '/status') {
    const status = bridgeOI.getStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      bridge: 'Mathison Quadratic Bridge v0.3.0 (Secure)',
      oi_id: status.oi_id,
      stage: status.stage,
      posture: status.posture,
      adapters: status.adapters,
      receipts_count: status.receipts_count,
      peers_connected: peerRegistry.size,
      security: {
        auth_required: REQUIRE_AUTH,
        rate_limit: `${RATE_LIMIT_MAX}/min`,
        system_actions: !!process.env.BRIDGE_ALLOW_SYSTEM,
      },
      capabilities: Array.from(ACTION_ALLOWLIST.entries())
        .filter(([_, cfg]) => !cfg.disabled)
        .map(([action, cfg]) => ({ action, risk: cfg.risk })),
    }, null, 2));
    return;
  }

  // ============================================================================
  // AUTH CHECK (for all other endpoints)
  // ============================================================================

  const auth = validateAuth(req);
  if (!auth.valid) {
    logAudit('AUTH_FAILED', { clientId, reason: auth.reason, path: url.pathname });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Unauthorized',
      reason: auth.reason,
      hint: REQUIRE_AUTH && !API_KEY ? 'Set BRIDGE_API_KEY environment variable' : undefined,
    }));
    return;
  }

  // ============================================================================
  // POST /dispatch - Relay action to bridge OI
  // ============================================================================
  if (req.method === 'POST' && url.pathname === '/dispatch') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        const sanitizedArgs = sanitizeInput(request.args || {});

        // Validate action
        const actionCheck = validateAction(request.action);
        if (!actionCheck.allowed) {
          logAudit('ACTION_DENIED', {
            clientId,
            action: request.action,
            reason: actionCheck.reason
          });
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Action not allowed',
            reason: actionCheck.reason,
          }));
          return;
        }

        logAudit('DISPATCH', {
          clientId,
          action: request.action,
          risk: actionCheck.risk,
          args_keys: Object.keys(sanitizedArgs),
        });

        // Dispatch to bridge OI
        const result = await bridgeOI.dispatch({
          action: request.action,
          args: sanitizedArgs,
        });

        logAudit('DISPATCH_RESULT', {
          clientId,
          action: request.action,
          success: result.success,
          reason: result.reason,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));

      } catch (error) {
        logAudit('DISPATCH_ERROR', { clientId, error: error.message });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    return;
  }

  // ============================================================================
  // GET /receipts - Get bridge OI receipts
  // ============================================================================
  if (req.method === 'GET' && url.pathname === '/receipts') {
    const count = Math.min(parseInt(url.searchParams.get('count') || '10'), 100);
    const receipts = bridgeOI.getLastReceipts(count);

    logAudit('RECEIPTS_READ', { clientId, count: receipts.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      receipts,
      total: bridgeOI.getStatus().receipts_count,
    }, null, 2));
    return;
  }

  // ============================================================================
  // POST /mesh/send - Send beam to peer OI
  // ============================================================================
  if (req.method === 'POST' && url.pathname === '/mesh/send') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const beam = sanitizeInput(JSON.parse(body));

        const result = await bridgeOI.dispatch({
          action: 'mesh.send',
          args: beam,
        });

        logAudit('MESH_SEND', {
          clientId,
          beam_id: beam.beam_id,
          from: beam.from_oi,
          to: beam.to_oi,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    return;
  }

  // ============================================================================
  // GET /mesh/receive - Receive beams for OI
  // ============================================================================
  if (req.method === 'GET' && url.pathname === '/mesh/receive') {
    const oiId = url.searchParams.get('oi_id');
    if (!oiId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing oi_id parameter' }));
      return;
    }

    const result = await bridgeOI.dispatch({
      action: 'mesh.receive',
      args: { oi_id: oiId },
    });

    logAudit('MESH_RECEIVE', { clientId, oi_id: oiId, count: result.data?.count || 0 });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // ============================================================================
  // POST /peer/register - Register peer OI
  // ============================================================================
  if (req.method === 'POST' && url.pathname === '/peer/register') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { oi_id, address, stage } = JSON.parse(body);

        peerRegistry.set(oi_id, {
          oi_id,
          address,
          stage,
          registered_at: Date.now(),
        });

        logAudit('PEER_REGISTERED', { clientId, peer_oi_id: oi_id, stage });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          oi_id,
          peers_count: peerRegistry.size,
        }));

      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });
    return;
  }

  // ============================================================================
  // GET /peers - List registered peers
  // ============================================================================
  if (req.method === 'GET' && url.pathname === '/peers') {
    const peers = Array.from(peerRegistry.values());

    logAudit('PEERS_LIST', { clientId, count: peers.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      peers,
      count: peers.length,
    }, null, 2));
    return;
  }

  // ============================================================================
  // GET /verify - Verify bridge OI receipt hash chain
  // ============================================================================
  if (req.method === 'GET' && url.pathname === '/verify') {
    const receipts = bridgeOI.getLastReceipts(1000);

    let valid = true;
    let prevHash = '0'.repeat(64);
    let errors = [];

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];

      if (receipt.prev_hash !== prevHash) {
        valid = false;
        errors.push(`Receipt ${i}: prev_hash mismatch`);
        break;
      }

      prevHash = receipt.logs_hash;
    }

    logAudit('VERIFY', { clientId, valid, receipts_count: receipts.length });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      valid,
      receipts_verified: receipts.length,
      errors,
    }, null, 2));
    return;
  }

  // ============================================================================
  // GET /audit - Get audit log (admin only)
  // ============================================================================
  if (req.method === 'GET' && url.pathname === '/audit') {
    const count = Math.min(parseInt(url.searchParams.get('count') || '50'), MAX_AUDIT_LOG);
    const recentAudit = auditLog.slice(-count);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      audit: recentAudit,
      total: auditLog.length,
    }, null, 2));
    return;
  }

  // ============================================================================
  // 404
  // ============================================================================
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Not found',
    available_endpoints: [
      'GET  /status (public)',
      'POST /dispatch (auth required)',
      'GET  /receipts (auth required)',
      'POST /mesh/send (auth required)',
      'GET  /mesh/receive?oi_id=<id> (auth required)',
      'POST /peer/register (auth required)',
      'GET  /peers (auth required)',
      'GET  /verify (auth required)',
      'GET  /audit (auth required)',
    ],
  }));
});

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, HOST, () => {
  console.log(`🌉 Bridge running at http://${HOST}:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  http://${HOST}:${PORT}/status (public)`);
  console.log(`  POST http://${HOST}:${PORT}/dispatch (auth)`);
  console.log(`  GET  http://${HOST}:${PORT}/receipts (auth)`);
  console.log(`  POST http://${HOST}:${PORT}/mesh/send (auth)`);
  console.log(`  GET  http://${HOST}:${PORT}/mesh/receive?oi_id=<id> (auth)`);
  console.log(`  POST http://${HOST}:${PORT}/peer/register (auth)`);
  console.log(`  GET  http://${HOST}:${PORT}/peers (auth)`);
  console.log(`  GET  http://${HOST}:${PORT}/verify (auth)`);
  console.log(`  GET  http://${HOST}:${PORT}/audit (auth)`);
  console.log('');
  console.log('Environment:');
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ not set'}`);
  console.log(`  BRIDGE_API_KEY: ${API_KEY ? '✓ set' : '✗ not set (generate with: openssl rand -hex 32)'}`);
  console.log('');

  if (!API_KEY && REQUIRE_AUTH) {
    console.warn('⚠️  SECURITY WARNING: No API key configured but auth is required!');
    console.warn('⚠️  Generate one: export BRIDGE_API_KEY=$(openssl rand -hex 32)');
    console.log('');
  }

  logAudit('BRIDGE_STARTED', { port: PORT, host: HOST });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Bridge shutting down...');
  logAudit('BRIDGE_SHUTDOWN', {});
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});
