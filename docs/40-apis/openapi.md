# OpenAPI Specification

**Mathison OpenAPI** — Machine-readable API specification for SDK generation.

---

## Who This Is For

- **SDK developers** generating client libraries for Mathison
- **API integrators** needing machine-readable interface definitions
- **Tool builders** creating code generators, linters, or validators
- **Documentation maintainers** who need authoritative API schemas

If you're hand-writing API calls or exploring endpoints, see the specific API docs (Memory, OI, Jobs) instead.

---

## Why This Exists

**Problem:** Manual SDK development is error-prone and drifts from server implementation.

**Solution:** The OpenAPI spec provides a single source of truth for:
- Request/response schemas
- Error codes and meanings
- Governance behavior documentation
- Deterministic SDK code generation

**Design choice:** The spec is served dynamically at `/openapi.json` to ensure it always matches the running server's capabilities.

---

## Guarantees / Invariants

1. **Determinism**: Spec version matches genome version; no timestamps or random values
2. **Completeness**: All Memory, OI, and Jobs endpoints are included
3. **Schema fidelity**: Request/response schemas match server validation exactly
4. **Reproducibility**: Same genome version → same spec output → same SDK builds

**Non-deterministic elements**: None. The spec is fully deterministic.

---

## Non-Goals

- **Runtime API exploration**: Use Swagger UI or similar tools (not included in Mathison)
- **Versioned spec archives**: Spec reflects current server state only (no historical versions)
- **Multi-version support**: One spec per server instance (no v1/v2 routing)
- **Custom annotations**: Only standard OpenAPI 3.0 fields (no vendor extensions)

---

## How to Verify

### Verify spec is accessible
```bash
curl http://localhost:3000/openapi.json | jq .info
# Expected: { "title": "Mathison API", "version": "1.0.0", ... }
```

### Verify determinism
```bash
curl http://localhost:3000/openapi.json > spec1.json
curl http://localhost:3000/openapi.json > spec2.json
diff spec1.json spec2.json
# Expected: no differences
```

### Verify SDK generation works
```bash
cd packages/mathison-sdk-generator
pnpm generate
# Expected: TypeScript SDK generated without errors
```

### Verify schema coverage
```bash
curl http://localhost:3000/openapi.json | jq '.paths | keys'
# Expected: All Memory, OI, Jobs endpoints listed
```

---

## Implementation Pointers

**Location**: `/packages/mathison-server/src/routes/openapi.ts`

**Key components**:
- **Spec builder**: Constructs OpenAPI 3.0 JSON from route metadata
- **Schema registry**: Maps TypeScript types to JSON schemas
- **Governance annotations**: Documents CIF/CDI behavior in endpoint descriptions

**Dependencies**:
- OpenAPI 3.0.3 spec format
- JSON Schema for request/response types

**Integration points**:
- Server exposes at `GET /openapi.json`
- SDK generator consumes spec to generate TypeScript bindings
- Future: Python and Rust generators planned

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
