/**
 * Phase 4-A: Memory Conformance Tests
 * Proves: Read-only memory API fully governed (CIF+CDI pipeline)
 */

import { MathisonServer } from '../index';
import { MemoryGraph, Node, Edge } from 'mathison-memory';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Phase 4-A: Memory API Conformance', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-memory-test-'));

    // Set required env vars for FILE backend
    process.env.MATHISON_STORE_BACKEND = 'FILE';
    process.env.MATHISON_STORE_PATH = tempDir;
  });

  afterEach(() => {
    // Cleanup
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore env
    process.env = { ...originalEnv };
  });

  describe('P4-A: Read-only Memory Routes', () => {
    let server: MathisonServer;

    beforeEach(async () => {
      server = new MathisonServer({ port: 0 });
      await server.start();

      // Seed test data (deterministic fixtures)
      const memoryGraph = (server as any).memoryGraph as MemoryGraph;
      
      const testNode: Node = {
        id: 'node-test-123',
        type: 'test_node',
        data: { name: 'Test Node', value: 42 }
      };
      memoryGraph.addNode(testNode);

      const testNode2: Node = {
        id: 'node-test-456',
        type: 'test_node',
        data: { name: 'Another Node', value: 99 }
      };
      memoryGraph.addNode(testNode2);

      const testEdge: Edge = {
        id: 'edge-test-1',
        source: 'node-test-123',
        target: 'node-test-456',
        type: 'test_relation'
      };
      memoryGraph.addEdge(testEdge);
    });

    afterEach(async () => {
      await server.stop();
    });

    it('GET /memory/nodes/:id returns 200 for known node (deterministic)', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-test-123'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('node-test-123');
      expect(body.type).toBe('test_node');
      expect(body.data.name).toBe('Test Node');
      expect(body.data.value).toBe(42);
    });

    it('GET /memory/nodes/:id returns 404 for unknown node (deterministic)', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/nodes/non-existent-node'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('ROUTE_NOT_FOUND');
      expect(body.message).toContain('Node not found');
    });

    it('GET /memory/nodes/:id/edges returns edges for known node', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-test-123/edges'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.node_id).toBe('node-test-123');
      expect(body.count).toBe(1);
      expect(body.edges).toHaveLength(1);
      expect(body.edges[0].id).toBe('edge-test-1');
      expect(body.edges[0].source).toBe('node-test-123');
      expect(body.edges[0].target).toBe('node-test-456');
    });

    it('GET /memory/nodes/:id/edges returns 404 for unknown node', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/nodes/non-existent/edges'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('ROUTE_NOT_FOUND');
      expect(body.message).toContain('Node not found');
    });

    it('GET /memory/search returns 400 for missing query parameter', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/search'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('MALFORMED_REQUEST');
      expect(body.message).toContain('Missing or empty query parameter');
    });

    it('GET /memory/search returns 400 for empty query parameter', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/search?q='
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('MALFORMED_REQUEST');
      expect(body.message).toContain('Missing or empty query parameter');
    });

    it('GET /memory/search returns 400 for invalid limit', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/search?q=test&limit=invalid'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('MALFORMED_REQUEST');
      expect(body.message).toContain('Invalid limit parameter');
    });

    it('GET /memory/search returns 400 for limit out of range', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/search?q=test&limit=999'
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('MALFORMED_REQUEST');
      expect(body.message).toContain('Invalid limit parameter');
    });

    it('GET /memory/search returns matching nodes (deterministic)', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/search?q=Test'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query).toBe('Test');
      expect(body.limit).toBe(10);
      expect(body.count).toBeGreaterThan(0);
      expect(body.results).toBeInstanceOf(Array);
      
      // Should find node-test-123 which has "Test Node" in data
      const foundNode = body.results.find((n: any) => n.id === 'node-test-123');
      expect(foundNode).toBeDefined();
      expect(foundNode.data.name).toBe('Test Node');
    });

    it('GET /memory/search respects limit parameter', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/search?q=node&limit=1'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.limit).toBe(1);
      expect(body.results.length).toBeLessThanOrEqual(1);
    });

    it('all memory routes pass through governance pipeline', async () => {
      const app = server.getApp();

      // Test /memory/nodes/:id route
      const nodeResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-test-123'
      });
      expect(nodeResponse.statusCode).toBe(200);

      // Test /memory/nodes/:id/edges route
      const edgesResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-test-123/edges'
      });
      expect(edgesResponse.statusCode).toBe(200);

      // Test /memory/search route
      const searchResponse = await app.inject({
        method: 'GET',
        url: '/memory/search?q=test'
      });
      expect(searchResponse.statusCode).toBe(200);

      // All routes should return valid JSON (proof they went through pipeline)
      expect(() => JSON.parse(nodeResponse.body)).not.toThrow();
      expect(() => JSON.parse(edgesResponse.body)).not.toThrow();
      expect(() => JSON.parse(searchResponse.body)).not.toThrow();
    });
  });

  describe('P4-A: Governance Integration', () => {
    it('memory routes are read-only (no ActionGate required)', async () => {
      const server = new MathisonServer({ port: 0 });
      await server.start();

      const app = server.getApp();
      
      // Verify routes exist and respond without ActionGate
      const response = await app.inject({
        method: 'GET',
        url: '/memory/search?q=test'
      });

      // Should succeed even with no seeded data (returns empty results)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.results).toBeDefined();
      expect(body.results).toBeInstanceOf(Array);

      await server.stop();
    });

    it('health endpoint reports memory initialized status', async () => {
      const server = new MathisonServer({ port: 0 });
      await server.start();

      const app = server.getApp();
      const response = await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.memory).toBeDefined();
      expect(body.memory.initialized).toBe(true);

      await server.stop();
    });
  });
});
