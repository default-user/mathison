/**
 * Mathison Memory - Graph/Hypergraph Memory System
 */

export interface Node {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface Hyperedge {
  id: string;
  nodes: string[];
  type: string;
  metadata?: Record<string, unknown>;
}

// GraphStore interface (matches mathison-storage)
export interface GraphStore {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  writeNode(node: any): Promise<void>;
  readNode(id: string): Promise<any | null>;
  readAllNodes(): Promise<any[]>;
  writeEdge(edge: any): Promise<void>;
  readEdge(id: string): Promise<any | null>;
  readAllEdges(): Promise<any[]>;
  readEdgesByNode(nodeId: string): Promise<any[]>;
  writeHyperedge(hyperedge: any): Promise<void>;
  readHyperedge(id: string): Promise<any | null>;
  readAllHyperedges(): Promise<any[]>;
}

export class MemoryGraph {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private hyperedges: Map<string, Hyperedge> = new Map();
  private graphStore?: GraphStore;

  constructor(graphStore?: GraphStore) {
    this.graphStore = graphStore;
  }

  async initialize(): Promise<void> {
    console.log('🧠 Initializing Memory Graph...');

    if (this.graphStore) {
      await this.graphStore.initialize();

      // Load all nodes from persistent storage
      const persistedNodes = await this.graphStore.readAllNodes();
      for (const node of persistedNodes) {
        this.nodes.set(node.id, node);
      }

      // Load all edges from persistent storage
      const persistedEdges = await this.graphStore.readAllEdges();
      for (const edge of persistedEdges) {
        this.edges.set(edge.id, edge);
      }

      // Load all hyperedges from persistent storage
      const persistedHyperedges = await this.graphStore.readAllHyperedges();
      for (const hyperedge of persistedHyperedges) {
        this.hyperedges.set(hyperedge.id, hyperedge);
      }

      console.log(`🧠 Loaded ${this.nodes.size} nodes, ${this.edges.size} edges, ${this.hyperedges.size} hyperedges from storage`);
    }
  }

  async shutdown(): Promise<void> {
    console.log('🧠 Shutting down Memory Graph...');
    if (this.graphStore) {
      await this.graphStore.shutdown();
    }
  }

  addNode(node: Node): void {
    this.nodes.set(node.id, node);
    // Persist to storage if available
    if (this.graphStore) {
      this.graphStore.writeNode(node).catch((err) => {
        console.error(`Failed to persist node ${node.id}:`, err);
      });
    }
  }

  addEdge(edge: Edge): void {
    this.edges.set(edge.id, edge);
    // Persist to storage if available
    if (this.graphStore) {
      this.graphStore.writeEdge(edge).catch((err) => {
        console.error(`Failed to persist edge ${edge.id}:`, err);
      });
    }
  }

  addHyperedge(hyperedge: Hyperedge): void {
    this.hyperedges.set(hyperedge.id, hyperedge);
    // Persist to storage if available
    if (this.graphStore) {
      this.graphStore.writeHyperedge(hyperedge).catch((err) => {
        console.error(`Failed to persist hyperedge ${hyperedge.id}:`, err);
      });
    }
  }

  // Read-only query methods (Phase 4-A)
  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  getNodeEdges(nodeId: string): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId || edge.target === nodeId) {
        edges.push(edge);
      }
    }
    return edges;
  }

  search(query: string, limit: number = 10): Node[] {
    const results: Node[] = [];
    const lowerQuery = query.toLowerCase();

    for (const node of this.nodes.values()) {
      if (results.length >= limit) break;

      // Search in node type, id, and stringified data
      const searchableText = [
        node.id,
        node.type,
        JSON.stringify(node.data)
      ].join(' ').toLowerCase();

      if (searchableText.includes(lowerQuery)) {
        results.push(node);
      }
    }

    return results;
  }

  /**
   * Graph Traversal: Breadth-First Search
   * Returns nodes in BFS order starting from startNodeId
   */
  bfs(startNodeId: string, maxDepth: number = Infinity): Node[] {
    const startNode = this.nodes.get(startNodeId);
    if (!startNode) return [];

    const visited = new Set<string>();
    const queue: Array<{ node: Node; depth: number }> = [{ node: startNode, depth: 0 }];
    const result: Node[] = [];

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;

      if (visited.has(node.id) || depth > maxDepth) continue;

      visited.add(node.id);
      result.push(node);

      // Add neighbors to queue
      const nodeEdges = this.getNodeEdges(node.id);
      for (const edge of nodeEdges) {
        const neighborId = edge.source === node.id ? edge.target : edge.source;
        if (!visited.has(neighborId)) {
          const neighbor = this.nodes.get(neighborId);
          if (neighbor) {
            queue.push({ node: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    return result;
  }

  /**
   * Graph Traversal: Depth-First Search
   * Returns nodes in DFS order starting from startNodeId
   */
  dfs(startNodeId: string, maxDepth: number = Infinity): Node[] {
    const startNode = this.nodes.get(startNodeId);
    if (!startNode) return [];

    const visited = new Set<string>();
    const result: Node[] = [];

    const dfsRecursive = (node: Node, depth: number) => {
      if (visited.has(node.id) || depth > maxDepth) return;

      visited.add(node.id);
      result.push(node);

      const nodeEdges = this.getNodeEdges(node.id);
      for (const edge of nodeEdges) {
        const neighborId = edge.source === node.id ? edge.target : edge.source;
        if (!visited.has(neighborId)) {
          const neighbor = this.nodes.get(neighborId);
          if (neighbor) {
            dfsRecursive(neighbor, depth + 1);
          }
        }
      }
    };

    dfsRecursive(startNode, 0);
    return result;
  }

  /**
   * Find shortest path between two nodes using Dijkstra's algorithm
   * Returns array of node IDs representing the path, or empty array if no path exists
   */
  shortestPath(startId: string, targetId: string): string[] {
    if (!this.nodes.has(startId) || !this.nodes.has(targetId)) return [];
    if (startId === targetId) return [startId];

    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>();

    // Initialize distances
    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, Infinity);
      previous.set(nodeId, null);
      unvisited.add(nodeId);
    }
    distances.set(startId, 0);

    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let currentId: string | null = null;
      let minDist = Infinity;
      for (const nodeId of unvisited) {
        const dist = distances.get(nodeId)!;
        if (dist < minDist) {
          minDist = dist;
          currentId = nodeId;
        }
      }

      if (currentId === null || minDist === Infinity) break;
      if (currentId === targetId) break;

      unvisited.delete(currentId);

      // Update distances to neighbors
      const edges = this.getNodeEdges(currentId);
      for (const edge of edges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        if (!unvisited.has(neighborId)) continue;

        const alt = distances.get(currentId)! + 1; // Assume weight = 1 for all edges
        if (alt < distances.get(neighborId)!) {
          distances.set(neighborId, alt);
          previous.set(neighborId, currentId);
        }
      }
    }

    // Reconstruct path
    if (distances.get(targetId) === Infinity) return [];

    const path: string[] = [];
    let current: string | null = targetId;
    while (current !== null) {
      path.unshift(current);
      current = previous.get(current)!;
    }

    return path;
  }

  /**
   * Query DSL: Filter nodes by type and data properties
   */
  query(options: {
    type?: string;
    data?: Record<string, unknown>;
    limit?: number;
  }): Node[] {
    const { type, data, limit = 100 } = options;
    const results: Node[] = [];

    for (const node of this.nodes.values()) {
      if (results.length >= limit) break;

      // Filter by type
      if (type && node.type !== type) continue;

      // Filter by data properties
      if (data) {
        let matches = true;
        for (const [key, value] of Object.entries(data)) {
          if (node.data[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      results.push(node);
    }

    return results;
  }

  /**
   * Find all paths between two nodes (up to maxPaths and maxLength)
   */
  findPaths(startId: string, targetId: string, maxPaths: number = 10, maxLength: number = 10): string[][] {
    if (!this.nodes.has(startId) || !this.nodes.has(targetId)) return [];
    if (startId === targetId) return [[startId]];

    const paths: string[][] = [];
    const visited = new Set<string>();

    const dfs = (currentId: string, path: string[]) => {
      if (paths.length >= maxPaths || path.length > maxLength) return;

      if (currentId === targetId) {
        paths.push([...path]);
        return;
      }

      visited.add(currentId);
      const edges = this.getNodeEdges(currentId);

      for (const edge of edges) {
        const neighborId = edge.source === currentId ? edge.target : edge.source;
        if (!visited.has(neighborId)) {
          dfs(neighborId, [...path, neighborId]);
        }
      }

      visited.delete(currentId);
    };

    dfs(startId, [startId]);
    return paths;
  }

  /**
   * Export graph to DOT format for visualization
   */
  exportToDot(): string {
    let dot = 'digraph MemoryGraph {\n';
    dot += '  node [shape=box];\n';

    // Add nodes
    for (const node of this.nodes.values()) {
      const label = `${node.type}\\n${node.id}`;
      dot += `  "${node.id}" [label="${label}"];\n`;
    }

    // Add edges
    for (const edge of this.edges.values()) {
      const label = edge.type;
      dot += `  "${edge.source}" -> "${edge.target}" [label="${label}"];\n`;
    }

    // Add hyperedges as clusters
    let clusterIdx = 0;
    for (const hyperedge of this.hyperedges.values()) {
      dot += `  subgraph cluster_${clusterIdx} {\n`;
      dot += `    label="${hyperedge.type} (${hyperedge.id})";\n`;
      dot += `    style=dashed;\n`;
      for (const nodeId of hyperedge.nodes) {
        dot += `    "${nodeId}";\n`;
      }
      dot += '  }\n';
      clusterIdx++;
    }

    dot += '}\n';
    return dot;
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number;
    edgeCount: number;
    hyperedgeCount: number;
    avgDegree: number;
    nodeTypes: Record<string, number>;
  } {
    const nodeTypes: Record<string, number> = {};
    let totalDegree = 0;

    for (const node of this.nodes.values()) {
      nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
      totalDegree += this.getNodeEdges(node.id).length;
    }

    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      hyperedgeCount: this.hyperedges.size,
      avgDegree: this.nodes.size > 0 ? totalDegree / this.nodes.size : 0,
      nodeTypes
    };
  }

  /* ========== Hypergraph Operations ========== */

  // Phase 1: Incidence & Basic Queries

  /**
   * Get all hyperedges containing a specific node
   */
  getNodeHyperedges(nodeId: string, type?: string): Hyperedge[] {
    const result: Hyperedge[] = [];
    for (const hyperedge of this.hyperedges.values()) {
      if (hyperedge.nodes.includes(nodeId)) {
        if (!type || hyperedge.type === type) {
          result.push(hyperedge);
        }
      }
    }
    return result;
  }

  /**
   * Find all nodes that share at least one hyperedge with the given node
   * (Hypergraph neighbors)
   */
  getHypergraphNeighbors(nodeId: string, options?: {
    type?: string;
    minSharedHyperedges?: number;
  }): Map<string, { node: Node; sharedHyperedges: string[] }> {
    const neighbors = new Map<string, { node: Node; sharedHyperedges: string[] }>();
    const minShared = options?.minSharedHyperedges || 1;

    // Find all hyperedges containing this node
    const nodeHyperedges = this.getNodeHyperedges(nodeId, options?.type);

    // For each hyperedge, add all other nodes as neighbors
    for (const hyperedge of nodeHyperedges) {
      for (const otherId of hyperedge.nodes) {
        if (otherId === nodeId) continue;

        if (!neighbors.has(otherId)) {
          const node = this.nodes.get(otherId);
          if (!node) continue;
          neighbors.set(otherId, { node, sharedHyperedges: [] });
        }
        neighbors.get(otherId)!.sharedHyperedges.push(hyperedge.id);
      }
    }

    // Filter by minimum shared hyperedges
    for (const [id, data] of neighbors.entries()) {
      if (data.sharedHyperedges.length < minShared) {
        neighbors.delete(id);
      }
    }

    return neighbors;
  }

  // Phase 2: Pattern Matching

  /**
   * Find hyperedges containing ALL of the specified nodes
   * Use case: "Find projects that involve both Alice and Bob"
   */
  findHyperedgesContainingAll(nodeIds: string[], type?: string): Hyperedge[] {
    const targetSet = new Set(nodeIds);
    const result: Hyperedge[] = [];

    for (const hyperedge of this.hyperedges.values()) {
      if (type && hyperedge.type !== type) continue;

      const hyperedgeSet = new Set(hyperedge.nodes);
      let containsAll = true;

      for (const nodeId of targetSet) {
        if (!hyperedgeSet.has(nodeId)) {
          containsAll = false;
          break;
        }
      }

      if (containsAll) {
        result.push(hyperedge);
      }
    }

    return result;
  }

  /**
   * Find hyperedges containing ANY of the specified nodes
   */
  findHyperedgesContainingAny(nodeIds: string[], type?: string): Hyperedge[] {
    const targetSet = new Set(nodeIds);
    const result: Hyperedge[] = [];

    for (const hyperedge of this.hyperedges.values()) {
      if (type && hyperedge.type !== type) continue;

      for (const nodeId of hyperedge.nodes) {
        if (targetSet.has(nodeId)) {
          result.push(hyperedge);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Find hyperedges by cardinality (number of nodes)
   */
  findHyperedgesBySize(min: number, max: number = Infinity, type?: string): Hyperedge[] {
    const result: Hyperedge[] = [];

    for (const hyperedge of this.hyperedges.values()) {
      if (type && hyperedge.type !== type) continue;

      const size = hyperedge.nodes.length;
      if (size >= min && size <= max) {
        result.push(hyperedge);
      }
    }

    return result;
  }

  // Phase 3: Hypergraph Traversal

  /**
   * Hypergraph BFS: Traverse via hyperedges
   * Expansion rule: From node A, visit ALL nodes in hyperedges containing A
   */
  hypergraphBFS(startNodeId: string, maxDepth: number = Infinity, options?: {
    hyperedgeTypes?: string[];
    edgeTypes?: string[];
  }): Node[] {
    const startNode = this.nodes.get(startNodeId);
    if (!startNode) return [];

    const visited = new Set<string>();
    const queue: Array<{ node: Node; depth: number }> = [{ node: startNode, depth: 0 }];
    const result: Node[] = [];

    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;

      if (visited.has(node.id) || depth > maxDepth) continue;

      visited.add(node.id);
      result.push(node);

      // Expand via hyperedges
      const hyperedges = this.getNodeHyperedges(node.id);
      for (const hyperedge of hyperedges) {
        // Filter by type if specified
        if (options?.hyperedgeTypes && !options.hyperedgeTypes.includes(hyperedge.type)) {
          continue;
        }

        // Add all nodes in this hyperedge
        for (const neighborId of hyperedge.nodes) {
          if (!visited.has(neighborId)) {
            const neighbor = this.nodes.get(neighborId);
            if (neighbor) {
              queue.push({ node: neighbor, depth: depth + 1 });
            }
          }
        }
      }

      // Also expand via regular edges if requested
      if (options?.edgeTypes) {
        const edges = this.getNodeEdges(node.id);
        for (const edge of edges) {
          if (!options.edgeTypes.includes(edge.type)) continue;

          const neighborId = edge.source === node.id ? edge.target : edge.source;
          if (!visited.has(neighborId)) {
            const neighbor = this.nodes.get(neighborId);
            if (neighbor) {
              queue.push({ node: neighbor, depth: depth + 1 });
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Hypergraph DFS: Traverse via hyperedges
   */
  hypergraphDFS(startNodeId: string, maxDepth: number = Infinity, options?: {
    hyperedgeTypes?: string[];
    edgeTypes?: string[];
  }): Node[] {
    const startNode = this.nodes.get(startNodeId);
    if (!startNode) return [];

    const visited = new Set<string>();
    const result: Node[] = [];

    const dfsRecursive = (node: Node, depth: number) => {
      if (visited.has(node.id) || depth > maxDepth) return;

      visited.add(node.id);
      result.push(node);

      // Expand via hyperedges
      const hyperedges = this.getNodeHyperedges(node.id);
      for (const hyperedge of hyperedges) {
        if (options?.hyperedgeTypes && !options.hyperedgeTypes.includes(hyperedge.type)) {
          continue;
        }

        for (const neighborId of hyperedge.nodes) {
          if (!visited.has(neighborId)) {
            const neighbor = this.nodes.get(neighborId);
            if (neighbor) {
              dfsRecursive(neighbor, depth + 1);
            }
          }
        }
      }

      // Also expand via regular edges if requested
      if (options?.edgeTypes) {
        const edges = this.getNodeEdges(node.id);
        for (const edge of edges) {
          if (!options.edgeTypes.includes(edge.type)) continue;

          const neighborId = edge.source === node.id ? edge.target : edge.source;
          if (!visited.has(neighborId)) {
            const neighbor = this.nodes.get(neighborId);
            if (neighbor) {
              dfsRecursive(neighbor, depth + 1);
            }
          }
        }
      }
    };

    dfsRecursive(startNode, 0);
    return result;
  }

  // Phase 4: Clustering & Analysis

  /**
   * Find clusters of nodes that share many hyperedges
   * Uses Jaccard similarity on hyperedge membership
   */
  findHypergraphClusters(minSimilarity: number = 0.5): Array<{
    nodes: string[];
    sharedHyperedges: string[];
    similarity: number;
  }> {
    const clusters: Array<{ nodes: string[]; sharedHyperedges: string[]; similarity: number }> = [];
    const processed = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      if (processed.has(nodeId)) continue;

      const nodeHyperedges = new Set(this.getNodeHyperedges(nodeId).map(h => h.id));
      const clusterNodes: string[] = [nodeId];
      const clusterHyperedges = new Set(nodeHyperedges);

      // Find similar nodes
      for (const otherId of this.nodes.keys()) {
        if (otherId === nodeId || processed.has(otherId)) continue;

        const otherHyperedges = new Set(this.getNodeHyperedges(otherId).map(h => h.id));

        // Jaccard similarity: |A ∩ B| / |A ∪ B|
        const intersection = new Set([...nodeHyperedges].filter(x => otherHyperedges.has(x)));
        const union = new Set([...nodeHyperedges, ...otherHyperedges]);
        const similarity = union.size > 0 ? intersection.size / union.size : 0;

        if (similarity >= minSimilarity) {
          clusterNodes.push(otherId);
          processed.add(otherId);

          // Add to cluster hyperedges
          for (const h of intersection) {
            clusterHyperedges.add(h);
          }
        }
      }

      if (clusterNodes.length > 1) {
        clusters.push({
          nodes: clusterNodes,
          sharedHyperedges: Array.from(clusterHyperedges),
          similarity: clusterHyperedges.size / Math.max(nodeHyperedges.size, 1)
        });
      }

      processed.add(nodeId);
    }

    return clusters.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate hypergraph degree: number of hyperedges a node participates in
   */
  getHypergraphDegree(nodeId: string, type?: string): number {
    return this.getNodeHyperedges(nodeId, type).length;
  }

  /**
   * Find nodes with highest hypergraph centrality
   * (Nodes that participate in the most hyperedges)
   */
  getHypergraphCentralNodes(limit: number = 10, type?: string): Array<{
    nodeId: string;
    degree: number;
    hyperedges: string[];
  }> {
    const centrality: Array<{ nodeId: string; degree: number; hyperedges: string[] }> = [];

    for (const nodeId of this.nodes.keys()) {
      const hyperedges = this.getNodeHyperedges(nodeId, type);
      centrality.push({
        nodeId,
        degree: hyperedges.length,
        hyperedges: hyperedges.map(h => h.id)
      });
    }

    return centrality
      .sort((a, b) => b.degree - a.degree)
      .slice(0, limit);
  }

  /**
   * Calculate betweenness centrality for hypergraphs
   * Measures how often a node appears on shortest hyperpaths between other nodes
   */
  getHypergraphBetweennessCentrality(nodeId: string, sampleSize: number = 100): number {
    let betweenness = 0;
    const nodeIds = Array.from(this.nodes.keys()).filter(id => id !== nodeId);

    // Sample random pairs of nodes
    const pairs = Math.min(sampleSize, nodeIds.length * (nodeIds.length - 1) / 2);

    for (let i = 0; i < pairs; i++) {
      const source = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      const target = nodeIds[Math.floor(Math.random() * nodeIds.length)];

      if (source === target) continue;

      // Find if nodeId is on the hypergraph path between source and target
      const pathNodes = this.hypergraphBFS(source, Infinity);
      if (pathNodes.some(n => n.id === nodeId) && pathNodes.some(n => n.id === target)) {
        betweenness++;
      }
    }

    return betweenness / pairs;
  }

  // Phase 5: Graph Projection

  /**
   * Project hypergraph onto a regular graph
   * Creates edges between all pairs of nodes that share a hyperedge
   *
   * Use case: Use standard graph algorithms (PageRank, community detection)
   * after projecting the hypergraph
   */
  projectToGraph(options?: {
    hyperedgeTypes?: string[];
    weighted?: boolean;
  }): { nodes: Node[]; edges: Edge[] } {
    const edges: Edge[] = [];
    const edgeMap = new Map<string, { source: string; target: string; weight: number }>();

    for (const hyperedge of this.hyperedges.values()) {
      // Filter by type
      if (options?.hyperedgeTypes && !options.hyperedgeTypes.includes(hyperedge.type)) {
        continue;
      }

      // Create edges for all pairs in this hyperedge
      for (let i = 0; i < hyperedge.nodes.length; i++) {
        for (let j = i + 1; j < hyperedge.nodes.length; j++) {
          const source = hyperedge.nodes[i];
          const target = hyperedge.nodes[j];
          const key = [source, target].sort().join('::');

          if (!edgeMap.has(key)) {
            edgeMap.set(key, { source, target, weight: 0 });
          }
          edgeMap.get(key)!.weight++;
        }
      }
    }

    // Convert to Edge objects
    for (const [key, data] of edgeMap.entries()) {
      edges.push({
        id: `projected::${key}`,
        source: data.source,
        target: data.target,
        type: 'hypergraph_projection',
        metadata: options?.weighted ? { weight: data.weight } : undefined
      });
    }

    return {
      nodes: Array.from(this.nodes.values()),
      edges
    };
  }

  /**
   * Advanced: Find maximal cliques in the projected graph
   * A clique represents a set of nodes that all share the same hyperedge(s)
   */
  findMaximalCliques(minSize: number = 3): Array<{
    nodes: string[];
    hyperedges: string[];
  }> {
    const cliques: Array<{ nodes: string[]; hyperedges: string[] }> = [];

    // Each hyperedge is a natural clique
    for (const hyperedge of this.hyperedges.values()) {
      if (hyperedge.nodes.length >= minSize) {
        cliques.push({
          nodes: [...hyperedge.nodes],
          hyperedges: [hyperedge.id]
        });
      }
    }

    return cliques.sort((a, b) => b.nodes.length - a.nodes.length);
  }

  /**
   * Calculate hypergraph density: ratio of actual hyperedges to possible hyperedges
   */
  getHypergraphDensity(): number {
    const n = this.nodes.size;
    if (n < 2) return 0;

    // For simplicity, consider all possible 2-subsets (could extend to k-subsets)
    const maxPossibleEdges = (n * (n - 1)) / 2;
    const actualEdges = this.hyperedges.size;

    return actualEdges / maxPossibleEdges;
  }

  /**
   * Find strongly connected components in hypergraph
   * Returns groups of nodes that are mutually reachable via hyperedges
   */
  findStronglyConnectedComponents(): Array<string[]> {
    const components: Array<string[]> = [];
    const visited = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const component = this.hypergraphBFS(nodeId, Infinity).map(n => n.id);
      component.forEach(id => visited.add(id));

      if (component.length > 1) {
        components.push(component);
      }
    }

    return components.sort((a, b) => b.length - a.length);
  }
}

export default MemoryGraph;
