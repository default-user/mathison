/**
 * GraphStore - Persistent storage for memory graph (nodes, edges, hyperedges)
 */

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface GraphHyperedge {
  id: string;
  nodes: string[];
  type: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface GraphStore {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Node operations
  writeNode(node: GraphNode): Promise<void>;
  readNode(id: string): Promise<GraphNode | null>;
  readAllNodes(): Promise<GraphNode[]>;
  deleteNode(id: string): Promise<void>;

  // Edge operations
  writeEdge(edge: GraphEdge): Promise<void>;
  readEdge(id: string): Promise<GraphEdge | null>;
  readAllEdges(): Promise<GraphEdge[]>;
  readEdgesByNode(nodeId: string): Promise<GraphEdge[]>;
  deleteEdge(id: string): Promise<void>;

  // Hyperedge operations
  writeHyperedge(hyperedge: GraphHyperedge): Promise<void>;
  readHyperedge(id: string): Promise<GraphHyperedge | null>;
  readAllHyperedges(): Promise<GraphHyperedge[]>;
  deleteHyperedge(id: string): Promise<void>;
}
