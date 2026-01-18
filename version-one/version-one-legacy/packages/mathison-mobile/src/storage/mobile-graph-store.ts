/**
 * Mobile Graph Store - React Native storage for memory graph
 * Supports AsyncStorage (simple key-value) and SQLite (structured)
 */

import type {
  GraphStore,
  GraphNode,
  GraphEdge,
  GraphHyperedge,
} from 'mathison-storage/src/graph_store';

export type MobileStorageBackend = 'async-storage' | 'sqlite';

/**
 * Mobile Graph Store for React Native
 *
 * Uses React Native AsyncStorage for simple persistence or
 * react-native-sqlite-storage for structured queries.
 *
 * In a real React Native app, you would:
 * ```typescript
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import SQLite from 'react-native-sqlite-storage';
 * ```
 */
export class MobileGraphStore implements GraphStore {
  private backend: MobileStorageBackend;
  private nativeModules: any;

  // In-memory cache (for AsyncStorage backend)
  private nodeCache: Map<string, GraphNode> = new Map();
  private edgeCache: Map<string, GraphEdge> = new Map();
  private hyperedgeCache: Map<string, GraphHyperedge> = new Map();

  // SQLite database (for SQLite backend)
  private db: any = null;

  constructor(backend: MobileStorageBackend = 'async-storage', nativeModules?: any) {
    this.backend = backend;
    this.nativeModules = nativeModules || {};
  }

  async initialize(): Promise<void> {
    console.log(`📱 Initializing Mobile Graph Store (${this.backend})...`);

    if (this.backend === 'sqlite') {
      await this.initializeSQLite();
    } else {
      await this.initializeAsyncStorage();
    }
  }

  async shutdown(): Promise<void> {
    console.log('📱 Shutting down Mobile Graph Store...');

    if (this.backend === 'sqlite' && this.db) {
      await this.db.close?.();
      this.db = null;
    }

    this.nodeCache.clear();
    this.edgeCache.clear();
    this.hyperedgeCache.clear();
  }

  // Node operations
  async writeNode(node: GraphNode): Promise<void> {
    if (this.backend === 'sqlite') {
      await this.writeNodeSQLite(node);
    } else {
      await this.writeNodeAsyncStorage(node);
    }
  }

  async readNode(id: string): Promise<GraphNode | null> {
    if (this.backend === 'sqlite') {
      return await this.readNodeSQLite(id);
    } else {
      return await this.readNodeAsyncStorage(id);
    }
  }

  async readAllNodes(): Promise<GraphNode[]> {
    if (this.backend === 'sqlite') {
      return await this.readAllNodesSQLite();
    } else {
      return await this.readAllNodesAsyncStorage();
    }
  }

  async deleteNode(id: string): Promise<void> {
    if (this.backend === 'sqlite') {
      await this.deleteNodeSQLite(id);
    } else {
      await this.deleteNodeAsyncStorage(id);
    }
  }

  // Edge operations
  async writeEdge(edge: GraphEdge): Promise<void> {
    if (this.backend === 'sqlite') {
      await this.writeEdgeSQLite(edge);
    } else {
      await this.writeEdgeAsyncStorage(edge);
    }
  }

  async readEdge(id: string): Promise<GraphEdge | null> {
    if (this.backend === 'sqlite') {
      return await this.readEdgeSQLite(id);
    } else {
      return await this.readEdgeAsyncStorage(id);
    }
  }

  async readAllEdges(): Promise<GraphEdge[]> {
    if (this.backend === 'sqlite') {
      return await this.readAllEdgesSQLite();
    } else {
      return await this.readAllEdgesAsyncStorage();
    }
  }

  async readEdgesByNode(nodeId: string): Promise<GraphEdge[]> {
    if (this.backend === 'sqlite') {
      return await this.readEdgesByNodeSQLite(nodeId);
    } else {
      return await this.readEdgesByNodeAsyncStorage(nodeId);
    }
  }

  async deleteEdge(id: string): Promise<void> {
    if (this.backend === 'sqlite') {
      await this.deleteEdgeSQLite(id);
    } else {
      await this.deleteEdgeAsyncStorage(id);
    }
  }

  // Hyperedge operations
  async writeHyperedge(hyperedge: GraphHyperedge): Promise<void> {
    if (this.backend === 'sqlite') {
      await this.writeHyperedgeSQLite(hyperedge);
    } else {
      await this.writeHyperedgeAsyncStorage(hyperedge);
    }
  }

  async readHyperedge(id: string): Promise<GraphHyperedge | null> {
    if (this.backend === 'sqlite') {
      return await this.readHyperedgeSQLite(id);
    } else {
      return await this.readHyperedgeAsyncStorage(id);
    }
  }

  async readAllHyperedges(): Promise<GraphHyperedge[]> {
    if (this.backend === 'sqlite') {
      return await this.readAllHyperedgesSQLite();
    } else {
      return await this.readAllHyperedgesAsyncStorage();
    }
  }

  async deleteHyperedge(id: string): Promise<void> {
    if (this.backend === 'sqlite') {
      await this.deleteHyperedgeSQLite(id);
    } else {
      await this.deleteHyperedgeAsyncStorage(id);
    }
  }

  // Private: AsyncStorage backend

  private async initializeAsyncStorage(): Promise<void> {
    if (!this.nativeModules.AsyncStorage) {
      console.warn('AsyncStorage not available, using in-memory only');
      return;
    }

    // Load existing data into cache
    try {
      const keys = await this.nativeModules.AsyncStorage.getAllKeys();
      const graphKeys = keys.filter((k: string) => k.startsWith('mathison:graph:'));

      if (graphKeys.length > 0) {
        const items = await this.nativeModules.AsyncStorage.multiGet(graphKeys);

        for (const [key, value] of items) {
          if (!value) continue;

          const data = JSON.parse(value);

          if (key.includes(':node:')) {
            this.nodeCache.set(data.id, data);
          } else if (key.includes(':edge:')) {
            this.edgeCache.set(data.id, data);
          } else if (key.includes(':hyperedge:')) {
            this.hyperedgeCache.set(data.id, data);
          }
        }

        console.log(`  Loaded ${this.nodeCache.size} nodes, ${this.edgeCache.size} edges from AsyncStorage`);
      }
    } catch (error) {
      console.error('Failed to load from AsyncStorage:', error);
    }
  }

  private async writeNodeAsyncStorage(node: GraphNode): Promise<void> {
    this.nodeCache.set(node.id, node);

    if (this.nativeModules.AsyncStorage) {
      await this.nativeModules.AsyncStorage.setItem(
        `mathison:graph:node:${node.id}`,
        JSON.stringify(node)
      );
    }
  }

  private async readNodeAsyncStorage(id: string): Promise<GraphNode | null> {
    return this.nodeCache.get(id) || null;
  }

  private async readAllNodesAsyncStorage(): Promise<GraphNode[]> {
    return Array.from(this.nodeCache.values());
  }

  private async deleteNodeAsyncStorage(id: string): Promise<void> {
    this.nodeCache.delete(id);

    if (this.nativeModules.AsyncStorage) {
      await this.nativeModules.AsyncStorage.removeItem(`mathison:graph:node:${id}`);
    }
  }

  private async writeEdgeAsyncStorage(edge: GraphEdge): Promise<void> {
    this.edgeCache.set(edge.id, edge);

    if (this.nativeModules.AsyncStorage) {
      await this.nativeModules.AsyncStorage.setItem(
        `mathison:graph:edge:${edge.id}`,
        JSON.stringify(edge)
      );
    }
  }

  private async readEdgeAsyncStorage(id: string): Promise<GraphEdge | null> {
    return this.edgeCache.get(id) || null;
  }

  private async readAllEdgesAsyncStorage(): Promise<GraphEdge[]> {
    return Array.from(this.edgeCache.values());
  }

  private async readEdgesByNodeAsyncStorage(nodeId: string): Promise<GraphEdge[]> {
    return Array.from(this.edgeCache.values()).filter(
      (edge) => edge.source === nodeId || edge.target === nodeId
    );
  }

  private async deleteEdgeAsyncStorage(id: string): Promise<void> {
    this.edgeCache.delete(id);

    if (this.nativeModules.AsyncStorage) {
      await this.nativeModules.AsyncStorage.removeItem(`mathison:graph:edge:${id}`);
    }
  }

  private async writeHyperedgeAsyncStorage(hyperedge: GraphHyperedge): Promise<void> {
    this.hyperedgeCache.set(hyperedge.id, hyperedge);

    if (this.nativeModules.AsyncStorage) {
      await this.nativeModules.AsyncStorage.setItem(
        `mathison:graph:hyperedge:${hyperedge.id}`,
        JSON.stringify(hyperedge)
      );
    }
  }

  private async readHyperedgeAsyncStorage(id: string): Promise<GraphHyperedge | null> {
    return this.hyperedgeCache.get(id) || null;
  }

  private async readAllHyperedgesAsyncStorage(): Promise<GraphHyperedge[]> {
    return Array.from(this.hyperedgeCache.values());
  }

  private async deleteHyperedgeAsyncStorage(id: string): Promise<void> {
    this.hyperedgeCache.delete(id);

    if (this.nativeModules.AsyncStorage) {
      await this.nativeModules.AsyncStorage.removeItem(`mathison:graph:hyperedge:${id}`);
    }
  }

  // Private: SQLite backend

  private async initializeSQLite(): Promise<void> {
    if (!this.nativeModules.SQLite) {
      throw new Error('SQLite module not available');
    }

    this.db = await this.nativeModules.SQLite.openDatabase({
      name: 'mathison.db',
      location: 'default',
    });

    // Create tables
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT,
        data TEXT,
        metadata TEXT
      )
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT,
        metadata TEXT,
        created_at TEXT
      )
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS graph_hyperedges (
        id TEXT PRIMARY KEY,
        nodes TEXT NOT NULL,
        type TEXT,
        metadata TEXT,
        created_at TEXT
      )
    `);

    // Indexes
    await this.db.executeSql('CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source)');
    await this.db.executeSql('CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target)');
  }

  private async writeNodeSQLite(node: GraphNode): Promise<void> {
    await this.db.executeSql(
      `INSERT OR REPLACE INTO graph_nodes (id, type, data, metadata) VALUES (?, ?, ?, ?)`,
      [node.id, node.type, JSON.stringify(node.data), JSON.stringify(node.metadata)]
    );
  }

  private async readNodeSQLite(id: string): Promise<GraphNode | null> {
    const [result] = await this.db.executeSql(
      'SELECT * FROM graph_nodes WHERE id = ?',
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows.item(0);
    return {
      id: row.id,
      type: row.type,
      data: JSON.parse(row.data),
      metadata: JSON.parse(row.metadata),
    };
  }

  private async readAllNodesSQLite(): Promise<GraphNode[]> {
    const [result] = await this.db.executeSql('SELECT * FROM graph_nodes');
    const nodes: GraphNode[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      nodes.push({
        id: row.id,
        type: row.type,
        data: JSON.parse(row.data),
        metadata: JSON.parse(row.metadata),
      });
    }

    return nodes;
  }

  private async deleteNodeSQLite(id: string): Promise<void> {
    await this.db.executeSql('DELETE FROM graph_nodes WHERE id = ?', [id]);
  }

  private async writeEdgeSQLite(edge: GraphEdge): Promise<void> {
    await this.db.executeSql(
      `INSERT OR REPLACE INTO graph_edges (id, source, target, type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [edge.id, edge.source, edge.target, edge.type, JSON.stringify(edge.metadata), edge.created_at]
    );
  }

  private async readEdgeSQLite(id: string): Promise<GraphEdge | null> {
    const [result] = await this.db.executeSql(
      'SELECT * FROM graph_edges WHERE id = ?',
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows.item(0);
    return {
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.type,
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at,
    };
  }

  private async readAllEdgesSQLite(): Promise<GraphEdge[]> {
    const [result] = await this.db.executeSql('SELECT * FROM graph_edges');
    const edges: GraphEdge[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      edges.push({
        id: row.id,
        source: row.source,
        target: row.target,
        type: row.type,
        metadata: JSON.parse(row.metadata),
        created_at: row.created_at,
      });
    }

    return edges;
  }

  private async readEdgesByNodeSQLite(nodeId: string): Promise<GraphEdge[]> {
    const [result] = await this.db.executeSql(
      'SELECT * FROM graph_edges WHERE source = ? OR target = ?',
      [nodeId, nodeId]
    );
    const edges: GraphEdge[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      edges.push({
        id: row.id,
        source: row.source,
        target: row.target,
        type: row.type,
        metadata: JSON.parse(row.metadata),
        created_at: row.created_at,
      });
    }

    return edges;
  }

  private async deleteEdgeSQLite(id: string): Promise<void> {
    await this.db.executeSql('DELETE FROM graph_edges WHERE id = ?', [id]);
  }

  private async writeHyperedgeSQLite(hyperedge: GraphHyperedge): Promise<void> {
    await this.db.executeSql(
      `INSERT OR REPLACE INTO graph_hyperedges (id, nodes, type, metadata, created_at) VALUES (?, ?, ?, ?, ?)`,
      [
        hyperedge.id,
        JSON.stringify(hyperedge.nodes),
        hyperedge.type,
        JSON.stringify(hyperedge.metadata),
        hyperedge.created_at,
      ]
    );
  }

  private async readHyperedgeSQLite(id: string): Promise<GraphHyperedge | null> {
    const [result] = await this.db.executeSql(
      'SELECT * FROM graph_hyperedges WHERE id = ?',
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows.item(0);
    return {
      id: row.id,
      nodes: JSON.parse(row.nodes),
      type: row.type,
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at,
    };
  }

  private async readAllHyperedgesSQLite(): Promise<GraphHyperedge[]> {
    const [result] = await this.db.executeSql('SELECT * FROM graph_hyperedges');
    const hyperedges: GraphHyperedge[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      hyperedges.push({
        id: row.id,
        nodes: JSON.parse(row.nodes),
        type: row.type,
        metadata: JSON.parse(row.metadata),
        created_at: row.created_at,
      });
    }

    return hyperedges;
  }

  private async deleteHyperedgeSQLite(id: string): Promise<void> {
    await this.db.executeSql('DELETE FROM graph_hyperedges WHERE id = ?', [id]);
  }
}

export default MobileGraphStore;
