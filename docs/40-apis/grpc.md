# gRPC + Streaming

**Phase 5** — gRPC server with governance parity and streaming support.

---

## Who This Is For

- **Backend engineers** implementing gRPC endpoints with CIF/CDI governance
- **Client developers** needing streaming job status or memory search results
- **Integration teams** building gRPC-native services on top of Mathison
- **Performance engineers** requiring lower latency than HTTP/JSON REST

If you're satisfied with the HTTP REST API, you don't need gRPC.

---

## Why This Exists

**Problem:** REST API is stateless and doesn't support server-side streaming for long-running jobs or real-time updates.

**Solution:** gRPC provides:
- **Streaming**: Server-sent events for job status, memory search results
- **Efficiency**: Binary protocol (protobuf) with lower overhead than JSON
- **Type safety**: Strongly-typed contracts via .proto definitions
- **Bidirectional comms**: Future support for client streaming (e.g., batch uploads)

**Design choice:** gRPC runs alongside HTTP server (different port) and shares the same governance layer (CIF/CDI interceptors).

---

## Guarantees / Invariants

1. **Governance parity**: All gRPC endpoints enforce the same CIF+CDI rules as HTTP endpoints
2. **Fail-closed**: Deny by default; missing treaty or invalid genome → request denied
3. **Receipt tracking**: Every stream event includes genome metadata (id + version)
4. **Backpressure**: Server respects client read rate (no overwhelming slow clients)
5. **Bounded streams**: All streams have max duration/event limits to prevent resource exhaustion

---

## Non-Goals

- **Replacing HTTP API**: gRPC is additive; HTTP API remains primary
- **Client streaming**: Phase 5 focuses on server streaming only
- **Public internet exposure**: gRPC is designed for internal/trusted service meshes (use HTTP API for public clients)
- **Automatic load balancing**: Client-side LB configuration required (not provided)

---

## How to Verify

### Verify gRPC server starts
```bash
MATHISON_GRPC_PORT=50051 pnpm server
# Expected: "gRPC server listening on port 50051"
```

### Verify proto definitions compile
```bash
cd proto
protoc --typescript_out=../packages/mathison-server/src/generated mathison.proto
# Expected: TypeScript bindings generated without errors
```

### Verify streaming endpoint
```bash
grpcurl -plaintext -d '{"job_id": "job-123"}' \
  localhost:50051 mathison.MathisonService/StreamJobStatus
# Expected: Stream of JobStatus messages
```

### Verify governance interceptors
```bash
# Test CIF ingress blocking (oversized payload)
grpcurl -plaintext -d '{"text": "'$(printf 'x%.0s' {1..100000})'"}' \
  localhost:50051 mathison.MathisonService/InterpretText
# Expected: grpc.status.INVALID_ARGUMENT with "CIF_INGRESS_BLOCKED"
```

---

## Implementation Pointers

**Location**: `/packages/mathison-server/src/grpc/`
- `server.ts` — gRPC server setup
- `interceptors/cif.ts` — CIF ingress/egress interceptors
- `interceptors/cdi.ts` — CDI action authorization interceptor
- `services/mathison.ts` — Service implementation

**Proto definitions**: `/proto/mathison.proto`

**Dependencies**:
- `@grpc/grpc-js` — Node.js gRPC library
- `@grpc/proto-loader` — .proto file loader
- Shares `ActionGate` and governance components with HTTP server

**Integration**:
- gRPC server runs on separate port (default: 50051)
- Uses same in-memory backend as HTTP server (shared state)
- Interceptors call same CIF/CDI modules as HTTP middleware

---

## Status: READY_FOR_HUMAN

This phase requires:
- Proto definitions (.proto files)
- gRPC code generation tooling
- gRPC server implementation
- gRPC interceptors for CIF/CDI governance

---

## Requirements

### Proto Definitions

Create `/proto/mathison.proto`:
```protobuf
syntax = "proto3";

package mathison;

service MathisonService {
  rpc RunJob(JobRunRequest) returns (JobResult);
  rpc StreamJobStatus(JobStatusRequest) returns (stream JobStatus);
  rpc StreamMemorySearch(MemorySearchRequest) returns (stream MemorySearchResult);
}

message JobRunRequest {
  string job_type = 1;
  bytes inputs = 2;
}

message JobResult {
  string job_id = 1;
  string status = 2;
  bytes outputs = 3;
}

message JobStatusRequest {
  string job_id = 1;
}

message JobStatus {
  string job_id = 1;
  string status = 2;
  string current_stage = 3;
}

message MemorySearchRequest {
  string query = 1;
  int32 limit = 2;
}

message MemorySearchResult {
  string node_id = 1;
  string type = 2;
  bytes data = 3;
}
```

### gRPC Interceptors (Governance Parity)

Implement **CIF + CDI governance** for gRPC:
- **Ingress interceptor**: validate + sanitize inbound requests
- **Action interceptor**: CDI action authorization
- **Egress interceptor**: CDI output check + sanitize responses
- **Fail-closed**: deny if treaty missing/genome invalid

Example interceptor structure:
```typescript
async function cifIngressInterceptor(call, callback) {
  const cifResult = await cif.ingress({
    clientId: call.metadata.get('client-id'),
    endpoint: call.methodPath,
    payload: call.request,
    headers: call.metadata.getMap()
  });

  if (!cifResult.allowed) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      details: 'CIF_INGRESS_BLOCKED'
    });
  }

  call.sanitizedRequest = cifResult.sanitizedPayload;
  callback();
}
```

### Streaming Behavior

- **Server streaming**: `StreamJobStatus`, `StreamMemorySearch`
- **Backpressure**: respect client read rate
- **Timeouts**: bounded stream duration
- **Receipts**: every stream event includes genome metadata

---

## Implementation Checklist

- [ ] Create proto/ directory with .proto definitions
- [ ] Add @grpc/grpc-js and @grpc/proto-loader dependencies
- [ ] Generate TypeScript bindings from .proto
- [ ] Implement gRPC server in packages/mathison-server
- [ ] Implement CIF/CDI interceptors
- [ ] Add streaming endpoints (StreamJobStatus, StreamMemorySearch)
- [ ] Add governance conformance tests for gRPC
- [ ] Update RECTOR_PACK.md with gRPC port/config

---

## Testing

```bash
# Start server with gRPC enabled
MATHISON_GRPC_PORT=50051 pnpm server

# Test with grpcurl
grpcurl -plaintext -d '{"job_id": "job-123"}' \
  localhost:50051 mathison.MathisonService/StreamJobStatus
```

---

## See Also

- [CDI Specification](../31-governance/cdi-spec.md)
- [CIF Specification](../31-governance/cif-spec.md)
