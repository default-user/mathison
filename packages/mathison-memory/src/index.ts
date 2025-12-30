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

  // TODO: Implement graph traversal algorithms
  // TODO: Implement hypergraph operations
  // TODO: Add query DSL for complex graph queries
  // TODO: Add graph visualization export
}

export default MemoryGraph;
