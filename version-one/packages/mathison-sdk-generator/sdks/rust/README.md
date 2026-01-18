# Mathison Rust SDK

**Status:** Not yet implemented

This SDK will be generated from the mathison-server OpenAPI spec.
See `packages/mathison-sdk-generator` for the generator.

## Planned Endpoints

- `GET /health` - Health check
- `GET /openapi.json` - OpenAPI specification
- `GET /genome` - Get active genome metadata
- `POST /jobs/run` - Run a job
- `GET /jobs/status` - Get job status
- `POST /jobs/resume` - Resume a suspended job
- `GET /jobs/logs` - Get job logs/receipts
- `GET /memory/nodes/{id}` - Get node by ID
- `POST /memory/nodes/{id}` - Update node by ID
- `GET /memory/nodes/{id}/edges` - Get edges for node
- `GET /memory/nodes/{id}/hyperedges` - Get hyperedges for node
- `GET /memory/edges/{id}` - Get edge by ID
- `GET /memory/hyperedges/{id}` - Get hyperedge by ID
- `GET /memory/search` - Search nodes
- `POST /memory/nodes` - Create a new node
- `POST /memory/edges` - Create a new edge
- `POST /memory/hyperedges` - Create a new hyperedge
- `POST /oi/interpret` - Interpret text using memory context
