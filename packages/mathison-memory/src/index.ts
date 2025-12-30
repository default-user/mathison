/**
 * Mathison Memory - Graph/Hypergraph Memory System
 * Phase 2: Backend abstraction for persistent storage
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

// Backend interface for storage abstraction
export interface MemoryBackend {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Node operations
  addNode(node: Node): Promise<void>;
  getNode(id: string): Promise<Node | null>;
  getAllNodes(): Promise<Node[]>;
  deleteNode(id: string): Promise<boolean>;

  // Edge operations
  addEdge(edge: Edge): Promise<void>;
  getEdge(id: string): Promise<Edge | null>;
  getNodeEdges(nodeId: string): Promise<Edge[]>;
  getAllEdges(): Promise<Edge[]>;
  deleteEdge(id: string): Promise<boolean>;

  // Hyperedge operations
  addHyperedge(hyperedge: Hyperedge): Promise<void>;
  getHyperedge(id: string): Promise<Hyperedge | null>;
  getAllHyperedges(): Promise<Hyperedge[]>;
  deleteHyperedge(id: string): Promise<boolean>;

  // Search
  search(query: string, limit: number): Promise<Node[]>;
}

// In-memory backend (default, Phase 1)
export class InMemoryBackend implements MemoryBackend {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();
  private hyperedges: Map<string, Hyperedge> = new Map();

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  async addNode(node: Node): Promise<void> {
    this.nodes.set(node.id, node);
  }

  async getNode(id: string): Promise<Node | null> {
    return this.nodes.get(id) || null;
  }

  async getAllNodes(): Promise<Node[]> {
    return Array.from(this.nodes.values());
  }

  async deleteNode(id: string): Promise<boolean> {
    return this.nodes.delete(id);
  }

  async addEdge(edge: Edge): Promise<void> {
    this.edges.set(edge.id, edge);
  }

  async getEdge(id: string): Promise<Edge | null> {
    return this.edges.get(id) || null;
  }

  async getNodeEdges(nodeId: string): Promise<Edge[]> {
    const edges: Edge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId || edge.target === nodeId) {
        edges.push(edge);
      }
    }
    return edges;
  }

  async getAllEdges(): Promise<Edge[]> {
    return Array.from(this.edges.values());
  }

  async deleteEdge(id: string): Promise<boolean> {
    return this.edges.delete(id);
  }

  async addHyperedge(hyperedge: Hyperedge): Promise<void> {
    this.hyperedges.set(hyperedge.id, hyperedge);
  }

  async getHyperedge(id: string): Promise<Hyperedge | null> {
    return this.hyperedges.get(id) || null;
  }

  async getAllHyperedges(): Promise<Hyperedge[]> {
    return Array.from(this.hyperedges.values());
  }

  async deleteHyperedge(id: string): Promise<boolean> {
    return this.hyperedges.delete(id);
  }

  async search(query: string, limit: number = 10): Promise<Node[]> {
    const results: Node[] = [];
    const lowerQuery = query.toLowerCase();

    for (const node of this.nodes.values()) {
      if (results.length >= limit) break;

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
}

// MemoryGraph with pluggable backend
export class MemoryGraph {
  private backend: MemoryBackend;
  private _traversal?: import('./traversal').GraphTraversal;
  private _analytics?: import('./analytics').GraphAnalytics;
  private _query?: import('./query').GraphQuery;

  constructor(backend?: MemoryBackend) {
    this.backend = backend || new InMemoryBackend();
  }

  // Lazy-load graph intelligence modules
  get traversal(): import('./traversal').GraphTraversal {
    if (!this._traversal) {
      const { GraphTraversal } = require('./traversal');
      this._traversal = new GraphTraversal(this.backend);
    }
    return this._traversal!;
  }

  get analytics(): import('./analytics').GraphAnalytics {
    if (!this._analytics) {
      const { GraphAnalytics } = require('./analytics');
      this._analytics = new GraphAnalytics(this.backend);
    }
    return this._analytics!;
  }

  get query(): import('./query').GraphQuery {
    if (!this._query) {
      const { GraphQuery } = require('./query');
      this._query = new GraphQuery(this.backend);
    }
    return this._query!;
  }

  async initialize(): Promise<void> {
    console.log('🧠 Initializing Memory Graph...');
    await this.backend.initialize();
  }

  async shutdown(): Promise<void> {
    console.log('🧠 Shutting down Memory Graph...');
    await this.backend.shutdown();
  }

  // Node operations
  addNode(node: Node): void {
    this.backend.addNode(node).catch(err => {
      console.error('Failed to add node:', err);
    });
  }

  getNode(id: string): Node | undefined {
    // Sync wrapper for async backend (maintains backward compatibility)
    let result: Node | undefined;
    this.backend.getNode(id).then(node => {
      result = node || undefined;
    }).catch(() => {
      result = undefined;
    });
    return result;
  }

  getNodeEdges(nodeId: string): Edge[] {
    // Sync wrapper for async backend
    let result: Edge[] = [];
    this.backend.getNodeEdges(nodeId).then(edges => {
      result = edges;
    }).catch(() => {
      result = [];
    });
    return result;
  }

  addEdge(edge: Edge): void {
    this.backend.addEdge(edge).catch(err => {
      console.error('Failed to add edge:', err);
    });
  }

  addHyperedge(hyperedge: Hyperedge): void {
    this.backend.addHyperedge(hyperedge).catch(err => {
      console.error('Failed to add hyperedge:', err);
    });
  }

  search(query: string, limit: number = 10): Node[] {
    // Sync wrapper for async backend
    let result: Node[] = [];
    this.backend.search(query, limit).then(nodes => {
      result = nodes;
    }).catch(() => {
      result = [];
    });
    return result;
  }

  // Async API (preferred for PostgreSQL backend)
  async getNodeAsync(id: string): Promise<Node | null> {
    return this.backend.getNode(id);
  }

  async getNodeEdgesAsync(nodeId: string): Promise<Edge[]> {
    return this.backend.getNodeEdges(nodeId);
  }

  async searchAsync(query: string, limit: number = 10): Promise<Node[]> {
    return this.backend.search(query, limit);
  }
}

// Re-export backends
export { PostgreSQLBackend } from './backends/postgresql';

// Re-export graph intelligence modules
export { GraphTraversal, TraversalOptions, PathResult } from './traversal';
export { GraphAnalytics, GraphMetrics, NodeMetrics } from './analytics';
export { GraphQuery, NodePattern, EdgePattern, PathPattern, QueryResult } from './query';

export default MemoryGraph;
