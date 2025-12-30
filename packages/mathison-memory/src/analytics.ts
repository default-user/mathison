/**
 * Graph Analytics
 * Phase 4: Memory graph intelligence - metrics and analysis
 */

import { Node, Edge, MemoryBackend } from './index';
import { GraphTraversal } from './traversal';

export interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  density: number;
  connectedComponents: number;
}

export interface NodeMetrics {
  degree: number;
  inDegree: number;
  outDegree: number;
  betweennessCentrality?: number;
  closenessCentrality?: number;
  pageRank?: number;
}

export class GraphAnalytics {
  private traversal: GraphTraversal;

  constructor(private backend: MemoryBackend) {
    this.traversal = new GraphTraversal(backend);
  }

  /**
   * Calculate degree (number of connections) for a node
   */
  async nodeDegree(nodeId: string): Promise<NodeMetrics> {
    const edges = await this.backend.getNodeEdges(nodeId);

    let inDegree = 0;
    let outDegree = 0;

    for (const edge of edges) {
      if (edge.target === nodeId) inDegree++;
      if (edge.source === nodeId) outDegree++;
    }

    return {
      degree: edges.length,
      inDegree,
      outDegree
    };
  }

  /**
   * Find nodes with highest degree (hub nodes)
   */
  async findHubs(limit: number = 10): Promise<Array<{ node: Node; degree: number }>> {
    const allNodes = await this.backend.getAllNodes();
    const nodeDegrees: Array<{ node: Node; degree: number }> = [];

    for (const node of allNodes) {
      const metrics = await this.nodeDegree(node.id);
      nodeDegrees.push({ node, degree: metrics.degree });
    }

    return nodeDegrees
      .sort((a, b) => b.degree - a.degree)
      .slice(0, limit);
  }

  /**
   * Calculate betweenness centrality (how often node appears in shortest paths)
   * Simplified version for performance
   */
  async betweennessCentrality(nodeId: string, sampleSize: number = 20): Promise<number> {
    const allNodes = await this.backend.getAllNodes();

    if (allNodes.length < 2) return 0;

    // Sample random node pairs
    const pairs: Array<[string, string]> = [];
    const sampleCount = Math.min(sampleSize, allNodes.length);

    for (let i = 0; i < sampleCount; i++) {
      const randomStart = allNodes[Math.floor(Math.random() * allNodes.length)];
      const randomEnd = allNodes[Math.floor(Math.random() * allNodes.length)];

      if (randomStart.id !== randomEnd.id && randomStart.id !== nodeId && randomEnd.id !== nodeId) {
        pairs.push([randomStart.id, randomEnd.id]);
      }
    }

    let pathsThrough = 0;
    let totalPaths = 0;

    for (const [startId, endId] of pairs) {
      const path = await this.traversal.shortestPath(startId, endId);

      if (path) {
        totalPaths++;
        if (path.nodes.some(n => n.id === nodeId)) {
          pathsThrough++;
        }
      }
    }

    return totalPaths > 0 ? pathsThrough / totalPaths : 0;
  }

  /**
   * Calculate closeness centrality (average distance to all other nodes)
   */
  async closenessCentrality(nodeId: string): Promise<number> {
    const allNodes = await this.backend.getAllNodes();
    let totalDistance = 0;
    let reachableCount = 0;

    for (const node of allNodes) {
      if (node.id === nodeId) continue;

      const path = await this.traversal.shortestPath(nodeId, node.id);
      if (path) {
        totalDistance += path.totalDistance;
        reachableCount++;
      }
    }

    if (reachableCount === 0) return 0;

    const avgDistance = totalDistance / reachableCount;
    return avgDistance > 0 ? 1 / avgDistance : 0;
  }

  /**
   * Find connected components in the graph
   */
  async connectedComponents(): Promise<Array<Node[]>> {
    const allNodes = await this.backend.getAllNodes();
    const visited = new Set<string>();
    const components: Array<Node[]> = [];

    for (const node of allNodes) {
      if (visited.has(node.id)) continue;

      const component = await this.traversal.bfs(node.id, {
        visitedSet: visited
      });

      if (component.length > 0) {
        components.push(component);
      }
    }

    return components;
  }

  /**
   * Calculate overall graph metrics
   */
  async graphMetrics(): Promise<GraphMetrics> {
    const nodes = await this.backend.getAllNodes();
    const edges = await this.backend.getAllEdges();

    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    // Average degree
    const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

    // Density (actual edges / possible edges)
    const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2;
    const density = maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;

    // Connected components
    const components = await this.connectedComponents();

    return {
      nodeCount,
      edgeCount,
      avgDegree,
      density,
      connectedComponents: components.length
    };
  }

  /**
   * Find clusters using simple algorithm (nodes with high interconnectivity)
   */
  async findClusters(minClusterSize: number = 3): Promise<Array<Node[]>> {
    const components = await this.connectedComponents();
    const clusters: Array<Node[]> = [];

    for (const component of components) {
      if (component.length < minClusterSize) continue;

      // Calculate density within component
      const nodeIds = new Set(component.map(n => n.id));
      let internalEdges = 0;

      for (const node of component) {
        const edges = await this.backend.getNodeEdges(node.id);
        for (const edge of edges) {
          if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
            internalEdges++;
          }
        }
      }

      internalEdges /= 2; // Each edge counted twice

      const maxEdges = (component.length * (component.length - 1)) / 2;
      const density = maxEdges > 0 ? internalEdges / maxEdges : 0;

      // If density is high enough, consider it a cluster
      if (density > 0.3) {
        clusters.push(component);
      }
    }

    return clusters;
  }

  /**
   * Find bridge edges (edges whose removal would disconnect the graph)
   */
  async findBridges(): Promise<Edge[]> {
    const edges = await this.backend.getAllEdges();
    const bridges: Edge[] = [];

    const initialComponents = await this.connectedComponents();
    const initialComponentCount = initialComponents.length;

    for (const edge of edges) {
      // Temporarily "remove" edge by checking connectivity without it
      const sourceNode = await this.backend.getNode(edge.source);
      const targetNode = await this.backend.getNode(edge.target);

      if (!sourceNode || !targetNode) continue;

      // Check if path exists without this specific edge
      const pathExists = await this.hasPathWithoutEdge(
        edge.source,
        edge.target,
        edge.id
      );

      if (!pathExists) {
        bridges.push(edge);
      }
    }

    return bridges;
  }

  private async hasPathWithoutEdge(
    startId: string,
    endId: string,
    excludeEdgeId: string
  ): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (currentId === endId) return true;

      const edges = await this.backend.getNodeEdges(currentId);

      for (const edge of edges) {
        if (edge.id === excludeEdgeId) continue; // Skip excluded edge

        const nextId = edge.source === currentId ? edge.target : edge.source;

        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }

    return false;
  }

  /**
   * Calculate similarity between two nodes based on common neighbors (Jaccard similarity)
   */
  async nodeSimilarity(nodeId1: string, nodeId2: string): Promise<number> {
    const neighbors1Set = new Set(
      (await this.traversal.neighborhood(nodeId1, 1)).map(n => n.id)
    );
    const neighbors2Set = new Set(
      (await this.traversal.neighborhood(nodeId2, 1)).map(n => n.id)
    );

    // Remove the nodes themselves
    neighbors1Set.delete(nodeId1);
    neighbors1Set.delete(nodeId2);
    neighbors2Set.delete(nodeId1);
    neighbors2Set.delete(nodeId2);

    // Calculate Jaccard similarity
    const intersection = new Set(
      [...neighbors1Set].filter(id => neighbors2Set.has(id))
    );
    const union = new Set([...neighbors1Set, ...neighbors2Set]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Recommend similar nodes based on common neighbors
   */
  async recommendSimilarNodes(
    nodeId: string,
    limit: number = 10
  ): Promise<Array<{ node: Node; similarity: number }>> {
    const allNodes = await this.backend.getAllNodes();
    const similarities: Array<{ node: Node; similarity: number }> = [];

    for (const node of allNodes) {
      if (node.id === nodeId) continue;

      const similarity = await this.nodeSimilarity(nodeId, node.id);
      if (similarity > 0) {
        similarities.push({ node, similarity });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}
