/**
 * PostgreSQL Backend for Memory Graph
 * Phase 2: Persistent hypergraph storage
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { Node, Edge, Hyperedge } from '../index';

export interface PostgreSQLConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  max?: number; // connection pool size
  connectionString?: string;
}

export class PostgreSQLBackend {
  private pool: Pool;
  private initialized: boolean = false;

  constructor(config: PostgreSQLConfig) {
    const poolConfig: PoolConfig = config.connectionString
      ? { connectionString: config.connectionString }
      : {
          host: config.host ?? 'localhost',
          port: config.port ?? 5432,
          database: config.database ?? 'mathison',
          user: config.user ?? 'postgres',
          password: config.password,
          max: config.max ?? 20
        };

    this.pool = new Pool(poolConfig);

    // Error handling
    this.pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err);
    });
  }

  async initialize(): Promise<void> {
    console.log('🗄️  Initializing PostgreSQL backend...');

    // Test connection
    const client = await this.pool.connect();
    try {
      await client.query('SELECT NOW()');
      console.log('✓ PostgreSQL connection established');
    } finally {
      client.release();
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    console.log('🗄️  Shutting down PostgreSQL backend...');
    await this.pool.end();
    this.initialized = false;
  }

  // Node operations
  async addNode(node: Node): Promise<void> {
    const query = `
      INSERT INTO nodes (id, type, data, metadata)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        data = EXCLUDED.data,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
    `;
    await this.pool.query(query, [
      node.id,
      node.type,
      JSON.stringify(node.data),
      node.metadata ? JSON.stringify(node.metadata) : null
    ]);
  }

  async getNode(id: string): Promise<Node | null> {
    const query = 'SELECT * FROM nodes WHERE id = $1';
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      data: row.data,
      metadata: row.metadata
    };
  }

  async getAllNodes(): Promise<Node[]> {
    const query = 'SELECT * FROM nodes ORDER BY created_at DESC';
    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      data: row.data,
      metadata: row.metadata
    }));
  }

  async deleteNode(id: string): Promise<boolean> {
    const query = 'DELETE FROM nodes WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Edge operations
  async addEdge(edge: Edge): Promise<void> {
    const query = `
      INSERT INTO edges (id, source, target, type, metadata)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        source = EXCLUDED.source,
        target = EXCLUDED.target,
        type = EXCLUDED.type,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
    `;
    await this.pool.query(query, [
      edge.id,
      edge.source,
      edge.target,
      edge.type,
      edge.metadata ? JSON.stringify(edge.metadata) : null
    ]);
  }

  async getEdge(id: string): Promise<Edge | null> {
    const query = 'SELECT * FROM edges WHERE id = $1';
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.type,
      metadata: row.metadata
    };
  }

  async getNodeEdges(nodeId: string): Promise<Edge[]> {
    const query = `
      SELECT * FROM edges
      WHERE source = $1 OR target = $1
      ORDER BY created_at DESC
    `;
    const result = await this.pool.query(query, [nodeId]);

    return result.rows.map(row => ({
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.type,
      metadata: row.metadata
    }));
  }

  async getAllEdges(): Promise<Edge[]> {
    const query = 'SELECT * FROM edges ORDER BY created_at DESC';
    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      id: row.id,
      source: row.source,
      target: row.target,
      type: row.type,
      metadata: row.metadata
    }));
  }

  async deleteEdge(id: string): Promise<boolean> {
    const query = 'DELETE FROM edges WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Hyperedge operations
  async addHyperedge(hyperedge: Hyperedge): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert hyperedge
      const hyperedgeQuery = `
        INSERT INTO hyperedges (id, type, metadata)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
      `;
      await client.query(hyperedgeQuery, [
        hyperedge.id,
        hyperedge.type,
        hyperedge.metadata ? JSON.stringify(hyperedge.metadata) : null
      ]);

      // Delete existing node associations
      await client.query('DELETE FROM hyperedge_nodes WHERE hyperedge_id = $1', [hyperedge.id]);

      // Insert node associations
      for (let i = 0; i < hyperedge.nodes.length; i++) {
        const nodeQuery = `
          INSERT INTO hyperedge_nodes (hyperedge_id, node_id, position)
          VALUES ($1, $2, $3)
        `;
        await client.query(nodeQuery, [hyperedge.id, hyperedge.nodes[i], i]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getHyperedge(id: string): Promise<Hyperedge | null> {
    const hyperedgeQuery = 'SELECT * FROM hyperedges WHERE id = $1';
    const hyperedgeResult = await this.pool.query(hyperedgeQuery, [id]);

    if (hyperedgeResult.rows.length === 0) {
      return null;
    }

    const nodesQuery = `
      SELECT node_id FROM hyperedge_nodes
      WHERE hyperedge_id = $1
      ORDER BY position
    `;
    const nodesResult = await this.pool.query(nodesQuery, [id]);

    const row = hyperedgeResult.rows[0];
    return {
      id: row.id,
      nodes: nodesResult.rows.map(r => r.node_id),
      type: row.type,
      metadata: row.metadata
    };
  }

  async getAllHyperedges(): Promise<Hyperedge[]> {
    const hyperedgeQuery = 'SELECT * FROM hyperedges ORDER BY created_at DESC';
    const hyperedgeResult = await this.pool.query(hyperedgeQuery);

    const hyperedges: Hyperedge[] = [];
    for (const row of hyperedgeResult.rows) {
      const nodesQuery = `
        SELECT node_id FROM hyperedge_nodes
        WHERE hyperedge_id = $1
        ORDER BY position
      `;
      const nodesResult = await this.pool.query(nodesQuery, [row.id]);

      hyperedges.push({
        id: row.id,
        nodes: nodesResult.rows.map(r => r.node_id),
        type: row.type,
        metadata: row.metadata
      });
    }

    return hyperedges;
  }

  async deleteHyperedge(id: string): Promise<boolean> {
    const query = 'DELETE FROM hyperedges WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Search
  async search(query: string, limit: number = 10): Promise<Node[]> {
    const searchQuery = `
      SELECT *
      FROM nodes
      WHERE
        to_tsvector('english', COALESCE(data->>'name', '') || ' ' || COALESCE(data->>'description', ''))
        @@ plainto_tsquery('english', $1)
        OR data::text ILIKE $2
      ORDER BY created_at DESC
      LIMIT $3
    `;
    const result = await this.pool.query(searchQuery, [query, `%${query}%`, limit]);

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      data: row.data,
      metadata: row.metadata
    }));
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rows.length > 0;
    } catch {
      return false;
    }
  }

  // Statistics
  async getStats(): Promise<{
    nodes: number;
    edges: number;
    hyperedges: number;
  }> {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM nodes) as nodes,
        (SELECT COUNT(*) FROM edges) as edges,
        (SELECT COUNT(*) FROM hyperedges) as hyperedges
    `;
    const result = await this.pool.query(query);
    return result.rows[0];
  }
}

export default PostgreSQLBackend;
