# OpenAPI Specification

**Mathison OpenAPI** — Machine-readable API specification for SDK generation.

---

## Endpoint

### GET /openapi.json

Returns the OpenAPI 3.0 specification for the Mathison API.

**Response (200):**
```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "Mathison API",
    "version": "1.0.0",
    "description": "Governed memory graph + OI interpretation + job execution API"
  },
  "paths": { ... }
}
```

---

## Usage

### Generate SDKs

Use the OpenAPI spec to generate client SDKs:

**TypeScript:**
```bash
pnpm --filter mathison-sdk-generator generate
```

**Python (planned):**
```bash
openapi-generator-cli generate -i http://localhost:3000/openapi.json -g python -o sdks/python
```

**Rust (planned):**
```bash
openapi-generator-cli generate -i http://localhost:3000/openapi.json -g rust -o sdks/rust
```

---

## Specification

The OpenAPI spec covers:
- **Memory API**: /memory/nodes, /memory/edges, /memory/search, etc.
- **OI API**: /oi/interpret
- **Jobs API**: /jobs/run, /jobs/status, /jobs/resume, /jobs/logs
- **Health**: /health

All endpoints include:
- Request/response schemas
- Error codes
- Governance behavior (documented in descriptions)

---

## Determinism

The OpenAPI spec is **deterministic**:
- Version matches genome version
- No timestamps or random values
- Stable schema generation

This ensures reproducible SDK builds.

---

## See Also

- [SDK Documentation](./SDKS.md)
- [Memory API](./MEMORY_API.md)
- [OI API](./OI_API.md)
- [Jobs API](./JOBS_API.md)
