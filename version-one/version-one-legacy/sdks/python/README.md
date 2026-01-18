# Mathison Python SDK

Python client for the Mathison API.

## Installation

```bash
pip install mathison-sdk
```

Or from source:

```bash
pip install -e .
```

## Usage

```python
from mathison_sdk import MathisonClient

# Initialize client
client = MathisonClient(base_url="http://localhost:3000")

# Health check
health = client.get_health()
print(f"Status: {health.status}")

# Create memory node
node = client.create_node(
    idempotency_key="my-key",
    type="document",
    data={"content": "Hello World"}
)
print(f"Created: {node.id}")

# Search nodes
results = client.search_nodes(query="hello", limit=10)
for result in results.results:
    print(f"Found: {result.id} - {result.type}")

# OI Interpretation
interpretation = client.interpret(text="What is the meaning of life?")
print(f"Response: {interpretation.interpretation}")
```

## Async Usage

```python
from mathison_sdk import AsyncMathisonClient
import asyncio

async def main():
    async with AsyncMathisonClient(base_url="http://localhost:3000") as client:
        health = await client.get_health()
        print(f"Status: {health.status}")

asyncio.run(main())
```

## API Endpoints

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

## Generated from

This SDK is generated from the mathison-server OpenAPI specification.
See `packages/mathison-sdk-generator` for the generator.
