#!/usr/bin/env node
/**
 * MATHISON QUADRATIC BRIDGE
 *
 * System-side OI bridge server that provides:
 * - SYSTEM/NETWORK stage capabilities to browser OIs
 * - HTTP API for action delegation
 * - Mesh protocol relay for peer-to-peer OI communication
 * - Receipt verification and hash chain continuity
 *
 * Architecture:
 *   Browser OI (BROWSER stage) <--HTTP--> Bridge OI (SYSTEM/NETWORK stage)
 *
 * The bridge enables browser OIs to access:
 * - Filesystem operations (system.exec, system.read, system.write)
 * - LLM with server-side API keys
 * - Network requests from a trusted context
 * - Mesh relay for multi-OI coordination
 */

import { createServer } from 'http';

// Dynamic import to load quad module
const quadModule = await import('./packages/mathison-quadratic/quad.ts');
const createOI = quadModule.createOI;

const PORT = process.env.BRIDGE_PORT || 3142;
const HOST = process.env.BRIDGE_HOST || 'localhost';

// ============================================================================
// BRIDGE OI SETUP
// ============================================================================

console.log('🌉 Mathison Quadratic Bridge starting...\n');

// Create bridge OI at NETWORK stage (has system + network + llm capabilities)
const bridgeOI = createOI({ stage: 'NETWORK', posture: 'NORMAL' });

console.log('Bridge OI initialized:');
console.log(`  OI ID: ${bridgeOI.state.oi_id}`);
console.log(`  Stage: ${bridgeOI.state.stage}`);
console.log(`  Posture: ${bridgeOI.state.posture}`);
console.log(`  Adapters: ${bridgeOI.getStatus().adapters.join(', ')}`);
console.log('');

// Store connected peer OIs (for mesh relay)
const peerRegistry = new Map();

// ============================================================================
// CORS HELPER
// ============================================================================

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OI-ID');
}

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = createServer(async (req, res) => {
  setCORS(res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // ============================================================================
  // GET /status - Bridge status
  // ============================================================================
  if (req.method === 'GET' && url.pathname === '/status') {
    const status = bridgeOI.getStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      bridge: 'Mathison Quadratic Bridge v0.2.0',
      oi_id: status.oi_id,
      stage: status.stage,
      posture: status.posture,
      adapters: status.adapters,
      receipts_count: status.receipts_count,
      peers_connected: peerRegistry.size,
      capabilities: [
        'system.exec',
        'system.read',
        'system.write',
        'llm.complete',
        'http.get',
        'http.post',
        'mesh.send',
        'mesh.receive',
      ],
    }, null, 2));
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
        const clientOIID = req.headers['x-oi-id'] || 'unknown';

        console.log(`[DISPATCH] Client OI: ${clientOIID}`);
        console.log(`[DISPATCH] Action: ${request.action}`);
        console.log(`[DISPATCH] Args: ${JSON.stringify(request.args)}`);

        // Dispatch to bridge OI
        const result = await bridgeOI.dispatch(request);

        console.log(`[DISPATCH] Result: ${result.success ? 'SUCCESS' : 'DENIED'}`);
        if (!result.success) {
          console.log(`[DISPATCH] Reason: ${result.reason}`);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result, null, 2));

      } catch (error) {
        console.error('[DISPATCH] Error:', error.message);
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
    const count = parseInt(url.searchParams.get('count') || '10');
    const receipts = bridgeOI.getLastReceipts(count);

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
        const beam = JSON.parse(body);

        // Relay via bridge OI's mesh adapter
        const result = await bridgeOI.dispatch({
          action: 'mesh.send',
          args: beam,
        });

        console.log(`[MESH] Beam sent: ${beam.beam_id} (${beam.from_oi} → ${beam.to_oi})`);

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

        console.log(`[PEER] Registered: ${oi_id} (${stage}) at ${address}`);

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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      valid,
      receipts_verified: receipts.length,
      errors,
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
      'GET  /status',
      'POST /dispatch',
      'GET  /receipts',
      'POST /mesh/send',
      'GET  /mesh/receive?oi_id=<id>',
      'POST /peer/register',
      'GET  /peers',
      'GET  /verify',
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
  console.log(`  GET  http://${HOST}:${PORT}/status`);
  console.log(`  POST http://${HOST}:${PORT}/dispatch`);
  console.log(`  GET  http://${HOST}:${PORT}/receipts`);
  console.log(`  POST http://${HOST}:${PORT}/mesh/send`);
  console.log(`  GET  http://${HOST}:${PORT}/mesh/receive?oi_id=<id>`);
  console.log(`  POST http://${HOST}:${PORT}/peer/register`);
  console.log(`  GET  http://${HOST}:${PORT}/peers`);
  console.log(`  GET  http://${HOST}:${PORT}/verify`);
  console.log('');
  console.log('Environment:');
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ not set'}`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Bridge shutting down...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});
