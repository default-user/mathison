# Repository-Wide TODO

## Critical Path (v2.0.0 Launch)

- [ ] Complete database migrations for all tables
- [ ] Implement HTTP server with all required endpoints
- [ ] Implement CIF/CDI middleware stubs
- [ ] Write unit tests for namespace isolation
- [ ] Write integration test for end-to-end flow (create thread → add commitment → query)
- [ ] Add CI workflow for lint + test
- [ ] Document deployment process

## High Priority

- [ ] Implement reflection job for thread summarization
- [ ] Add gRPC server with health endpoint
- [ ] Implement proper error handling and structured logging
- [ ] Add request tracing with correlation IDs
- [ ] Tighten CDI policies beyond allow-all stub
- [ ] Add CLI commands for common operations

## Medium Priority

- [ ] S3-compatible artifacts storage adapter
- [ ] NATS JetStream event bus adapter
- [ ] Valkey cache adapter
- [ ] OpenSearch full-text search adapter
- [ ] Apache AGE graph query adapter
- [ ] Metrics and observability (Prometheus, Grafana)
- [ ] Rate limiting and backpressure

## Low Priority

- [ ] Mobile app (currently stub only)
- [ ] Multi-principal support (currently single principal)
- [ ] Distributed scheduler for multi-node deployment
- [ ] Migration tooling from v1 to v2
- [ ] Admin UI for governance and thread visualization

## Research & Exploration

- [ ] Evaluate thread priority algorithms beyond simple numeric priority
- [ ] Research optimal embedding models for thread summarization
- [ ] Explore differential privacy for cross-namespace aggregations
- [ ] Investigate formal verification of namespace isolation

## Known Issues

- None yet (v2 is new!)

## Blockers

- None

## Done

- [x] Archive v1 into `version-one/`
- [x] Create v2 root scaffold
- [x] Define OI invariants and architecture
