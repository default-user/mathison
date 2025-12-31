/**
 * Hypergraph Math Tests
 * Tests for corrected hypergraph analytics: densities, betweenness, components
 */

import MemoryGraph from '../index';

describe('Hypergraph Math', () => {
  describe('Density formulas', () => {
    test('incidence density = 1 for complete single hyperedge', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b', 'c'], type: 'test' });

      // D_inc = (sum of sizes) / (n * m) = 3 / (3 * 1) = 1
      const incidenceDensity = graph.getHypergraphIncidenceDensity();
      expect(incidenceDensity).toBe(1);
    });

    test('projection density = 1 for complete single hyperedge', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b', 'c'], type: 'test' });

      // D_proj = actualPairs / (n choose 2) = 3 / 3 = 1
      // pairs: (a,b), (a,c), (b,c)
      const projectionDensity = graph.getHypergraphProjectionDensity();
      expect(projectionDensity).toBe(1);
    });

    test('incidence density with multiple hyperedges', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'test' });

      // D_inc = (2 + 2) / (3 * 2) = 4/6 = 0.666...
      const incidenceDensity = graph.getHypergraphIncidenceDensity();
      expect(incidenceDensity).toBeCloseTo(2/3, 5);
    });

    test('projection density with overlapping hyperedges', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'd', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'test' });

      // pairs: (a,b), (b,c) = 2 unique pairs
      // max pairs: (4 choose 2) = 6
      // D_proj = 2/6 = 1/3
      const projectionDensity = graph.getHypergraphProjectionDensity();
      expect(projectionDensity).toBeCloseTo(1/3, 5);
    });

    test('density returns 0 for empty graph', () => {
      const graph = new MemoryGraph();

      expect(graph.getHypergraphIncidenceDensity()).toBe(0);
      expect(graph.getHypergraphProjectionDensity()).toBe(0);
      expect(graph.getHypergraphDensity()).toBe(0);
    });

    test('density with type filtering', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'typeA' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'typeB' });

      // Filter to only typeA: only h1 with 2 nodes
      const incDensityA = graph.getHypergraphIncidenceDensity({ hyperedgeTypes: ['typeA'] });
      expect(incDensityA).toBeCloseTo(2/3, 5); // 2 / (3 * 1)

      const projDensityA = graph.getHypergraphProjectionDensity({ hyperedgeTypes: ['typeA'] });
      expect(projDensityA).toBeCloseTo(1/3, 5); // 1 pair / 3 max pairs
    });
  });

  describe('Connected components', () => {
    test('finds single component excluding singletons', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'd', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b', 'c'], type: 'test' });

      const components = graph.findHypergraphConnectedComponents();

      expect(components).toHaveLength(1);
      expect(components[0]).toHaveLength(3);
      expect(new Set(components[0])).toEqual(new Set(['a', 'b', 'c']));
    });

    test('includes singletons when requested', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'd', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b', 'c'], type: 'test' });

      const components = graph.findHypergraphConnectedComponents({ includeSingletons: true });

      expect(components).toHaveLength(2);

      // Sort by length descending
      expect(components[0]).toHaveLength(3);
      expect(components[1]).toHaveLength(1);

      expect(new Set(components[0])).toEqual(new Set(['a', 'b', 'c']));
      expect(components[1]).toEqual(['d']);
    });

    test('finds multiple components', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'd', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['c', 'd'], type: 'test' });

      const components = graph.findHypergraphConnectedComponents();

      expect(components).toHaveLength(2);

      const comp1 = new Set(components[0]);
      const comp2 = new Set(components[1]);

      // Both components have size 2
      expect(components[0]).toHaveLength(2);
      expect(components[1]).toHaveLength(2);

      // Check they contain the right nodes
      const allNodes = new Set([...comp1, ...comp2]);
      expect(allNodes).toEqual(new Set(['a', 'b', 'c', 'd']));
    });

    test('deprecated findStronglyConnectedComponents works', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'd', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b', 'c'], type: 'test' });

      const components = graph.findStronglyConnectedComponents();

      expect(components).toHaveLength(1);
      expect(components[0]).toHaveLength(3);
    });
  });

  describe('Betweenness centrality', () => {
    test('endpoints have zero betweenness in line graph', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'd', type: 'test', data: {} });

      // Line: a -- b -- c -- d
      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'test' });
      graph.addHyperedge({ id: 'h3', nodes: ['c', 'd'], type: 'test' });

      const centrality = graph.getHypergraphBetweennessCentralityExact();

      // Endpoints should have zero betweenness
      expect(centrality.get('a')).toBe(0);
      expect(centrality.get('d')).toBe(0);

      // Middle nodes should have positive betweenness
      expect(centrality.get('b')!).toBeGreaterThan(0);
      expect(centrality.get('c')!).toBeGreaterThan(0);
    });

    test('symmetric betweenness in symmetric line graph', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'd', type: 'test', data: {} });

      // Line: a -- b -- c -- d
      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'test' });
      graph.addHyperedge({ id: 'h3', nodes: ['c', 'd'], type: 'test' });

      const centrality = graph.getHypergraphBetweennessCentralityExact();

      // b and c should have similar betweenness (symmetric)
      const bCentrality = centrality.get('b')!;
      const cCentrality = centrality.get('c')!;

      expect(Math.abs(bCentrality - cCentrality)).toBeLessThan(0.01);
    });

    test('star graph center has high betweenness', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'center', type: 'test', data: {} });
      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      // Star: all nodes connect to center
      graph.addHyperedge({ id: 'h1', nodes: ['center', 'a'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['center', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h3', nodes: ['center', 'c'], type: 'test' });

      const centrality = graph.getHypergraphBetweennessCentralityExact();

      // Center should have highest betweenness
      const centerCentrality = centrality.get('center')!;
      const aCentrality = centrality.get('a')!;
      const bCentrality = centrality.get('b')!;
      const cCentrality = centrality.get('c')!;

      expect(centerCentrality).toBeGreaterThan(aCentrality);
      expect(centerCentrality).toBeGreaterThan(bCentrality);
      expect(centerCentrality).toBeGreaterThan(cCentrality);
    });

    test('deprecated getHypergraphBetweennessCentrality wrapper works', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'test' });

      // Old API should still work
      const betweenness = graph.getHypergraphBetweennessCentrality('b');

      expect(typeof betweenness).toBe('number');
      expect(betweenness).toBeGreaterThanOrEqual(0);
    });

    test('isolated node has zero betweenness', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });
      graph.addNode({ id: 'isolated', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'test' });

      const centrality = graph.getHypergraphBetweennessCentralityExact();

      expect(centrality.get('isolated')).toBe(0);
    });

    test('betweenness with type filtering', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'typeA' });
      graph.addHyperedge({ id: 'h2', nodes: ['b', 'c'], type: 'typeA' });
      graph.addHyperedge({ id: 'h3', nodes: ['a', 'c'], type: 'typeB' });

      // With only typeA, b should have high centrality
      const centralityA = graph.getHypergraphBetweennessCentralityExact({
        hyperedgeTypes: ['typeA']
      });

      expect(centralityA.get('b')!).toBeGreaterThan(0);
      expect(centralityA.get('a')).toBe(0);
      expect(centralityA.get('c')).toBe(0);
    });
  });

  describe('Incidence index performance', () => {
    test('getNodeHyperedges uses index efficiently', () => {
      const graph = new MemoryGraph();

      // Create many nodes and hyperedges
      for (let i = 0; i < 100; i++) {
        graph.addNode({ id: `node${i}`, type: 'test', data: {} });
      }

      for (let i = 0; i < 50; i++) {
        const nodes = [`node${i}`, `node${i + 1}`, `node${i + 2}`];
        graph.addHyperedge({ id: `h${i}`, nodes, type: 'test' });
      }

      // This should be fast (O(incidence) not O(|E|))
      const start = Date.now();
      const hyperedges = graph.getNodeHyperedges('node5');
      const duration = Date.now() - start;

      expect(hyperedges.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should be nearly instant
    });

    test('index updates when hyperedge is modified', () => {
      const graph = new MemoryGraph();

      graph.addNode({ id: 'a', type: 'test', data: {} });
      graph.addNode({ id: 'b', type: 'test', data: {} });
      graph.addNode({ id: 'c', type: 'test', data: {} });

      graph.addHyperedge({ id: 'h1', nodes: ['a', 'b'], type: 'test' });

      let hyperedges = graph.getNodeHyperedges('a');
      expect(hyperedges).toHaveLength(1);
      expect(hyperedges[0].id).toBe('h1');

      // Update hyperedge to use different nodes
      graph.addHyperedge({ id: 'h1', nodes: ['b', 'c'], type: 'test' });

      hyperedges = graph.getNodeHyperedges('a');
      expect(hyperedges).toHaveLength(0);

      hyperedges = graph.getNodeHyperedges('c');
      expect(hyperedges).toHaveLength(1);
      expect(hyperedges[0].id).toBe('h1');
    });
  });
});
