# Memory Package TODO

## Critical

- [ ] Implement PostgresStore with connection pooling
- [ ] Implement createThread with namespace enforcement
- [ ] Implement getThreads with namespace filtering
- [ ] Implement addCommitment
- [ ] Implement logEvent (append-only)
- [ ] Add unit tests for namespace isolation
- [ ] Add unit tests for thread state transitions
- [ ] Add unit tests for commitment creation

## High Priority

- [ ] Implement queryByEmbedding with pgvector
- [ ] Implement thread summary distillation (Kai-style)
- [ ] Add snapshot mechanism for thread summaries
- [ ] Implement reflection job trigger
- [ ] Add proper error handling and retry logic
- [ ] Add connection health checks

## Medium Priority

- [ ] Optimize vector search with HNSW index
- [ ] Add batch event logging
- [ ] Implement event replay for debugging
- [ ] Add thread archival for completed threads
- [ ] Implement commitment deadline tracking
- [ ] Add commitment blocker analysis

## Low Priority

- [ ] Add read replicas support
- [ ] Implement event log compaction/archival
- [ ] Add multi-region replication
- [ ] Optimize queries with materialized views

## Blockers

- Requires Postgres with pgvector extension
