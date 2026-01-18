/**
 * FILE backend for GraphStore
 * Stores nodes, edges, and hyperedges as JSON files
 */

import * as fs from "fs";
import * as path from "path";
import type {
  GraphStore,
  GraphNode,
  GraphEdge,
  GraphHyperedge,
} from "../../graph_store";

export class FileGraphStore implements GraphStore {
  private basePath: string;
  private nodesPath: string;
  private edgesPath: string;
  private hyperedgesPath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.nodesPath = path.join(basePath, "graph", "nodes");
    this.edgesPath = path.join(basePath, "graph", "edges");
    this.hyperedgesPath = path.join(basePath, "graph", "hyperedges");
  }

  async initialize(): Promise<void> {
    // Create directories if they don't exist
    fs.mkdirSync(this.nodesPath, { recursive: true });
    fs.mkdirSync(this.edgesPath, { recursive: true });
    fs.mkdirSync(this.hyperedgesPath, { recursive: true });
  }

  async shutdown(): Promise<void> {
    // FILE backend doesn't need cleanup
  }

  // Node operations
  async writeNode(node: GraphNode): Promise<void> {
    const nodeWithTimestamp = {
      ...node,
      created_at: node.created_at || new Date().toISOString(),
    };
    const filePath = path.join(this.nodesPath, `${node.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(nodeWithTimestamp, null, 2));
  }

  async readNode(id: string): Promise<GraphNode | null> {
    const filePath = path.join(this.nodesPath, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  }

  async readAllNodes(): Promise<GraphNode[]> {
    if (!fs.existsSync(this.nodesPath)) {
      return [];
    }
    const files = fs.readdirSync(this.nodesPath);
    const nodes: GraphNode[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const content = fs.readFileSync(path.join(this.nodesPath, file), "utf-8");
        nodes.push(JSON.parse(content));
      }
    }
    return nodes;
  }

  async deleteNode(id: string): Promise<void> {
    const filePath = path.join(this.nodesPath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Edge operations
  async writeEdge(edge: GraphEdge): Promise<void> {
    const edgeWithTimestamp = {
      ...edge,
      created_at: edge.created_at || new Date().toISOString(),
    };
    const filePath = path.join(this.edgesPath, `${edge.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(edgeWithTimestamp, null, 2));
  }

  async readEdge(id: string): Promise<GraphEdge | null> {
    const filePath = path.join(this.edgesPath, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  }

  async readAllEdges(): Promise<GraphEdge[]> {
    if (!fs.existsSync(this.edgesPath)) {
      return [];
    }
    const files = fs.readdirSync(this.edgesPath);
    const edges: GraphEdge[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const content = fs.readFileSync(path.join(this.edgesPath, file), "utf-8");
        edges.push(JSON.parse(content));
      }
    }
    return edges;
  }

  async readEdgesByNode(nodeId: string): Promise<GraphEdge[]> {
    const allEdges = await this.readAllEdges();
    return allEdges.filter(
      (edge) => edge.source === nodeId || edge.target === nodeId
    );
  }

  async deleteEdge(id: string): Promise<void> {
    const filePath = path.join(this.edgesPath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Hyperedge operations
  async writeHyperedge(hyperedge: GraphHyperedge): Promise<void> {
    const hyperedgeWithTimestamp = {
      ...hyperedge,
      created_at: hyperedge.created_at || new Date().toISOString(),
    };
    const filePath = path.join(this.hyperedgesPath, `${hyperedge.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(hyperedgeWithTimestamp, null, 2));
  }

  async readHyperedge(id: string): Promise<GraphHyperedge | null> {
    const filePath = path.join(this.hyperedgesPath, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  }

  async readAllHyperedges(): Promise<GraphHyperedge[]> {
    if (!fs.existsSync(this.hyperedgesPath)) {
      return [];
    }
    const files = fs.readdirSync(this.hyperedgesPath);
    const hyperedges: GraphHyperedge[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const content = fs.readFileSync(path.join(this.hyperedgesPath, file), "utf-8");
        hyperedges.push(JSON.parse(content));
      }
    }
    return hyperedges;
  }

  async deleteHyperedge(id: string): Promise<void> {
    const filePath = path.join(this.hyperedgesPath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
