# Mathison SDK

TypeScript SDK for the Mathison OI system with governance-first architecture.

## Features

- **Governance-Aware**: Built-in error handling for CDI/CIF governance decisions
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Idempotent**: Safe retry mechanisms for write operations
- **Memory Graph**: Complete CRUD operations for hypergraph memory
- **Job Execution**: Asynchronous job management with receipts
- **Health Checks**: Server status and governance layer monitoring

## Installation

```bash
pnpm add mathison-sdk
```

## Quick Start

```typescript
import { MathisonClient } from 'mathison-sdk';

// Initialize client
const client = new MathisonClient({
  baseURL: 'http://localhost:3000'
});

// Check server health
const health = await client.health();
console.log('Server status:', health.status);

// Create a node in the memory graph
const node = await client.createNode({
  idempotency_key: MathisonClient.generateIdempotencyKey(),
  type: 'concept',
  data: { name: 'TypeScript' }
});

// Search nodes
const results = await client.searchNodes('TypeScript', 10);
console.log('Found nodes:', results.count);
```

## API Reference

### Health & Status

```typescript
// Check server health
const health = await client.health();

// Check if server is ready
const ready = await client.isReady();
```

### Job Execution

```typescript
// Run a job
const result = await client.runJob({
  jobType: 'analysis',
  inputs: { data: 'input' }
});

// Check job status
const status = await client.getJobStatus(result.job_id);

// Resume a job
const resumed = await client.resumeJob(jobId);

// Get audit receipts
const receipts = await client.getReceipts(jobId, 10);
```

### Memory Graph - Read

```typescript
// Get node by ID
const node = await client.getNode('node-123');

// Get node edges
const edges = await client.getNodeEdges('node-123');

// Search nodes
const results = await client.searchNodes('query', 20);
```

### Memory Graph - Write

```typescript
// Create a node
const node = await client.createNode({
  idempotency_key: MathisonClient.generateIdempotencyKey(),
  type: 'entity',
  data: { name: 'Example' }
});

// Create an edge
const edge = await client.createEdge({
  idempotency_key: MathisonClient.generateIdempotencyKey(),
  from: 'node-1',
  to: 'node-2',
  type: 'relates_to'
});
```

## Governance

All operations flow through the governance pipeline:

1. **CIF Ingress** - Input sanitization and rate limiting
2. **CDI Action Check** - Governance policy evaluation
3. **CDI Output Check** - Output validation
4. **CIF Egress** - Leakage prevention and audit logging

Governance violations throw `GovernanceError` with structured information:

```typescript
try {
  await client.createNode(request);
} catch (error) {
  if (error.name === 'GovernanceError') {
    console.error('Governance violation:', error.reasonCode);
    console.error('Message:', error.message);
    console.error('Violations:', error.violations);
  }
}
```

## Error Handling

The SDK provides governance-aware error handling with structured reason codes:

- `ALLOWED` - Action permitted
- `CDI_DENIED` - Governance policy violation
- `CIF_INGRESS_BLOCKED` - Input validation failed
- `CIF_EGRESS_BLOCKED` - Output sanitization failed
- `GOVERNANCE_INIT_FAILED` - Server initialization error
- `MALFORMED_REQUEST` - Invalid request format
- `ROUTE_NOT_FOUND` - Unknown endpoint

## Architecture

The SDK implements the client layer of the Mathison architecture:

```
┌─────────────────────────┐
│  Client Application     │
│  (Your Code)            │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Mathison SDK           │
│  (This Package)         │
│  - Type-safe API        │
│  - Error handling       │
│  - Idempotency          │
└───────────┬─────────────┘
            │ HTTP/REST
            ▼
┌─────────────────────────┐
│  Mathison Server        │
│  - CIF (Firewall)       │
│  - CDI (Governance)     │
│  - OI Engine            │
│  - Memory Graph         │
└─────────────────────────┘
```

## License

See the LICENSE file in the repository root.

## See Also

- [Architecture Documentation](../../docs/architecture.md)
- [CDI Specification](../../docs/cdi-spec.md)
- [CIF Specification](../../docs/cif-spec.md)
- [Tiriti o te Kai (Governance Treaty)](../../docs/tiriti.md)
