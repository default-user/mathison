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
  private nodeToHyperedgeIds: Map<string, Set<string>> = new Map();
  private graphStore?: GraphStore;

  constructor(graphStore?: GraphStore) {
    this.graphStore = graphStore;
  }

  private indexHyperedge(h: Hyperedge): void {
    for (const nodeId of h.nodes) {
      let set = this.nodeToHyperedgeIds.get(nodeId);
      if (!set) {
        set = new Set();
        this.nodeToHyperedgeIds.set(nodeId, set);
      }
      set.add(h.id);
    }
  }

  private unindexHyperedge(h: Hyperedge): void {
    for (const nodeId of h.nodes) {
      const set = this.nodeToHyperedgeIds.get(nodeId);
      if (!set) continue;
      set.delete(h.id);
      if (set.size === 0) this.nodeToHyperedgeIds.delete(nodeId);
    }
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

      // Rebuild incidence index
      this.nodeToHyperedgeIds.clear();
      for (const h of this.hyperedges.values()) {
        this.indexHyperedge(h);
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
    // ATTACK 6 FIX: Prevent node ID collision overwrite
    const existing = this.nodes.get(node.id);
    if (existing) {
      throw new Error(
        `NODE_ID_COLLISION: Node with id '${node.id}' already exists. ` +
        `Use updateNode() to modify existing nodes.`
      );
    }

    this.nodes.set(node.id, node);
    // Persist to storage if available
    if (this.graphStore) {
      this.graphStore.writeNode(node).catch((err) => {
        console.error(`Failed to persist node ${node.id}:`, err);
      });
    }
  }

  /**
   * Update an existing node
   * Throws if node doesn't exist (prevents accidental creation)
   */
  updateNode(node: Node): void {
    const existing = this.nodes.get(node.id);
    if (!existing) {
      throw new Error(
        `NODE_NOT_FOUND: Cannot update non-existent node '${node.id}'. ` +
        `Use addNode() to create new nodes.`
      );
    }

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
    const prev = this.hyperedges.get(hyperedge.id);
    if (prev) this.unindexHyperedge(prev);
    this.hyperedges.set(hyperedge.id, hyperedge);
    this.indexHyperedge(hyperedge);
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
   * Now uses O(incidence) index instead of O(|E|) scan
   */
  getNodeHyperedges(nodeId: string, type?: string): Hyperedge[] {
    const result: Hyperedge[] = [];
    const hids = this.nodeToHyperedgeIds.get(nodeId);
    if (!hids) return result;

    for (const hid of hids) {
      const h = this.hyperedges.get(hid);
      if (!h) continue;
      if (!type || h.type === type) {
        result.push(h);
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
   * Helper: Iterate neighbors in the bipartite incidence graph
   * vertex format: "v:<nodeId>" or "e:<hyperedgeId>"
   */
  private *incidenceNeighbors(vertex: string, hyperedgeTypes?: string[]): Iterable<string> {
    if (vertex.startsWith("v:")) {
      const nodeId = vertex.slice(2);
      const hids = this.nodeToHyperedgeIds.get(nodeId);
      if (!hids) return;
      for (const hid of hids) {
        const h = this.hyperedges.get(hid);
        if (!h) continue;
        if (hyperedgeTypes && !hyperedgeTypes.includes(h.type)) continue;
        yield `e:${hid}`;
      }
    } else {
      const hid = vertex.slice(2);
      const h = this.hyperedges.get(hid);
      if (!h) return;
      for (const nid of h.nodes) yield `v:${nid}`;
    }
  }

  /**
   * Exact betweenness centrality via Brandes algorithm on incidence graph
   * Returns centrality for all nodes
   */
  getHypergraphBetweennessCentralityExact(options?: {
    hyperedgeTypes?: string[];
    normalize?: boolean;
  }): Map<string, number> {
    const cb = new Map<string, number>();
    const sources: string[] = [];

    // Initialize centrality for all nodes
    for (const nodeId of this.nodes.keys()) {
      const v = `v:${nodeId}`;
      cb.set(v, 0);
      sources.push(v);
    }

    // Brandes algorithm: single-source shortest-path accumulation
    for (const s of sources) {
      const stack: string[] = [];
      const P = new Map<string, string[]>();
      const sigma = new Map<string, number>();
      const dist = new Map<string, number>();

      // Initialize
      for (const v of sources) {
        P.set(v, []);
        sigma.set(v, 0);
        dist.set(v, -1);
      }
      // Also initialize for hyperedge vertices (discovered during BFS)
      sigma.set(s, 1);
      dist.set(s, 0);

      // BFS
      const queue: string[] = [s];
      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);

        for (const w of this.incidenceNeighbors(v, options?.hyperedgeTypes)) {
          // Initialize if first visit to hyperedge vertex
          if (!dist.has(w)) {
            dist.set(w, -1);
            sigma.set(w, 0);
            P.set(w, []);
          }

          // First time we see w?
          if (dist.get(w)! < 0) {
            queue.push(w);
            dist.set(w, dist.get(v)! + 1);
          }

          // Shortest path to w via v?
          if (dist.get(w) === dist.get(v)! + 1) {
            sigma.set(w, sigma.get(w)! + sigma.get(v)!);
            P.get(w)!.push(v);
          }
        }
      }

      // Accumulation (back-propagation)
      const delta = new Map<string, number>();
      for (const v of stack) delta.set(v, 0);

      // Reverse order
      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of P.get(w) || []) {
          const sigmaV = sigma.get(v) || 0;
          const sigmaW = sigma.get(w) || 0;
          const contrib = sigmaW > 0 ? (sigmaV / sigmaW) * (1 + delta.get(w)!) : 0;
          delta.set(v, delta.get(v)! + contrib);
        }
        if (w !== s && w.startsWith("v:")) {
          // Only accumulate for node-side vertices, not hyperedges
          cb.set(w, cb.get(w)! + delta.get(w)!);
        }
      }
    }

    // Undirected graph: divide by 2
    // Normalization: divide by (n-1)*(n-2)/2 if requested
    const n = this.nodes.size;
    const normFactor = (options?.normalize && n >= 3) ? ((n - 1) * (n - 2) / 2) : 1;

    const result = new Map<string, number>();
    for (const [v, c] of cb.entries()) {
      const nodeId = v.slice(2);
      result.set(nodeId, (c / 2) / normFactor);
    }

    return result;
  }

  /**
   * Calculate betweenness centrality for hypergraphs
   * Deprecated: sampleSize preserved for compatibility; now uses exact computation for correctness.
   */
  getHypergraphBetweennessCentrality(nodeId: string, sampleSize: number = 100): number {
    return this.getHypergraphBetweennessCentralityExact({ normalize: true }).get(nodeId) ?? 0;
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
   * Calculate incidence density: average fill ratio of incidence matrix
   * D_inc = (sum of hyperedge sizes) / (n * m)
   * where n = #nodes, m = #hyperedges
   */
  getHypergraphIncidenceDensity(options?: { hyperedgeTypes?: string[] }): number {
    const n = this.nodes.size;
    if (n === 0) return 0;

    let m = 0;
    let totalSize = 0;

    for (const h of this.hyperedges.values()) {
      if (options?.hyperedgeTypes && !options.hyperedgeTypes.includes(h.type)) continue;
      m++;
      totalSize += h.nodes.length;
    }

    if (m === 0) return 0;
    return totalSize / (n * m);
  }

  /**
   * Calculate projection density: density of 2-section (clique expansion)
   * D_proj = actualPairs / (n choose 2)
   * where actualPairs = unique unordered pairs co-occurring in any hyperedge
   */
  getHypergraphProjectionDensity(options?: { hyperedgeTypes?: string[] }): number {
    const n = this.nodes.size;
    if (n < 2) return 0;

    const pairs = new Set<string>();

    for (const h of this.hyperedges.values()) {
      if (options?.hyperedgeTypes && !options.hyperedgeTypes.includes(h.type)) continue;

      for (let i = 0; i < h.nodes.length; i++) {
        for (let j = i + 1; j < h.nodes.length; j++) {
          const key = [h.nodes[i], h.nodes[j]].sort().join('::');
          pairs.add(key);
        }
      }
    }

    const maxPairs = (n * (n - 1)) / 2;
    return pairs.size / maxPairs;
  }

  /**
   * Calculate hypergraph density (uses projection density as default)
   */
  getHypergraphDensity(): number {
    return this.getHypergraphProjectionDensity();
  }

  /**
   * Find connected components in the hypergraph
   * Returns groups of nodes that are mutually reachable via hyperedges
   */
  findHypergraphConnectedComponents(options?: { includeSingletons?: boolean }): Array<string[]> {
    const components: Array<string[]> = [];
    const visited = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const component = this.hypergraphBFS(nodeId, Infinity).map(n => n.id);
      component.forEach(id => visited.add(id));

      if (component.length > 1 || options?.includeSingletons) {
        components.push(component);
      }
    }

    return components.sort((a, b) => b.length - a.length);
  }

  /**
   * Find strongly connected components in hypergraph
   * Deprecated: hypergraph is undirected; this returns connected components (size>1).
   */
  findStronglyConnectedComponents(): Array<string[]> {
    return this.findHypergraphConnectedComponents({ includeSingletons: false });
  }
}

export default MemoryGraph;
