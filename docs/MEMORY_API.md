# Memory API Reference

Complete API surface for Mathison's governed memory graph system. All endpoints are protected by the CIF (Content Integrity Framework) + CDI (Consent-Driven Inspection) governance pipeline.

## Table of Contents

- [Overview](#overview)
- [Read Endpoints](#read-endpoints)
- [Write Endpoints](#write-endpoints)
- [Error Codes](#error-codes)
- [Governance Behavior](#governance-behavior)
- [Examples](#examples)

## Overview

The Memory API provides a complete interface for managing a hypergraph-based memory system. The API supports:

- **Nodes**: Basic entities with typed data
- **Edges**: Binary relationships between nodes
- **Hyperedges**: N-ary relationships connecting multiple nodes
- **Search**: Full-text search across node data

All write operations are:
- **Governed**: Protected by CIF+CDI pipeline with capability checking
- **Idempotent**: Safe to retry with the same `idempotency_key`
- **Receipted**: Return cryptographic receipts with genome metadata

All responses are JSON-only (enforced by governance pipeline).

## Read Endpoints

### GET /memory/nodes/:id

Retrieve a node by ID.

**Parameters:**
- `id` (path, required): Node ID

**Response (200):**
```json
{
  "id": "node-123",
  "type": "person",
  "data": {
    "name": "Alice",
    "age": 30
  },
  "metadata": {
    "created_at": "2025-12-31T12:00:00Z"
  }
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Node not found: node-123"
}
```

**CDI Action:** `memory_read_node`

---

### GET /memory/nodes/:id/edges

Retrieve all edges connected to a node (both incoming and outgoing).

**Parameters:**
- `id` (path, required): Node ID

**Response (200):**
```json
{
  "node_id": "node-123",
  "count": 2,
  "edges": [
    {
      "id": "edge-1",
      "source": "node-123",
      "target": "node-456",
      "type": "knows",
      "metadata": {}
    },
    {
      "id": "edge-2",
      "source": "node-789",
      "target": "node-123",
      "type": "follows"
    }
  ]
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Node not found: node-123"
}
```

**CDI Action:** `memory_read_edges`

---

### GET /memory/edges/:id

Retrieve an edge by ID.

**Parameters:**
- `id` (path, required): Edge ID

**Response (200):**
```json
{
  "id": "edge-123",
  "source": "node-1",
  "target": "node-2",
  "type": "depends_on",
  "metadata": {
    "weight": 0.8
  }
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Edge not found: edge-123"
}
```

**CDI Action:** `memory_read_edge`

---

### GET /memory/hyperedges/:id

Retrieve a hyperedge by ID.

**Parameters:**
- `id` (path, required): Hyperedge ID

**Response (200):**
```json
{
  "id": "hyperedge-123",
  "nodes": ["node-1", "node-2", "node-3"],
  "type": "collaboration",
  "metadata": {
    "project": "Project X"
  }
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Hyperedge not found: hyperedge-123"
}
```

**CDI Action:** `memory_read_hyperedge`

---

### GET /memory/nodes/:id/hyperedges

Retrieve all hyperedges containing a specific node.

**Parameters:**
- `id` (path, required): Node ID

**Response (200):**
```json
{
  "node_id": "node-123",
  "count": 1,
  "hyperedges": [
    {
      "id": "hyperedge-1",
      "nodes": ["node-123", "node-456", "node-789"],
      "type": "team",
      "metadata": {}
    }
  ]
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Node not found: node-123"
}
```

**CDI Action:** `memory_read_hyperedges`

---

### GET /memory/search

Search for nodes using full-text search.

**Parameters:**
- `q` (query, required): Search query string
- `limit` (query, optional): Maximum results (1-100, default: 10)

**Response (200):**
```json
{
  "query": "alice",
  "limit": 10,
  "count": 2,
  "results": [
    {
      "id": "node-1",
      "type": "person",
      "data": {
        "name": "Alice"
      }
    },
    {
      "id": "node-2",
      "type": "person",
      "data": {
        "name": "Alice B."
      }
    }
  ]
}
```

**Response (400):**
```json
{
  "reason_code": "MALFORMED_REQUEST",
  "message": "Missing or empty query parameter \"q\""
}
```

**CDI Action:** `memory_search`

---

## Write Endpoints

All write endpoints require an `idempotency_key` and produce receipts containing:
- `genome_id`: Hash of the active genome
- `genome_version`: Version of the genome
- `reason_code`: Governance decision reason
- `content_hash`: Hash of the payload

### POST /memory/nodes

Create a new node.

**Request Body:**
```json
{
  "id": "node-123",
  "type": "person",
  "data": {
    "name": "Alice",
    "age": 30
  },
  "metadata": {
    "created_at": "2025-12-31T12:00:00Z"
  },
  "idempotency_key": "create-alice-2025-12-31"
}
```

**Fields:**
- `id` (optional): Node ID (auto-generated if not provided)
- `type` (required): Node type
- `data` (optional): Node data object
- `metadata` (optional): Node metadata
- `idempotency_key` (required): Idempotency key for safe retries

**Response (201):**
```json
{
  "node": {
    "id": "node-123",
    "type": "person",
    "data": {
      "name": "Alice",
      "age": 30
    }
  },
  "created": true,
  "receipt": {
    "action": "MEMORY_NODE_CREATE",
    "decision": "ALLOW",
    "genome_id": "sha256:abc123...",
    "genome_version": "1.0.0",
    "reason_code": "ALLOWED_BY_CAPABILITY",
    "content_hash": "sha256:def456...",
    "timestamp": 1735642800000,
    "job_id": "memory",
    "stage": "memory_write",
    "policy_id": "default",
    "store_backend": "FILE"
  }
}
```

**Response (400):**
```json
{
  "reason_code": "MALFORMED_REQUEST",
  "message": "Missing or empty required field: idempotency_key"
}
```

**Response (409):**
```json
{
  "reason_code": "MALFORMED_REQUEST",
  "message": "Node node-123 already exists with different payload"
}
```

**CDI Action:** `memory_create_node`
**ActionGate Action:** `MEMORY_NODE_CREATE`

---

### POST /memory/edges

Create a new edge between two nodes.

**Request Body:**
```json
{
  "from": "node-1",
  "to": "node-2",
  "type": "knows",
  "metadata": {
    "since": "2020-01-01"
  },
  "idempotency_key": "edge-knows-2025-12-31"
}
```

**Fields:**
- `from` (required): Source node ID (must exist)
- `to` (required): Target node ID (must exist)
- `type` (required): Edge type
- `metadata` (optional): Edge metadata
- `idempotency_key` (required): Idempotency key

**Response (201):**
```json
{
  "edge": {
    "id": "edge-1735642800-xyz",
    "source": "node-1",
    "target": "node-2",
    "type": "knows",
    "metadata": {
      "since": "2020-01-01"
    }
  },
  "created": true,
  "receipt": {
    "action": "MEMORY_EDGE_CREATE",
    "decision": "ALLOW",
    "genome_id": "sha256:abc123...",
    "genome_version": "1.0.0",
    "reason_code": "ALLOWED_BY_CAPABILITY",
    "content_hash": "sha256:ghi789...",
    "timestamp": 1735642800000
  }
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Source node not found: node-1"
}
```

**CDI Action:** `memory_create_edge`
**ActionGate Action:** `MEMORY_EDGE_CREATE`

---

### POST /memory/hyperedges

Create a new hyperedge connecting multiple nodes.

**Request Body:**
```json
{
  "nodes": ["node-1", "node-2", "node-3"],
  "type": "collaboration",
  "metadata": {
    "project": "Project X",
    "start_date": "2025-01-01"
  },
  "idempotency_key": "hyperedge-project-x"
}
```

**Fields:**
- `nodes` (required): Array of node IDs (must be non-empty, all nodes must exist)
- `type` (required): Hyperedge type
- `metadata` (optional): Hyperedge metadata
- `idempotency_key` (required): Idempotency key

**Response (201):**
```json
{
  "hyperedge": {
    "id": "hyperedge-1735642800-abc",
    "nodes": ["node-1", "node-2", "node-3"],
    "type": "collaboration",
    "metadata": {
      "project": "Project X"
    }
  },
  "created": true,
  "receipt": {
    "action": "MEMORY_HYPEREDGE_CREATE",
    "decision": "ALLOW",
    "genome_id": "sha256:abc123...",
    "genome_version": "1.0.0",
    "reason_code": "ALLOWED_BY_CAPABILITY",
    "content_hash": "sha256:jkl012...",
    "timestamp": 1735642800000
  }
}
```

**Response (400):**
```json
{
  "reason_code": "MALFORMED_REQUEST",
  "message": "Missing or invalid required field: nodes (must be non-empty array)"
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Node not found: node-1"
}
```

**CDI Action:** `memory_create_hyperedge`
**ActionGate Action:** `MEMORY_HYPEREDGE_CREATE`

---

### POST /memory/nodes/:id

Update an existing node.

**Parameters:**
- `id` (path, required): Node ID to update

**Request Body:**
```json
{
  "type": "person",
  "data": {
    "name": "Alice",
    "age": 31
  },
  "idempotency_key": "update-alice-age"
}
```

**Fields:**
- `type` (optional): New node type (defaults to existing)
- `data` (optional): New node data (defaults to existing)
- `metadata` (optional): New metadata (defaults to existing)
- `idempotency_key` (required): Idempotency key

**Response (200):**
```json
{
  "node": {
    "id": "node-123",
    "type": "person",
    "data": {
      "name": "Alice",
      "age": 31
    }
  },
  "updated": true,
  "receipt": {
    "action": "MEMORY_NODE_UPDATE",
    "decision": "ALLOW",
    "genome_id": "sha256:abc123...",
    "genome_version": "1.0.0",
    "reason_code": "ALLOWED_BY_CAPABILITY",
    "content_hash": "sha256:mno345...",
    "timestamp": 1735642800000
  }
}
```

**Response (404):**
```json
{
  "reason_code": "ROUTE_NOT_FOUND",
  "message": "Node not found: node-123"
}
```

**CDI Action:** `memory_update_node`
**ActionGate Action:** `MEMORY_NODE_UPDATE`

---

## Error Codes

All errors follow a consistent structure:

```json
{
  "reason_code": "ERROR_CODE",
  "message": "Human-readable description"
}
```

### Common Reason Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `ROUTE_NOT_FOUND` | 404 | Resource not found (node, edge, or hyperedge) |
| `MALFORMED_REQUEST` | 400 | Invalid request payload or missing required fields |
| `GOVERNANCE_INIT_FAILED` | 503 | Server initialization failed or component not ready |
| `CIF_INGRESS_BLOCKED` | 400 | Content Integrity Framework blocked the request |
| `CDI_ACTION_DENIED` | 403 | Consent-Driven Inspection denied the action |
| `CIF_EGRESS_BLOCKED` | 403 | Response blocked by egress checks |
| `CDI_OUTPUT_BLOCKED` | 403 | Output blocked by consent check |

---

## Governance Behavior

### CIF (Content Integrity Framework)

All requests pass through CIF ingress/egress:
- **Ingress**: Validates and sanitizes incoming payloads
- **Egress**: Validates and sanitizes outgoing responses
- **Violations**: Result in 400/403 responses with details

### CDI (Consent-Driven Inspection)

All routes are protected by CDI action checks:
- Each endpoint has a declared `action` (e.g., `memory_read_node`)
- Actions are checked against genome capabilities
- Unauthorized actions return 403 with reason

### ActionGate (Write Operations)

All write operations go through ActionGate:
- Enforces capability ceiling (genome-defined limits)
- Generates cryptographic receipts
- Provides idempotency guarantees
- Fails closed (deny by default)

### Genome Integration

Write receipts include genome metadata:
- `genome_id`: SHA256 hash of the active genome
- `genome_version`: Semantic version of the genome
- Enables auditability and versioned governance

---

## Examples

### Example: Create a Knowledge Graph

```bash
# Create nodes
curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "id": "alice",
    "type": "person",
    "data": {"name": "Alice", "role": "developer"},
    "idempotency_key": "create-alice"
  }'

curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "id": "bob",
    "type": "person",
    "data": {"name": "Bob", "role": "designer"},
    "idempotency_key": "create-bob"
  }'

curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "id": "project-x",
    "type": "project",
    "data": {"name": "Project X", "status": "active"},
    "idempotency_key": "create-project-x"
  }'

# Create edge
curl -X POST http://localhost:3000/memory/edges \
  -H "Content-Type: application/json" \
  -d '{
    "from": "alice",
    "to": "bob",
    "type": "collaborates_with",
    "idempotency_key": "alice-bob-collab"
  }'

# Create hyperedge
curl -X POST http://localhost:3000/memory/hyperedges \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": ["alice", "bob", "project-x"],
    "type": "team",
    "metadata": {"role": "core_team"},
    "idempotency_key": "project-x-team"
  }'

# Query the graph
curl http://localhost:3000/memory/nodes/alice
curl http://localhost:3000/memory/nodes/alice/edges
curl http://localhost:3000/memory/nodes/alice/hyperedges
curl http://localhost:3000/memory/search?q=developer&limit=5
```

### Example: Update a Node

```bash
# Update Alice's role
curl -X POST http://localhost:3000/memory/nodes/alice \
  -H "Content-Type: application/json" \
  -d '{
    "data": {"name": "Alice", "role": "senior developer"},
    "idempotency_key": "update-alice-role-2025-12-31"
  }'
```

### Example: Idempotency

```bash
# First request creates the node
curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-node",
    "type": "test",
    "data": {},
    "idempotency_key": "test-key-1"
  }'

# Second request with same idempotency_key returns cached response
curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-node",
    "type": "test",
    "data": {},
    "idempotency_key": "test-key-1"
  }'
```

---

## Conformance

All endpoints are covered by conformance tests in:
- `/home/user/mathison/packages/mathison-server/src/__tests__/memory-api-conformance.test.ts`

Tests verify:
- ✓ Allowed paths work correctly
- ✓ Invalid payloads are rejected (CIF)
- ✓ Write operations produce receipts with genome metadata
- ✓ Idempotency guarantees hold
- ✓ All responses are valid JSON
- ✓ Governance pipeline is enforced

---

## Version

Memory API v1.0 (Phase 1: Complete Surface)
Mathison Server v1.0.3
