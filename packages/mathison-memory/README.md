# Mathison Memory

Graph/Hypergraph memory system with pluggable storage backends.

## Features

- **Nodes, Edges, Hyperedges**: Full hypergraph support
- **Pluggable Backends**: In-memory (default) or PostgreSQL
- **Search**: Full-text search across node data
- **Migrations**: Versioned schema migrations for PostgreSQL
- **Type-safe**: Full TypeScript support

## Quick Start

### In-Memory Backend (Default)

```typescript
import { MemoryGraph, Node } from 'mathison-memory';

const graph = new MemoryGraph();
await graph.initialize();

const node: Node = {
  id: 'concept-1',
  type: 'concept',
  data: { name: 'AI', description: 'Artificial Intelligence' }
};

graph.addNode(node);
const results = graph.search('intelligence', 10);
```

### PostgreSQL Backend

```typescript
import { MemoryGraph, PostgreSQLBackend } from 'mathison-memory';

const backend = new PostgreSQLBackend({
  host: 'localhost',
  port: 5432,
  database: 'mathison',
  user: 'mathison',
  password: 'your-password'
});

const graph = new MemoryGraph(backend);
await graph.initialize();

// Use async API for PostgreSQL
const node = await graph.getNodeAsync('concept-1');
const edges = await graph.getNodeEdgesAsync('concept-1');
const results = await graph.searchAsync('intelligence', 10);
```

## PostgreSQL Setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Run Migrations

```bash
cd packages/mathison-memory
npm run migrate
```

Or programmatically:

```typescript
import { MigrationRunner } from 'mathison-memory';

const runner = new MigrationRunner({
  host: 'localhost',
  port: 5432,
  database: 'mathison',
  user: 'mathison',
  password: 'your-password'
});

await runner.runMigrations('./migrations');
await runner.shutdown();
```

### 3. Environment Variables

```bash
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=mathison
export PGUSER=mathison
export PGPASSWORD=your-password
```

## Schema

### Nodes

```typescript
interface Node {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

### Edges

```typescript
interface Edge {
  id: string;
  source: string;  // node ID
  target: string;  // node ID
  type: string;
  metadata?: Record<string, unknown>;
}
```

### Hyperedges

```typescript
interface Hyperedge {
  id: string;
  nodes: string[];  // array of node IDs
  type: string;
  metadata?: Record<string, unknown>;
}
```

## API Reference

### MemoryGraph

#### Synchronous API (In-Memory)

- `addNode(node: Node): void`
- `getNode(id: string): Node | undefined`
- `getNodeEdges(nodeId: string): Edge[]`
- `addEdge(edge: Edge): void`
- `addHyperedge(hyperedge: Hyperedge): void`
- `search(query: string, limit?: number): Node[]`

#### Async API (PostgreSQL)

- `getNodeAsync(id: string): Promise<Node | null>`
- `getNodeEdgesAsync(nodeId: string): Promise<Edge[]>`
- `searchAsync(query: string, limit?: number): Promise<Node[]>`

### PostgreSQLBackend

Implements all CRUD operations with connection pooling:

- `initialize(): Promise<void>`
- `shutdown(): Promise<void>`
- `addNode(node: Node): Promise<void>`
- `getNode(id: string): Promise<Node | null>`
- `getAllNodes(): Promise<Node[]>`
- `deleteNode(id: string): Promise<boolean>`
- `addEdge(edge: Edge): Promise<void>`
- `getEdge(id: string): Promise<Edge | null>`
- `getNodeEdges(nodeId: string): Promise<Edge[]>`
- `getAllEdges(): Promise<Edge[]>`
- `deleteEdge(id: string): Promise<boolean>`
- `addHyperedge(hyperedge: Hyperedge): Promise<void>`
- `getHyperedge(id: string): Promise<Hyperedge | null>`
- `getAllHyperedges(): Promise<Hyperedge[]>`
- `deleteHyperedge(id: string): Promise<boolean>`
- `search(query: string, limit: number): Promise<Node[]>`

## Testing

### Integration Test (Requires PostgreSQL)

```bash
# Start PostgreSQL
docker compose up -d

# Run test
cd packages/mathison-memory
npx ts-node src/test-postgresql.ts
```

Test coverage:
- ✓ Schema migrations
- ✓ Node CRUD operations
- ✓ Edge CRUD operations
- ✓ Hyperedge CRUD operations
- ✓ Full-text search
- ✓ Data persistence across reconnections
- ✓ Connection pooling

## PostgreSQL Schema Details

### Tables

- `nodes`: Core node storage with JSONB data
- `edges`: Binary relationships between nodes
- `hyperedges`: N-ary relationship metadata
- `hyperedge_nodes`: Junction table for hyperedge members
- `schema_migrations`: Migration version tracking

### Indexes

- GIN index on node data (JSONB path ops)
- GIN index for full-text search (tsvector)
- B-tree indexes on foreign keys and type columns
- Composite index on (source, target) for edges

### Features

- Automatic `updated_at` timestamps via triggers
- Cascade delete on foreign keys
- Summary views for node and edge statistics

## Performance

### In-Memory Backend

- O(1) node/edge/hyperedge lookup by ID
- O(n) search with simple string matching
- No persistence

### PostgreSQL Backend

- O(log n) indexed lookups
- O(1) full-text search with GIN indexes
- Connection pooling (default: 20 connections)
- Persistent storage with ACID guarantees

## Architecture

```
MemoryGraph
    ↓ uses
MemoryBackend (interface)
    ↓ implements
InMemoryBackend | PostgreSQLBackend
```

Backend abstraction allows:
- Testing with in-memory backend
- Production use with PostgreSQL
- Future backends (Redis, Neo4j, etc.)

## Migration Strategy

Migrations are SQL files in `migrations/` directory:

```
migrations/
  001_initial_schema.sql
  002_add_indexes.sql
  ...
```

Migration runner:
- Tracks applied migrations in `schema_migrations` table
- Applies new migrations in lexicographic order
- Wraps each migration in a transaction
- Idempotent (safe to run multiple times)

## License

MIT
