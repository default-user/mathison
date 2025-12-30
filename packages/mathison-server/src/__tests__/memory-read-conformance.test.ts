/**
 * P4-C: Memory Read API Conformance Tests
 * Tests for bounded queries, pagination, and deterministic ordering
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MathisonServer } from '../index';

describe('Phase 4-C: Memory Read API Conformance', () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-read-conformance-'));
    process.env.MATHISON_STORE_BACKEND = 'FILE';
    process.env.MATHISON_STORE_PATH = tempDir;
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    process.env = { ...originalEnv };
  });

  describe('P4-C: Bounded Queries + Pagination', () => {
    let server: MathisonServer;

    beforeEach(async () => {
      server = new MathisonServer({ port: 0 });
      await server.start();

      // Create a graph with known structure for testing
      const app = server.getApp();

      // Create nodes: A -> B -> C -> D -> E (chain of 5 nodes)
      const nodes = ['node-A', 'node-B', 'node-C', 'node-D', 'node-E'];
      for (const nodeId of nodes) {
        await app.inject({
          method: 'POST',
          url: '/memory/nodes',
          payload: {
            id: nodeId,
            type: 'test',
            data: { name: nodeId },
            idempotency_key: `create-${nodeId}`
          }
        });
      }

      // Create edges: A->B, B->C, C->D, D->E
      const edges = [
        { id: 'edge-AB', from: 'node-A', to: 'node-B', type: 'link' },
        { id: 'edge-BC', from: 'node-B', to: 'node-C', type: 'link' },
        { id: 'edge-CD', from: 'node-C', to: 'node-D', type: 'link' },
        { id: 'edge-DE', from: 'node-D', to: 'node-E', type: 'link' }
      ];

      for (const edge of edges) {
        const edgeResponse = await app.inject({
          method: 'POST',
          url: '/memory/edges',
          payload: {
            ...edge,
            idempotency_key: `create-${edge.id}`
          }
        });
        // Ensure edge creation succeeded (201 = created, 200 = idempotent)
        expect([200, 201]).toContain(edgeResponse.statusCode);
      }
    });

    afterEach(async () => {
      await server.stop();
    });

    it('traversal respects depth bounds (max 3)', async () => {
      const app = server.getApp();

      // Traverse from A with depth=1 (should get A, B)
      const depth1 = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&depth=1&direction=out'
      });
      expect(depth1.statusCode).toBe(200);
      const body1 = JSON.parse(depth1.body);
      expect(body1.depth).toBe(1);
      expect(body1.total_nodes).toBe(2); // A and B
      const nodeIds1 = body1.nodes.map((n: any) => n.id).sort();
      expect(nodeIds1).toEqual(['node-A', 'node-B']);

      // Traverse from A with depth=2 (should get A, B, C)
      const depth2 = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&depth=2&direction=out'
      });
      expect(depth2.statusCode).toBe(200);
      const body2 = JSON.parse(depth2.body);
      expect(body2.depth).toBe(2);
      expect(body2.total_nodes).toBe(3); // A, B, C
      const nodeIds2 = body2.nodes.map((n: any) => n.id).sort();
      expect(nodeIds2).toEqual(['node-A', 'node-B', 'node-C']);

      // Traverse from A with depth=3 (should get A, B, C, D)
      const depth3 = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&depth=3&direction=out'
      });
      expect(depth3.statusCode).toBe(200);
      const body3 = JSON.parse(depth3.body);
      expect(body3.depth).toBe(3);
      expect(body3.total_nodes).toBe(4); // A, B, C, D
      const nodeIds3 = body3.nodes.map((n: any) => n.id).sort();
      expect(nodeIds3).toEqual(['node-A', 'node-B', 'node-C', 'node-D']);

      // Depth > 3 should be rejected
      const depth4 = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&depth=4&direction=out'
      });
      expect(depth4.statusCode).toBe(400);
      const errorBody = JSON.parse(depth4.body);
      expect(errorBody.reason_code).toBe('MALFORMED_REQUEST');
      expect(errorBody.message).toContain('depth');
    });

    it('traversal respects limit bounds (1-200)', async () => {
      const app = server.getApp();

      // Valid limit
      const valid = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&limit=2&direction=out'
      });
      expect(valid.statusCode).toBe(200);
      const body = JSON.parse(valid.body);
      expect(body.limit).toBe(2);
      expect(body.node_count).toBeLessThanOrEqual(2);

      // Limit < 1 should be rejected
      const tooLow = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&limit=0'
      });
      expect(tooLow.statusCode).toBe(400);

      // Limit > 200 should be rejected
      const tooHigh = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&limit=201'
      });
      expect(tooHigh.statusCode).toBe(400);
    });

    it('pagination is stable (cursor yields deterministic pages)', async () => {
      const app = server.getApp();

      // Get first page with limit=2, depth=3 to ensure we have enough nodes for pagination
      const page1 = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&limit=2&depth=3&direction=out'
      });
      expect(page1.statusCode).toBe(200);
      const body1 = JSON.parse(page1.body);
      expect(body1.node_count).toBe(2);
      expect(body1.next_cursor).toBeDefined();

      // Get second page using cursor
      const page2 = await app.inject({
        method: 'GET',
        url: `/memory/traverse?start=node-A&limit=2&depth=3&direction=out&cursor=${body1.next_cursor}`
      });
      expect(page2.statusCode).toBe(200);
      const body2 = JSON.parse(page2.body);
      expect(body2.node_count).toBeGreaterThan(0);

      // Nodes should not overlap between pages
      const page1Ids = new Set(body1.nodes.map((n: any) => n.id));
      const page2Ids = new Set(body2.nodes.map((n: any) => n.id));
      const intersection = [...page1Ids].filter(id => page2Ids.has(id));
      expect(intersection.length).toBe(0);

      // Repeat request should get same first page (deterministic)
      const page1Repeat = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&limit=2&depth=3&direction=out'
      });
      const body1Repeat = JSON.parse(page1Repeat.body);
      expect(body1Repeat.nodes).toEqual(body1.nodes);
    });

    it('ordering is stable across repeated calls', async () => {
      const app = server.getApp();

      // Call search multiple times
      const results = [];
      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/memory/search?q=node'
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        results.push(body.results.map((n: any) => n.id));
      }

      // All calls should return same order
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    });

    it('invalid params return 400 MALFORMED_REQUEST', async () => {
      const app = server.getApp();

      // Invalid depth (non-numeric)
      const badDepth = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&depth=abc'
      });
      expect(badDepth.statusCode).toBe(400);
      const body1 = JSON.parse(badDepth.body);
      expect(body1.reason_code).toBe('MALFORMED_REQUEST');

      // Invalid limit (non-numeric)
      const badLimit = await app.inject({
        method: 'GET',
        url: '/memory/search?q=test&limit=xyz'
      });
      expect(badLimit.statusCode).toBe(400);
      const body2 = JSON.parse(badLimit.body);
      expect(body2.reason_code).toBe('MALFORMED_REQUEST');

      // Invalid cursor
      const badCursor = await app.inject({
        method: 'GET',
        url: '/memory/search?q=test&cursor=invalid-cursor'
      });
      expect(badCursor.statusCode).toBe(400);
      const body3 = JSON.parse(badCursor.body);
      expect(body3.reason_code).toBe('MALFORMED_REQUEST');

      // Missing start parameter for traversal
      const noStart = await app.inject({
        method: 'GET',
        url: '/memory/traverse?depth=1'
      });
      expect(noStart.statusCode).toBe(400);
      const body4 = JSON.parse(noStart.body);
      expect(body4.reason_code).toBe('MALFORMED_REQUEST');
    });

    it('missing start node returns 404 ROUTE_NOT_FOUND', async () => {
      const app = server.getApp();

      const response = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=non-existent-node'
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.reason_code).toBe('ROUTE_NOT_FOUND');
      expect(body.message).toContain('not found');
    });

    it('query length bounds enforced (1-256 chars)', async () => {
      const app = server.getApp();

      // Empty query (after trim) should be rejected
      const empty = await app.inject({
        method: 'GET',
        url: '/memory/search?q='
      });
      expect(empty.statusCode).toBe(400);
      const body1 = JSON.parse(empty.body);
      expect(body1.reason_code).toBe('MALFORMED_REQUEST');

      // Query too long (> 256 chars) should be rejected
      const longQuery = 'a'.repeat(257);
      const tooLong = await app.inject({
        method: 'GET',
        url: `/memory/search?q=${longQuery}`
      });
      expect(tooLong.statusCode).toBe(400);
      const body2 = JSON.parse(tooLong.body);
      expect(body2.reason_code).toBe('MALFORMED_REQUEST');
      expect(body2.message).toContain('too long');

      // Valid query (exactly 256 chars) should work
      const maxQuery = 'a'.repeat(256);
      const maxValid = await app.inject({
        method: 'GET',
        url: `/memory/search?q=${maxQuery}`
      });
      expect(maxValid.statusCode).toBe(200);
    });

    it('direction filtering works correctly', async () => {
      const app = server.getApp();

      // 'out' direction from B should only get edge to C
      const outResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-B/edges?direction=out'
      });
      expect(outResponse.statusCode).toBe(200);
      const outBody = JSON.parse(outResponse.body);
      expect(outBody.direction).toBe('out');
      const outEdges = outBody.edges;
      expect(outEdges.length).toBe(1);
      expect(outEdges[0].id).toBe('edge-BC');

      // 'in' direction from B should only get edge from A
      const inResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-B/edges?direction=in'
      });
      expect(inResponse.statusCode).toBe(200);
      const inBody = JSON.parse(inResponse.body);
      expect(inBody.direction).toBe('in');
      const inEdges = inBody.edges;
      expect(inEdges.length).toBe(1);
      expect(inEdges[0].id).toBe('edge-AB');

      // 'both' direction from B should get edges from A and to C
      const bothResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-B/edges?direction=both'
      });
      expect(bothResponse.statusCode).toBe(200);
      const bothBody = JSON.parse(bothResponse.body);
      expect(bothBody.direction).toBe('both');
      const bothEdges = bothBody.edges;
      expect(bothEdges.length).toBe(2);
      const edgeIds = bothEdges.map((e: any) => e.id).sort();
      expect(edgeIds).toEqual(['edge-AB', 'edge-BC']);
    });

    it('type filtering works correctly', async () => {
      const app = server.getApp();

      // Create edge with different type
      await app.inject({
        method: 'POST',
        url: '/memory/edges',
        payload: {
          id: 'edge-special',
          from: 'node-A',
          to: 'node-C',
          type: 'special',
          idempotency_key: 'create-edge-special'
        }
      });

      // Filter for 'link' type only
      const linkResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-A/edges?types=link'
      });
      expect(linkResponse.statusCode).toBe(200);
      const linkBody = JSON.parse(linkResponse.body);
      const linkEdges = linkBody.edges;
      expect(linkEdges.every((e: any) => e.type === 'link')).toBe(true);

      // Filter for 'special' type only
      const specialResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-A/edges?types=special'
      });
      expect(specialResponse.statusCode).toBe(200);
      const specialBody = JSON.parse(specialResponse.body);
      const specialEdges = specialBody.edges;
      expect(specialEdges.length).toBe(1);
      expect(specialEdges[0].type).toBe('special');

      // Filter for multiple types (comma-separated)
      const multiResponse = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-A/edges?types=link,special'
      });
      expect(multiResponse.statusCode).toBe(200);
      const multiBody = JSON.parse(multiResponse.body);
      expect(multiBody.edges.length).toBe(2);
    });

    it('no unbounded queries permitted', async () => {
      const app = server.getApp();

      // All read endpoints must enforce limits
      // Search with default limit (50)
      const search = await app.inject({
        method: 'GET',
        url: '/memory/search?q=node'
      });
      expect(search.statusCode).toBe(200);
      const searchBody = JSON.parse(search.body);
      expect(searchBody.limit).toBe(50); // Default limit enforced
      expect(searchBody.count).toBeLessThanOrEqual(50);

      // Edges with default limit (50)
      const edges = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-B/edges'
      });
      expect(edges.statusCode).toBe(200);
      const edgesBody = JSON.parse(edges.body);
      expect(edgesBody.limit).toBe(50); // Default limit enforced

      // Traversal with default limit (50)
      const traverse = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A'
      });
      expect(traverse.statusCode).toBe(200);
      const traverseBody = JSON.parse(traverse.body);
      expect(traverseBody.limit).toBe(50); // Default limit enforced
    });

    it('deterministic ordering by ID across all endpoints', async () => {
      const app = server.getApp();

      // Add more nodes to test sorting
      const nodeIds = ['node-Z', 'node-M', 'node-F'];
      for (const nodeId of nodeIds) {
        await app.inject({
          method: 'POST',
          url: '/memory/nodes',
          payload: {
            id: nodeId,
            type: 'test',
            data: { name: nodeId },
            idempotency_key: `create-${nodeId}`
          }
        });
      }

      // Search results should be sorted by ID
      const search = await app.inject({
        method: 'GET',
        url: '/memory/search?q=node'
      });
      const searchBody = JSON.parse(search.body);
      const searchIds = searchBody.results.map((n: any) => n.id);
      const sortedSearchIds = [...searchIds].sort();
      expect(searchIds).toEqual(sortedSearchIds);

      // Traversal results should be sorted by ID
      const traverse = await app.inject({
        method: 'GET',
        url: '/memory/traverse?start=node-A&depth=3'
      });
      const traverseBody = JSON.parse(traverse.body);
      const traverseNodeIds = traverseBody.nodes.map((n: any) => n.id);
      const sortedTraverseIds = [...traverseNodeIds].sort();
      expect(traverseNodeIds).toEqual(sortedTraverseIds);

      // Edge results should be sorted by ID
      const edges = await app.inject({
        method: 'GET',
        url: '/memory/nodes/node-A/edges'
      });
      const edgesBody = JSON.parse(edges.body);
      const edgeIds = edgesBody.edges.map((e: any) => e.id);
      const sortedEdgeIds = [...edgeIds].sort();
      expect(edgeIds).toEqual(sortedEdgeIds);
    });
  });
});
