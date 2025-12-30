/**
 * Phase 4-B: Memory Write Conformance Tests
 * Proves: Write memory API fully governed (ActionGate + idempotency + receipts)
 */

import { MathisonServer } from '../index';
import { MemoryGraph } from 'mathison-memory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Phase 4-B: Memory Write API Conformance', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-memory-write-test-'));
    process.env.MATHISON_STORE_BACKEND = 'FILE';
    process.env.MATHISON_STORE_PATH = tempDir;
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    process.env = { ...originalEnv };
  });

  describe('P4-B: Write Memory Routes via ActionGate', () => {
    let server: MathisonServer;

    beforeEach(async () => {
      server = new MathisonServer({ port: 0 });
      await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    // Test 1: POST /memory/nodes creates node and returns 201
    it('POST /memory/nodes creates node and returns 201', async () => {
      const app = server.getApp();
      const response = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: {
          id: 'test-node-1',
          type: 'test',
          data: { name: 'Test Node' },
          idempotency_key: 'test-key-1'
        }
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.node).toBeDefined();
      expect(body.node.id).toBe('test-node-1');
      expect(body.node.type).toBe('test');
      expect(body.created).toBe(true);
      expect(body.receipt).toBeDefined();
      expect(body.receipt.action).toBe('MEMORY_NODE_CREATE');
      expect(body.receipt.decision).toBe('ALLOW');
      expect(body.receipt.store_backend).toBe('FILE');
      expect(body.receipt.policy_id).toBe('default');
    });

    // Test 2: Repeat same request is idempotent
    it('Repeat POST /memory/nodes with same idempotency_key is idempotent', async () => {
      const app = server.getApp();
      const requestBody = {
        id: 'test-node-2',
        type: 'test',
        data: { name: 'Idempotent Test' },
        idempotency_key: 'idempotent-key-1'
      };

      const response1 = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: requestBody
      });

      expect(response1.statusCode).toBe(201);
      const body1 = JSON.parse(response1.body);
      expect(body1.created).toBe(true);

      const response2 = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: requestBody
      });

      expect(response2.statusCode).toBe(201);
      const body2 = JSON.parse(response2.body);
      expect(body2.node.id).toBe(body1.node.id);
      expect(body2.receipt).toBeDefined();

      const memoryGraph = (server as any).memoryGraph as MemoryGraph;
      const node = memoryGraph.getNode('test-node-2');
      expect(node).toBeDefined();
      expect(node!.data).toEqual({ name: 'Idempotent Test' });
    });

    // Test 3: POST /memory/edges creates edge
    it('POST /memory/edges creates edge and is idempotent', async () => {
      const app = server.getApp();
      
      await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: { id: 'node-a', type: 'test', data: {}, idempotency_key: 'node-a-key' }
      });

      await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: { id: 'node-b', type: 'test', data: {}, idempotency_key: 'node-b-key' }
      });

      const edgeRequest = {
        from: 'node-a',
        to: 'node-b',
        type: 'connects',
        idempotency_key: 'edge-key-1'
      };

      const response1 = await app.inject({
        method: 'POST',
        url: '/memory/edges',
        payload: edgeRequest
      });

      expect(response1.statusCode).toBe(201);
      const body1 = JSON.parse(response1.body);
      expect(body1.edge).toBeDefined();
      expect(body1.edge.source).toBe('node-a');
      expect(body1.edge.target).toBe('node-b');
      expect(body1.created).toBe(true);
      expect(body1.receipt.action).toBe('MEMORY_EDGE_CREATE');

      const response2 = await app.inject({
        method: 'POST',
        url: '/memory/edges',
        payload: edgeRequest
      });

      expect(response2.statusCode).toBe(201);
      const body2 = JSON.parse(response2.body);
      expect(body2.edge.id).toBe(body1.edge.id);
    });

    // Test 4: Missing idempotency_key returns 400
    it('POST /memory/nodes without idempotency_key returns 400', async () => {
      const app = server.getApp();
      const response = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: { id: 'test-node-3', type: 'test', data: {} }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('MALFORMED_REQUEST');
      expect(body.message).toContain('idempotency_key');
    });

    // Test 5: Invalid body returns 400
    it('POST /memory/nodes with invalid body returns 400', async () => {
      const app = server.getApp();
      const response = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: { id: 'test-node-4', data: {}, idempotency_key: 'test-key-4' }
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('MALFORMED_REQUEST');
      expect(body.message).toContain('type');
    });

    // Test 6: Edge creation fails if source node not found
    it('POST /memory/edges returns 404 if source node not found', async () => {
      const app = server.getApp();
      const response = await app.inject({
        method: 'POST',
        url: '/memory/edges',
        payload: {
          from: 'nonexistent-node',
          to: 'another-nonexistent',
          type: 'connects',
          idempotency_key: 'edge-key-2'
        }
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('ROUTE_NOT_FOUND');
      expect(body.message).toContain('Source node not found');
    });

    // Test 7: Verify receipts are created
    it('All write operations create receipts via ActionGate', async () => {
      const app = server.getApp();
      const nodeResponse = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: {
          id: 'receipt-test-node',
          type: 'test',
          data: {},
          idempotency_key: 'receipt-test-key'
        }
      });

      const nodeBody = JSON.parse(nodeResponse.body);
      expect(nodeBody.receipt).toBeDefined();
      expect(nodeBody.receipt.job_id).toBe('memory');
      expect(nodeBody.receipt.stage).toBe('memory_write');
      expect(nodeBody.receipt.action).toBe('MEMORY_NODE_CREATE');
      expect(nodeBody.receipt.decision).toBe('ALLOW');
      expect(nodeBody.receipt.policy_id).toBe('default');
      expect(nodeBody.receipt.store_backend).toBe('FILE');
      expect(nodeBody.receipt.timestamp).toBeDefined();
    });

    // Test 8: Node conflict returns 409
    it('POST /memory/nodes with existing ID but different payload returns 409', async () => {
      const app = server.getApp();
      
      await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: {
          id: 'conflict-node',
          type: 'test',
          data: { value: 1 },
          idempotency_key: 'conflict-key-1'
        }
      });

      const response = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: {
          id: 'conflict-node',
          type: 'test',
          data: { value: 2 },
          idempotency_key: 'conflict-key-2'
        }
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('MALFORMED_REQUEST');
      expect(body.message).toContain('already exists with different payload');
    });

    // Test 9: Structural enforcement
    it('Memory mutations cannot bypass ActionGate (structural test)', async () => {
      const app = server.getApp();
      const response = await app.inject({
        method: 'POST',
        url: '/memory/nodes',
        payload: {
          id: 'structural-test-node',
          type: 'test',
          data: {},
          idempotency_key: 'structural-test-key'
        }
      });

      const body = JSON.parse(response.body);
      expect(body.receipt).toBeDefined();
      expect(body.receipt.action).toBe('MEMORY_NODE_CREATE');

      const memoryGraph = (server as any).memoryGraph as MemoryGraph;
      const node = memoryGraph.getNode('structural-test-node');
      expect(node).toBeDefined();
    });
  });
});
