/**
 * SQLITE backend for GraphStore
 * Stores nodes, edges, and hyperedges in SQLite tables
 */

import Database from "better-sqlite3";
import type {
  GraphStore,
  GraphNode,
  GraphEdge,
  GraphHyperedge,
} from "../../graph_store";

export class SQLiteGraphStore implements GraphStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // Enable WAL mode for better concurrency
    this.db.pragma("journal_mode = WAL");
  }

  async initialize(): Promise<void> {
    // Create nodes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create edges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (source) REFERENCES graph_nodes(id),
        FOREIGN KEY (target) REFERENCES graph_nodes(id)
      )
    `);

    // Create hyperedges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_hyperedges (
        id TEXT PRIMARY KEY,
        nodes TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target);
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(type);
      CREATE INDEX IF NOT EXISTS idx_edges_type ON graph_edges(type);
    `);
  }

  async shutdown(): Promise<void> {
    this.db.close();
  }

  // Node operations
  async writeNode(node: GraphNode): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO graph_nodes (id, type, data, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const created_at = node.created_at || new Date().toISOString();
    stmt.run(
      node.id,
      node.type,
      JSON.stringify(node.data),
      node.metadata ? JSON.stringify(node.metadata) : null,
      created_at
    );
  }

  async readNode(id: string): Promise<GraphNode | null> {
    const stmt = this.db.prepare(`
      SELECT id, type, data, metadata, created_at
      FROM graph_nodes
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      type: row.type,
      data: JSON.parse(row.data),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    };
  }

  async readAllNodes(): Promise<GraphNode[]> {
    const stmt = this.db.prepare(`
      SELECT id, type, data, metadata, created_at
      FROM graph_nodes
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      data: JSON.parse(row.data),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    }));
  }

  async deleteNode(id: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM graph_nodes WHERE id = ?`);
    stmt.run(id);
  }

  // Edge operations
  async writeEdge(edge: GraphEdge): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO graph_edges (id, source, target, type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const created_at = edge.created_at || new Date().toISOString();
    stmt.run(
      edge.id,
      edge.source,
      edge.target,
      edge.type,
      edge.metadata ? JSON.stringify(edge.metadata) : null,
      created_at
    );
  }

  async readEdge(id: string): Promise<GraphEdge | null> {
    const stmt = this.db.prepare(`
      SELECT id, source, target, type, metadata, created_at
      FROM graph_edges
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    };
  }

  async readAllEdges(): Promise<GraphEdge[]> {
    const stmt = this.db.prepare(`
      SELECT id, source, target, type, metadata, created_at
      FROM graph_edges
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    }));
  }

  async readEdgesByNode(nodeId: string): Promise<GraphEdge[]> {
    const stmt = this.db.prepare(`
      SELECT id, source, target, type, metadata, created_at
      FROM graph_edges
      WHERE source = ? OR target = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(nodeId, nodeId) as any[];
    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    }));
  }

  async deleteEdge(id: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM graph_edges WHERE id = ?`);
    stmt.run(id);
  }

  // Hyperedge operations
  async writeHyperedge(hyperedge: GraphHyperedge): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO graph_hyperedges (id, nodes, type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const created_at = hyperedge.created_at || new Date().toISOString();
    stmt.run(
      hyperedge.id,
      JSON.stringify(hyperedge.nodes),
      hyperedge.type,
      hyperedge.metadata ? JSON.stringify(hyperedge.metadata) : null,
      created_at
    );
  }

  async readHyperedge(id: string): Promise<GraphHyperedge | null> {
    const stmt = this.db.prepare(`
      SELECT id, nodes, type, metadata, created_at
      FROM graph_hyperedges
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      nodes: JSON.parse(row.nodes),
      type: row.type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    };
  }

  async readAllHyperedges(): Promise<GraphHyperedge[]> {
    const stmt = this.db.prepare(`
      SELECT id, nodes, type, metadata, created_at
      FROM graph_hyperedges
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      nodes: JSON.parse(row.nodes),
      type: row.type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      created_at: row.created_at,
    }));
  }

  async deleteHyperedge(id: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM graph_hyperedges WHERE id = ?`);
    stmt.run(id);
  }
}
