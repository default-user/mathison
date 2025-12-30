# Graph Intelligence API

**Phase 4-C: HTTP endpoints for graph traversal, analytics, and query DSL**

## Overview

The Graph Intelligence API exposes powerful graph algorithms and pattern matching capabilities over the memory graph. All endpoints are **read-only** and governed by the CIF/CDI pipeline.

Base URL: `http://localhost:3000`

---

## Traversal API

### POST /memory/traversal/bfs

Breadth-first search from a starting node.

**Request:**
```json
{
  "startNodeId": "node-123",
  "maxDepth": 3,
  "nodeTypeFilter": ["concept", "entity"],
  "edgeTypeFilter": ["related_to"]
}
```

**Response:**
```json
{
  "startNodeId": "node-123",
  "count": 15,
  "nodes": [
    {
      "id": "node-123",
      "type": "concept",
      "data": {...},
      "metadata": {...}
    },
    ...
  ]
}
```

**Parameters:**
- `startNodeId` (required): Node ID to start traversal
- `maxDepth` (optional): Maximum depth to traverse (default: Infinity)
- `nodeTypeFilter` (optional): Array of node types to include
- `edgeTypeFilter` (optional): Array of edge types to traverse

---

### POST /memory/traversal/dfs

Depth-first search from a starting node.

**Request:**
```json
{
  "startNodeId": "node-123",
  "maxDepth": 5
}
```

**Response:** Same format as BFS

---

### POST /memory/traversal/shortest-path

Find shortest path between two nodes using Dijkstra's algorithm.

**Request:**
```json
{
  "startNodeId": "node-123",
  "endNodeId": "node-456"
}
```

**Response:**
```json
{
  "startNodeId": "node-123",
  "endNodeId": "node-456",
  "distance": 3,
  "path": {
    "nodes": [...],
    "edges": [...]
  }
}
```

**Error (404):** No path found
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "No path found between node-123 and node-456"
}
```

---

### POST /memory/traversal/neighborhood

Get nodes within N hops of a center node.

**Request:**
```json
{
  "nodeId": "node-123",
  "depth": 2
}
```

**Response:**
```json
{
  "nodeId": "node-123",
  "depth": 2,
  "count": 8,
  "neighbors": [...]
}
```

**Parameters:**
- `nodeId` (required): Center node ID
- `depth` (optional): Number of hops (default: 1)

---

## Analytics API

### GET /memory/analytics/node/:id/degree

Calculate degree metrics for a node.

**Response:**
```json
{
  "nodeId": "node-123",
  "metrics": {
    "degree": 15,
    "inDegree": 8,
    "outDegree": 7
  }
}
```

---

### GET /memory/analytics/node/:id/centrality

Calculate centrality metrics for a node.

**Query Parameters:**
- `sampleSize` (optional): Sample size for betweenness calculation (default: 20)

**Response:**
```json
{
  "nodeId": "node-123",
  "centrality": {
    "degree": 0.75,
    "betweenness": 0.42,
    "closeness": 0.68
  }
}
```

**Metrics:**
- `degree`: Degree centrality (normalized by graph size)
- `betweenness`: Fraction of shortest paths passing through node (sampled)
- `closeness`: Inverse of average distance to all nodes

---

### GET /memory/analytics/hubs

Find hub nodes (highest degree).

**Query Parameters:**
- `limit` (optional): Number of hubs to return (default: 10)

**Response:**
```json
{
  "count": 10,
  "hubs": [
    {
      "node": {...},
      "degree": 42
    },
    ...
  ]
}
```

---

### GET /memory/analytics/components

Find connected components in the graph.

**Response:**
```json
{
  "count": 3,
  "components": [
    {
      "size": 150,
      "nodes": [...]
    },
    {
      "size": 42,
      "nodes": [...]
    },
    {
      "size": 5,
      "nodes": [...]
    }
  ]
}
```

---

### GET /memory/analytics/metrics

Get overall graph metrics.

**Response:**
```json
{
  "metrics": {
    "nodeCount": 250,
    "edgeCount": 480,
    "density": 0.015,
    "avgDegree": 3.84,
    "avgClusteringCoefficient": 0.32
  }
}
```

---

## Query DSL API

### POST /memory/query/match

Execute Cypher-like pattern matching query.

**Request:**
```json
{
  "query": "MATCH (a:Person)-[r:knows]->(b:Person) WHERE a.age > 30 RETURN *"
}
```

**Response:**
```json
{
  "query": "MATCH (a:Person)-[r:knows]->(b:Person) WHERE a.age > 30 RETURN *",
  "nodeCount": 15,
  "edgeCount": 8,
  "pathCount": 8,
  "result": {
    "nodes": [...],
    "edges": [...],
    "paths": [...]
  }
}
```

**Supported Query Syntax:**
- `MATCH (a:Type1)-[r:RelType]->(b:Type2)`
- `WHERE a.property > value`
- Simple pattern matching only (subset of Cypher)

---

### POST /memory/query/pattern

Declarative pattern matching with structured query.

**Request:**
```json
{
  "pattern": {
    "start": {
      "type": "Person",
      "data": {
        "city": "San Francisco"
      }
    },
    "edges": [
      {
        "type": "works_at"
      }
    ],
    "end": {
      "type": "Company"
    },
    "maxLength": 3
  }
}
```

**Response:**
```json
{
  "pattern": {...},
  "nodeCount": 20,
  "edgeCount": 15,
  "pathCount": 15,
  "result": {
    "nodes": [...],
    "edges": [...],
    "paths": [...]
  }
}
```

**Pattern Structure:**
- `start` (required): NodePattern for starting nodes
- `edges` (optional): Array of EdgePattern to match
- `end` (optional): NodePattern for ending nodes
- `minLength` (optional): Minimum path length
- `maxLength` (optional): Maximum path length

**NodePattern:**
```typescript
{
  type?: string | string[];      // Node type(s)
  data?: Record<string, unknown>; // Data filters
  metadata?: Record<string, unknown>;
  id?: string;                    // Exact node ID
}
```

**EdgePattern:**
```typescript
{
  type?: string | string[];      // Edge type(s)
  direction?: 'outbound' | 'inbound' | 'both';
  metadata?: Record<string, unknown>;
}
```

---

### POST /memory/query/subgraph

Extract subgraph around a center node.

**Request:**
```json
{
  "centerNodeId": "node-123",
  "depth": 2,
  "filters": {
    "nodeTypes": ["Person", "Company"],
    "edgeTypes": ["works_at", "knows"]
  }
}
```

**Response:**
```json
{
  "centerNodeId": "node-123",
  "depth": 2,
  "nodeCount": 25,
  "edgeCount": 40,
  "result": {
    "nodes": [...],
    "edges": [...]
  }
}
```

---

### GET /memory/query/triangles

Find all triangles (3-node cycles) in the graph.

**Response:**
```json
{
  "count": 12,
  "triangles": [
    {
      "nodes": [
        {...}, {...}, {...}
      ],
      "edges": [
        {...}, {...}, {...}
      ]
    },
    ...
  ]
}
```

**Note:** This operation can be expensive on large graphs. Consider using filters or sampling for production graphs with >1000 nodes.

---

## Error Responses

All endpoints follow standard error format:

**400 Bad Request:**
```json
{
  "reason_code": "MALFORMED_REQUEST",
  "message": "Missing or invalid required field: startNodeId"
}
```

**404 Not Found:**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Node not found: node-123"
}
```

**500 Internal Server Error:**
```json
{
  "reason_code": "GOVERNANCE_INIT_FAILED",
  "message": "BFS traversal failed: <error details>"
}
```

**503 Service Unavailable:**
```json
{
  "reason_code": "GOVERNANCE_INIT_FAILED",
  "message": "MemoryGraph not initialized"
}
```

---

## Governance

All graph intelligence endpoints pass through:

1. **CIF Ingress** - Input sanitization, rate limiting
2. **CDI Action Check** - Governance approval for the action
3. **Computation** - Graph algorithm execution
4. **CDI Output Check** - Ensure compliant output
5. **CIF Egress** - PII/secret scrubbing, audit logging

Actions tracked:
- `memory_traversal_bfs`
- `memory_traversal_dfs`
- `memory_traversal_shortest_path`
- `memory_traversal_neighborhood`
- `memory_analytics_degree`
- `memory_analytics_centrality`
- `memory_analytics_hubs`
- `memory_analytics_components`
- `memory_analytics_metrics`
- `memory_query_match`
- `memory_query_pattern`
- `memory_query_subgraph`
- `memory_query_triangles`

---

## Performance Considerations

**Expensive Operations:**
- Triangle detection: O(n³) worst case
- Betweenness centrality: O(n²) even with sampling
- Pattern matching with many results: O(n × m)

**Recommendations:**
- Use `maxDepth` to limit traversal scope
- Apply `nodeTypeFilter` and `edgeTypeFilter` to reduce search space
- Use `sampleSize` parameter for centrality calculations
- Consider caching results for expensive queries
- Monitor graph size; algorithms scale differently (BFS is O(V+E), triangle detection is O(V³))

---

## Examples

### Example 1: Find shortest path between two people

```bash
curl -X POST http://localhost:3000/memory/traversal/shortest-path \
  -H "Content-Type: application/json" \
  -d '{
    "startNodeId": "person-alice",
    "endNodeId": "person-bob"
  }'
```

### Example 2: Get all companies within 3 hops

```bash
curl -X POST http://localhost:3000/memory/traversal/bfs \
  -H "Content-Type: application/json" \
  -d '{
    "startNodeId": "company-acme",
    "maxDepth": 3,
    "nodeTypeFilter": ["Company"]
  }'
```

### Example 3: Find influential people (high betweenness centrality)

```bash
# First, get hubs (high degree)
curl http://localhost:3000/memory/analytics/hubs?limit=5

# Then, calculate centrality for each hub
curl http://localhost:3000/memory/analytics/node/person-123/centrality
```

### Example 4: Find people who know each other and work at the same company

```bash
curl -X POST http://localhost:3000/memory/query/pattern \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": {
      "start": {
        "type": "Person"
      },
      "edges": [
        { "type": "knows" },
        { "type": "works_at" }
      ],
      "end": {
        "type": "Company"
      }
    }
  }'
```

---

## See Also

- [Memory API (CRUD operations)](./api-memory.md)
- [Architecture Overview](./architecture.md)
- [Graph Intelligence Algorithms](../packages/mathison-memory/src/README.md)

---

**Version:** 0.1.0 (Phase 4-C)
**Status:** Production-ready
