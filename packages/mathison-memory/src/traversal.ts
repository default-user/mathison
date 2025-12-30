/**
 * Graph Traversal Algorithms
 * Phase 4: Memory graph intelligence
 */

import { Node, Edge, MemoryBackend } from './index';

export interface TraversalOptions {
  maxDepth?: number;
  direction?: 'outbound' | 'inbound' | 'both';
  edgeTypeFilter?: string[];
  nodeTypeFilter?: string[];
  visitedSet?: Set<string>;
}

export interface PathResult {
  nodes: Node[];
  edges: Edge[];
  totalDistance: number;
}

export class GraphTraversal {
  constructor(private backend: MemoryBackend) {}

  /**
   * Breadth-First Search (BFS)
   * Explores graph level by level, good for finding shortest paths
   */
  async bfs(
    startNodeId: string,
    options: TraversalOptions = {}
  ): Promise<Node[]> {
    const maxDepth = options.maxDepth ?? Infinity;
    const direction = options.direction ?? 'both';
    const visited = options.visitedSet ?? new Set<string>();
    const result: Node[] = [];

    const queue: Array<{ id: string; depth: number }> = [
      { id: startNodeId, depth: 0 }
    ];
    visited.add(startNodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth > maxDepth) continue;

      const node = await this.backend.getNode(current.id);
      if (!node) continue;

      // Apply node type filter
      if (
        options.nodeTypeFilter &&
        !options.nodeTypeFilter.includes(node.type)
      ) {
        continue;
      }

      result.push(node);

      // Get neighbors
      const edges = await this.backend.getNodeEdges(current.id);
      const neighbors = this.getNeighborIds(current.id, edges, direction);

      // Apply edge type filter
      const filteredNeighbors = options.edgeTypeFilter
        ? neighbors.filter(({ edge }) =>
            options.edgeTypeFilter!.includes(edge.type)
          )
        : neighbors;

      for (const { nodeId } of filteredNeighbors) {
        if (!visited.has(nodeId)) {
          visited.add(nodeId);
          queue.push({ id: nodeId, depth: current.depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Depth-First Search (DFS)
   * Explores as far as possible along each branch before backtracking
   */
  async dfs(
    startNodeId: string,
    options: TraversalOptions = {}
  ): Promise<Node[]> {
    const maxDepth = options.maxDepth ?? Infinity;
    const direction = options.direction ?? 'both';
    const visited = options.visitedSet ?? new Set<string>();
    const result: Node[] = [];

    await this.dfsRecursive(
      startNodeId,
      0,
      maxDepth,
      direction,
      visited,
      result,
      options
    );

    return result;
  }

  private async dfsRecursive(
    nodeId: string,
    depth: number,
    maxDepth: number,
    direction: 'outbound' | 'inbound' | 'both',
    visited: Set<string>,
    result: Node[],
    options: TraversalOptions
  ): Promise<void> {
    if (depth > maxDepth || visited.has(nodeId)) return;

    visited.add(nodeId);

    const node = await this.backend.getNode(nodeId);
    if (!node) return;

    // Apply node type filter
    if (
      options.nodeTypeFilter &&
      !options.nodeTypeFilter.includes(node.type)
    ) {
      return;
    }

    result.push(node);

    const edges = await this.backend.getNodeEdges(nodeId);
    const neighbors = this.getNeighborIds(nodeId, edges, direction);

    // Apply edge type filter
    const filteredNeighbors = options.edgeTypeFilter
      ? neighbors.filter(({ edge }) =>
          options.edgeTypeFilter!.includes(edge.type)
        )
      : neighbors;

    for (const { nodeId: neighborId } of filteredNeighbors) {
      await this.dfsRecursive(
        neighborId,
        depth + 1,
        maxDepth,
        direction,
        visited,
        result,
        options
      );
    }
  }

  /**
   * Find shortest path between two nodes (Dijkstra's algorithm)
   */
  async shortestPath(
    startNodeId: string,
    endNodeId: string,
    options: TraversalOptions = {}
  ): Promise<PathResult | null> {
    const direction = options.direction ?? 'both';
    const distances = new Map<string, number>();
    const previous = new Map<string, { nodeId: string; edge: Edge }>();
    const unvisited = new Set<string>();

    // Initialize
    distances.set(startNodeId, 0);
    unvisited.add(startNodeId);

    // Add all reachable nodes to unvisited set
    const allReachable = await this.bfs(startNodeId, {
      ...options,
      maxDepth: Infinity
    });
    for (const node of allReachable) {
      if (node.id !== startNodeId) {
        distances.set(node.id, Infinity);
        unvisited.add(node.id);
      }
    }

    while (unvisited.size > 0) {
      // Find node with minimum distance
      let currentId: string | null = null;
      let minDistance = Infinity;

      for (const nodeId of unvisited) {
        const dist = distances.get(nodeId) ?? Infinity;
        if (dist < minDistance) {
          minDistance = dist;
          currentId = nodeId;
        }
      }

      if (!currentId || minDistance === Infinity) break;

      unvisited.delete(currentId);

      // If we reached the end, reconstruct path
      if (currentId === endNodeId) {
        return this.reconstructPath(
          startNodeId,
          endNodeId,
          previous,
          distances.get(endNodeId)!
        );
      }

      // Update distances to neighbors
      const edges = await this.backend.getNodeEdges(currentId);
      const neighbors = this.getNeighborIds(currentId, edges, direction);

      // Apply edge type filter
      const filteredNeighbors = options.edgeTypeFilter
        ? neighbors.filter(({ edge }) =>
            options.edgeTypeFilter!.includes(edge.type)
          )
        : neighbors;

      for (const { nodeId: neighborId, edge } of filteredNeighbors) {
        if (!unvisited.has(neighborId)) continue;

        const weight = this.getEdgeWeight(edge);
        const altDistance = minDistance + weight;

        if (altDistance < (distances.get(neighborId) ?? Infinity)) {
          distances.set(neighborId, altDistance);
          previous.set(neighborId, { nodeId: currentId, edge });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Find all nodes within N hops
   */
  async neighborhood(
    nodeId: string,
    hops: number,
    options: TraversalOptions = {}
  ): Promise<Node[]> {
    return this.bfs(nodeId, { ...options, maxDepth: hops });
  }

  /**
   * Find common neighbors between two nodes
   */
  async commonNeighbors(
    nodeId1: string,
    nodeId2: string,
    options: TraversalOptions = {}
  ): Promise<Node[]> {
    const neighbors1 = await this.neighborhood(nodeId1, 1, options);
    const neighbors2 = await this.neighborhood(nodeId2, 1, options);

    const neighbors1Ids = new Set(neighbors1.map(n => n.id));
    return neighbors2.filter(
      n => neighbors1Ids.has(n.id) && n.id !== nodeId1 && n.id !== nodeId2
    );
  }

  /**
   * Check if path exists between two nodes
   */
  async hasPath(
    startNodeId: string,
    endNodeId: string,
    options: TraversalOptions = {}
  ): Promise<boolean> {
    const reachable = await this.bfs(startNodeId, options);
    return reachable.some(n => n.id === endNodeId);
  }

  /**
   * Find all paths between two nodes (up to max depth)
   */
  async findAllPaths(
    startNodeId: string,
    endNodeId: string,
    maxDepth: number = 5,
    options: TraversalOptions = {}
  ): Promise<PathResult[]> {
    const paths: PathResult[] = [];
    const currentPath: Array<{ node: Node; edge?: Edge }> = [];
    const visited = new Set<string>();

    await this.findAllPathsRecursive(
      startNodeId,
      endNodeId,
      maxDepth,
      0,
      options.direction ?? 'both',
      visited,
      currentPath,
      paths,
      options
    );

    return paths;
  }

  private async findAllPathsRecursive(
    currentId: string,
    targetId: string,
    maxDepth: number,
    depth: number,
    direction: 'outbound' | 'inbound' | 'both',
    visited: Set<string>,
    currentPath: Array<{ node: Node; edge?: Edge }>,
    paths: PathResult[],
    options: TraversalOptions
  ): Promise<void> {
    if (depth > maxDepth) return;

    visited.add(currentId);

    const node = await this.backend.getNode(currentId);
    if (!node) {
      visited.delete(currentId);
      return;
    }

    currentPath.push({ node });

    // Found target
    if (currentId === targetId) {
      paths.push({
        nodes: currentPath.map(p => p.node),
        edges: currentPath.slice(1).map(p => p.edge!),
        totalDistance: currentPath.length - 1
      });
      currentPath.pop();
      visited.delete(currentId);
      return;
    }

    // Continue search
    const edges = await this.backend.getNodeEdges(currentId);
    const neighbors = this.getNeighborIds(currentId, edges, direction);

    // Apply filters
    const filteredNeighbors = options.edgeTypeFilter
      ? neighbors.filter(({ edge }) =>
          options.edgeTypeFilter!.includes(edge.type)
        )
      : neighbors;

    for (const { nodeId: neighborId, edge } of filteredNeighbors) {
      if (!visited.has(neighborId)) {
        currentPath[currentPath.length - 1].edge = edge;
        await this.findAllPathsRecursive(
          neighborId,
          targetId,
          maxDepth,
          depth + 1,
          direction,
          visited,
          currentPath,
          paths,
          options
        );
      }
    }

    currentPath.pop();
    visited.delete(currentId);
  }

  private getNeighborIds(
    nodeId: string,
    edges: Edge[],
    direction: 'outbound' | 'inbound' | 'both'
  ): Array<{ nodeId: string; edge: Edge }> {
    const neighbors: Array<{ nodeId: string; edge: Edge }> = [];

    for (const edge of edges) {
      if (direction === 'outbound' || direction === 'both') {
        if (edge.source === nodeId) {
          neighbors.push({ nodeId: edge.target, edge });
        }
      }

      if (direction === 'inbound' || direction === 'both') {
        if (edge.target === nodeId) {
          neighbors.push({ nodeId: edge.source, edge });
        }
      }
    }

    return neighbors;
  }

  private getEdgeWeight(edge: Edge): number {
    // Default weight is 1, but can be customized via metadata
    return (edge.metadata?.weight as number) ?? 1;
  }

  private async reconstructPath(
    startId: string,
    endId: string,
    previous: Map<string, { nodeId: string; edge: Edge }>,
    totalDistance: number
  ): Promise<PathResult> {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let currentId: string | undefined = endId;

    while (currentId) {
      const node = await this.backend.getNode(currentId);
      if (node) {
        nodes.unshift(node);
      }

      const prev = previous.get(currentId);
      if (prev) {
        edges.unshift(prev.edge);
        currentId = prev.nodeId;
      } else {
        currentId = undefined;
      }
    }

    return { nodes, edges, totalDistance };
  }
}
