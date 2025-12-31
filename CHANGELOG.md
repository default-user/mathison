# Changelog

All notable changes to the Mathison project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2024-01-XX] - TODO Sweep

### Added

#### mathison-memory (1.0.0 → 1.1.0)
- **Graph traversal algorithms**: BFS and DFS with configurable max depth
- **Shortest path algorithm**: Dijkstra's algorithm for finding optimal paths
- **Path finding**: `findPaths()` method with backtracking for multiple path discovery
- **Query DSL**: Filter nodes by type and data properties
- **Graph visualization**: DOT format export for Graphviz rendering
- **Graph analytics**: `getStats()` method for node/edge/hyperedge statistics
- **Hypergraph operations suite** (5 phases):
  - **Phase 1 - Incidence queries**: `getNodeHyperedges()`, `getHypergraphNeighbors()` for basic hypergraph navigation
  - **Phase 2 - Pattern matching**: `findHyperedgesContainingAll/Any()`, `findHyperedgesBySize()` for hyperedge set queries
  - **Phase 3 - Hypergraph traversal**: `hypergraphBFS()`, `hypergraphDFS()` for traversing through hyperedges
  - **Phase 4 - Clustering & analysis**: `findHypergraphClusters()` (Jaccard similarity), `getHypergraphDegree()`, `getHypergraphCentralNodes()`, `getHypergraphBetweennessCentrality()`
  - **Phase 5 - Graph projection**: `projectToGraph()`, `findMaximalCliques()`, `getHypergraphDensity()`, `findStronglyConnectedComponents()`

#### mathison-kernel-mac (1.0.0 → 1.2.0)
- **Chat history persistence**: In-memory chat history with JSON file persistence
  - Store both user and assistant messages
  - Automatic trimming to configurable max size (1000 messages)
  - GET /api/chat/history endpoint with pagination support
  - Load history on server startup
- **WebSocket progress streaming**: Real-time model installation progress
  - Stream download progress to all connected WebSocket clients
  - Progress messages with bytes downloaded, total, and percentage
  - Completion and error notifications via WebSocket
  - Integrated with existing model installation endpoint

#### TypeScript SDK (0.1.0 → 0.2.0)
- Complete API client implementation with all endpoints
- Type-safe interfaces for all request/response objects
- Authentication support via API key
- Configurable timeout and error handling
- Methods: health, status, identity, chat (send/history), beams (query/get/create/update/pin/unpin/retire/tombstone)

#### Python SDK (0.1.0 → 0.2.0)
- Complete API client implementation with type hints
- Dataclass-based structured responses
- Authentication support via API key
- Configurable timeout and error handling
- Session-based HTTP client with requests library
- Methods: health, status, identity, chat (send/history), beams (query/get/create/update/pin/unpin/retire/tombstone)

#### Rust SDK (0.1.0 → 0.2.0)
- Async API client implementation with reqwest
- Serde-based serialization/deserialization for type safety
- Authentication support via API key
- Comprehensive error handling with custom Error type
- Configurable timeout support
- Methods: health, status, identity, chat (send/history), beams (query/get/create/update/pin/unpin/retire/tombstone)

#### mathison-mesh (1.0.0 → 1.1.0)
- **Node discovery implementation**: Complete discovery infrastructure for distributed mesh
  - **Proximity discovery**: Geographic-based node discovery with location filtering
  - **Broadcast discovery**: Network broadcast for local node detection
  - **Manual discovery**: Explicit node addition for controlled mesh formation
  - Event-driven architecture with discovery-started, node-joined, and discovery-failed events
  - Integration hooks for external discovery protocols (mDNS, BLE, SSDP)

#### mathison-sdk-generator (1.0.0 → 1.1.0)
- **Automated SDK code generation**: Generate client SDKs from API endpoint definitions
  - TypeScript client generation with Promise-based async methods
  - Python client generation with type hints and dataclass support
  - Rust client generation with async/await and Result types
  - Automatic method name generation from endpoint paths
  - Parameter and return type inference from API schema

### Fixed
- Resolved P2 TODOs for data correctness (graph operations)
- Resolved P4 TODOs for UX/DevEx improvements (SDK implementations, chat history, WebSocket progress streaming)
- Resolved P5 TODOs for advanced features (hypergraph operations suite, node discovery, SDK generator)

### Security
- No security-related changes (P0 TODOs: none found requiring immediate action)

## [Previous Releases]

See git history for previous releases.
