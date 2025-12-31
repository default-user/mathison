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
}

export default MemoryGraph;
