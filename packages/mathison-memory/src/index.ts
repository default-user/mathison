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

export class MemoryGraph {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private hyperedges: Map<string, Hyperedge> = new Map();

  async initialize(): Promise<void> {
    console.log('🧠 Initializing Memory Graph...');
    // TODO: Load from persistent storage
    // TODO: Initialize graph indexes
  }

  async shutdown(): Promise<void> {
    console.log('🧠 Shutting down Memory Graph...');
    // TODO: Persist to storage
  }

  addNode(node: Node): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: Edge): void {
    this.edges.set(edge.id, edge);
  }

  addHyperedge(hyperedge: Hyperedge): void {
    this.hyperedges.set(hyperedge.id, hyperedge);
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

  /**
   * P4-C: Get filtered edges for a node with direction and type filtering
   * @param nodeId - Node ID to get edges for
   * @param direction - 'in' | 'out' | 'both'
   * @param types - Optional comma-separated list of edge types to filter
   * @returns Filtered edges array
   */
  getNodeEdgesFiltered(
    nodeId: string,
    direction: 'in' | 'out' | 'both' = 'both',
    types?: string[]
  ): Edge[] {
    const edges: Edge[] = [];
    const typeSet = types ? new Set(types) : null;

    for (const edge of this.edges.values()) {
      // Direction filtering
      const matchesDirection =
        (direction === 'out' && edge.source === nodeId) ||
        (direction === 'in' && edge.target === nodeId) ||
        (direction === 'both' && (edge.source === nodeId || edge.target === nodeId));

      if (!matchesDirection) continue;

      // Type filtering
      if (typeSet && !typeSet.has(edge.type)) continue;

      edges.push(edge);
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
   * P4-C: Bounded graph traversal with hard depth limit (max 3)
   * Returns nodes and edges discovered within depth limit
   * @param startNodeId - Starting node ID
   * @param direction - Traversal direction ('in' | 'out' | 'both')
   * @param depth - Maximum depth (1-3, enforced at API layer)
   * @param types - Optional edge types to follow
   * @returns Object with discovered nodes and edges
   */
  traverse(
    startNodeId: string,
    direction: 'in' | 'out' | 'both' = 'both',
    depth: number = 1,
    types?: string[]
  ): { nodes: Node[]; edges: Edge[] } {
    const startNode = this.nodes.get(startNodeId);
    if (!startNode) {
      return { nodes: [], edges: [] };
    }

    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const discoveredNodes: Node[] = [];
    const discoveredEdges: Edge[] = [];

    // BFS traversal with depth tracking
    const queue: Array<{ nodeId: string; currentDepth: number }> = [
      { nodeId: startNodeId, currentDepth: 0 }
    ];

    while (queue.length > 0) {
      const { nodeId, currentDepth } = queue.shift()!;

      // Mark node as visited
      if (!visitedNodes.has(nodeId)) {
        visitedNodes.add(nodeId);
        const node = this.nodes.get(nodeId);
        if (node) {
          discoveredNodes.push(node);
        }
      }

      // Stop if reached depth limit
      if (currentDepth >= depth) {
        continue;
      }

      // Get edges for this node
      const edges = this.getNodeEdgesFiltered(nodeId, direction, types);

      for (const edge of edges) {
        // Mark edge as visited
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.add(edge.id);
          discoveredEdges.push(edge);
        }

        // Determine next node based on direction
        let nextNodeId: string | null = null;
        if (direction === 'out' && edge.source === nodeId) {
          nextNodeId = edge.target;
        } else if (direction === 'in' && edge.target === nodeId) {
          nextNodeId = edge.source;
        } else if (direction === 'both') {
          nextNodeId = edge.source === nodeId ? edge.target : edge.source;
        }

        // Queue next node if not visited
        if (nextNodeId && !visitedNodes.has(nextNodeId)) {
          queue.push({ nodeId: nextNodeId, currentDepth: currentDepth + 1 });
        }
      }
    }

    return {
      nodes: discoveredNodes,
      edges: discoveredEdges
    };
  }

  // TODO: Implement hypergraph operations
  // TODO: Add query DSL for complex graph queries
  // TODO: Add graph visualization export
}

export default MemoryGraph;
