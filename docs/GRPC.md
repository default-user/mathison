# gRPC + Streaming — READY_FOR_HUMAN

**Phase 5** — gRPC server with governance parity and streaming support.

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

- [CDI Specification](./cdi-spec.md)
- [CIF Specification](./cif-spec.md)
