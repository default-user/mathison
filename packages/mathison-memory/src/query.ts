/**
 * Query DSL for Graph Pattern Matching
 * Phase 4: Memory graph intelligence
 */

import { Node, Edge, MemoryBackend } from './index';
import { GraphTraversal } from './traversal';

export interface NodePattern {
  type?: string | string[];
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  id?: string;
}

export interface EdgePattern {
  type?: string | string[];
  direction?: 'outbound' | 'inbound' | 'both';
  metadata?: Record<string, unknown>;
}

export interface PathPattern {
  start: NodePattern;
  edges?: EdgePattern[];
  end?: NodePattern;
  minLength?: number;
  maxLength?: number;
}

export interface QueryResult {
  nodes: Node[];
  edges: Edge[];
  paths?: Array<{ nodes: Node[]; edges: Edge[] }>;
}

export class GraphQuery {
  private traversal: GraphTraversal;

  constructor(private backend: MemoryBackend) {
    this.traversal = new GraphTraversal(backend);
  }

  /**
   * Find nodes matching a pattern
   */
  async findNodes(pattern: NodePattern): Promise<Node[]> {
    const allNodes = await this.backend.getAllNodes();
    return allNodes.filter(node => this.matchesNodePattern(node, pattern));
  }

  /**
   * Find edges matching a pattern
   */
  async findEdges(pattern: EdgePattern): Promise<Edge[]> {
    const allEdges = await this.backend.getAllEdges();
    return allEdges.filter(edge => this.matchesEdgePattern(edge, pattern));
  }

  /**
   * Find paths matching a pattern
   */
  async findPaths(pattern: PathPattern): Promise<QueryResult> {
    const startNodes = await this.findNodes(pattern.start);
    const paths: Array<{ nodes: Node[]; edges: Edge[] }> = [];
    const allMatchedNodes = new Set<string>();
    const allMatchedEdges = new Set<string>();

    for (const startNode of startNodes) {
      if (pattern.end) {
        // Find paths to specific end nodes
        const endNodes = await this.findNodes(pattern.end);

        for (const endNode of endNodes) {
          const nodePaths = await this.traversal.findAllPaths(
            startNode.id,
            endNode.id,
            pattern.maxLength ?? 5
          );

          for (const path of nodePaths) {
            if (
              (pattern.minLength === undefined || path.nodes.length >= pattern.minLength) &&
              this.matchesPathEdges(path.edges, pattern.edges)
            ) {
              paths.push({
                nodes: path.nodes,
                edges: path.edges
              });

              path.nodes.forEach(n => allMatchedNodes.add(n.id));
              path.edges.forEach(e => allMatchedEdges.add(e.id));
            }
          }
        }
      } else {
        // Find all reachable nodes from start
        const reachable = await this.traversal.bfs(startNode.id, {
          maxDepth: pattern.maxLength ?? Infinity
        });

        paths.push({
          nodes: reachable,
          edges: []
        });

        reachable.forEach(n => allMatchedNodes.add(n.id));
      }
    }

    return {
      nodes: await this.getNodesByIds(Array.from(allMatchedNodes)),
      edges: await this.getEdgesByIds(Array.from(allMatchedEdges)),
      paths
    };
  }

  /**
   * Cypher-like query: MATCH (a)-[r]->(b) WHERE ... RETURN ...
   */
  async match(query: string): Promise<QueryResult> {
    // Simple pattern matching parser
    const matchPattern = /MATCH\s+\((\w+):?(\w*)\)(?:-\[(\w+):?(\w*)\]->\((\w+):?(\w*)\))?/i;
    const wherePattern = /WHERE\s+(.+?)(?:RETURN|$)/i;

    const matchMatch = query.match(matchPattern);
    const whereMatch = query.match(wherePattern);

    if (!matchMatch) {
      throw new Error('Invalid MATCH pattern');
    }

    const [, startVar, startType, , edgeType, endVar, endType] = matchMatch;

    const pattern: PathPattern = {
      start: startType ? { type: startType } : {},
      edges: edgeType ? [{ type: edgeType }] : undefined,
      end: endVar && endType ? { type: endType } : undefined
    };

    // Apply WHERE clause
    let result = await this.findPaths(pattern);

    if (whereMatch) {
      const whereClause = whereMatch[1].trim();
      result = this.applyWhereClause(result, whereClause);
    }

    return result;
  }

  /**
   * Find subgraph around a node
   */
  async subgraph(
    centerNodeId: string,
    depth: number = 2,
    filters?: {
      nodeTypes?: string[];
      edgeTypes?: string[];
    }
  ): Promise<QueryResult> {
    const nodes = await this.traversal.bfs(centerNodeId, {
      maxDepth: depth,
      nodeTypeFilter: filters?.nodeTypes,
      edgeTypeFilter: filters?.edgeTypes
    });

    const nodeIds = new Set(nodes.map(n => n.id));
    const allEdges = await this.backend.getAllEdges();
    const edges = allEdges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes, edges };
  }

  /**
   * Find triangles (3-node cycles)
   */
  async findTriangles(): Promise<Array<{ nodes: [Node, Node, Node]; edges: [Edge, Edge, Edge] }>> {
    const triangles: Array<{ nodes: [Node, Node, Node]; edges: [Edge, Edge, Edge] }> = [];
    const allNodes = await this.backend.getAllNodes();

    for (const node1 of allNodes) {
      const neighbors1 = await this.traversal.neighborhood(node1.id, 1);

      for (const node2 of neighbors1) {
        if (node2.id <= node1.id) continue; // Avoid duplicates

        const neighbors2 = await this.traversal.neighborhood(node2.id, 1);

        for (const node3 of neighbors2) {
          if (node3.id <= node2.id) continue;

          // Check if node3 connects back to node1
          const hasPathBack = await this.traversal.hasPath(node3.id, node1.id, {
            maxDepth: 1
          });

          if (hasPathBack) {
            const edge1 = await this.findEdgeBetween(node1.id, node2.id);
            const edge2 = await this.findEdgeBetween(node2.id, node3.id);
            const edge3 = await this.findEdgeBetween(node3.id, node1.id);

            if (edge1 && edge2 && edge3) {
              triangles.push({
                nodes: [node1, node2, node3],
                edges: [edge1, edge2, edge3]
              });
            }
          }
        }
      }
    }

    return triangles;
  }

  /**
   * Find nodes with specific property values
   */
  async findByProperty(
    propertyPath: string,
    value: unknown
  ): Promise<Node[]> {
    const allNodes = await this.backend.getAllNodes();
    return allNodes.filter(node => {
      const nodeValue = this.getNestedProperty(node.data, propertyPath);
      return nodeValue === value;
    });
  }

  /**
   * Find nodes with property matching condition
   */
  async findWhere(
    condition: (node: Node) => boolean
  ): Promise<Node[]> {
    const allNodes = await this.backend.getAllNodes();
    return allNodes.filter(condition);
  }

  private matchesNodePattern(node: Node, pattern: NodePattern): boolean {
    if (pattern.id && node.id !== pattern.id) return false;

    if (pattern.type) {
      const types = Array.isArray(pattern.type) ? pattern.type : [pattern.type];
      if (!types.includes(node.type)) return false;
    }

    if (pattern.data) {
      for (const [key, value] of Object.entries(pattern.data)) {
        if (node.data[key] !== value) return false;
      }
    }

    if (pattern.metadata) {
      for (const [key, value] of Object.entries(pattern.metadata)) {
        if (!node.metadata || node.metadata[key] !== value) return false;
      }
    }

    return true;
  }

  private matchesEdgePattern(edge: Edge, pattern: EdgePattern): boolean {
    if (pattern.type) {
      const types = Array.isArray(pattern.type) ? pattern.type : [pattern.type];
      if (!types.includes(edge.type)) return false;
    }

    if (pattern.metadata) {
      for (const [key, value] of Object.entries(pattern.metadata)) {
        if (!edge.metadata || edge.metadata[key] !== value) return false;
      }
    }

    return true;
  }

  private matchesPathEdges(edges: Edge[], patterns?: EdgePattern[]): boolean {
    if (!patterns || patterns.length === 0) return true;

    // Check if all edges match at least one pattern
    return edges.every(edge =>
      patterns.some(pattern => this.matchesEdgePattern(edge, pattern))
    );
  }

  private applyWhereClause(result: QueryResult, clause: string): QueryResult {
    // Simple WHERE clause implementation
    // Supports: property = value, property > value, property < value

    const filtered = result.nodes.filter(node => {
      // Very basic parser - would need proper expression parser for production
      const match = clause.match(/(\w+)\.(\w+)\s*(=|>|<)\s*(.+)/);
      if (!match) return true;

      const [, , property, operator, valueStr] = match;
      const nodeValue = node.data[property];
      const value = this.parseValue(valueStr.trim());

      switch (operator) {
        case '=':
          return nodeValue === value;
        case '>':
          return Number(nodeValue) > Number(value);
        case '<':
          return Number(nodeValue) < Number(value);
        default:
          return true;
      }
    });

    return {
      ...result,
      nodes: filtered
    };
  }

  private async findEdgeBetween(nodeId1: string, nodeId2: string): Promise<Edge | null> {
    const edges = await this.backend.getNodeEdges(nodeId1);
    return edges.find(
      e => (e.source === nodeId1 && e.target === nodeId2) ||
           (e.source === nodeId2 && e.target === nodeId1)
    ) || null;
  }

  private async getNodesByIds(ids: string[]): Promise<Node[]> {
    const nodes: Node[] = [];
    for (const id of ids) {
      const node = await this.backend.getNode(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  private async getEdgesByIds(ids: string[]): Promise<Edge[]> {
    const edges: Edge[] = [];
    for (const id of ids) {
      const edge = await this.backend.getEdge(id);
      if (edge) edges.push(edge);
    }
    return edges;
  }

  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: any, key) => current?.[key], obj);
  }

  private parseValue(str: string): unknown {
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str === 'null') return null;
    if (/^['"].*['"]$/.test(str)) return str.slice(1, -1); // String
    if (!isNaN(Number(str))) return Number(str); // Number
    return str;
  }
}
