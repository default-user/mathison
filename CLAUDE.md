# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Mathison is an OI (Open Interpretation) system with graph/hypergraph memory and multi-language SDK support. It provides a server that manages memory, interpretation, and governance through treaty-based rules.

## Architecture

This is a pnpm monorepo with the following structure:

### Core Packages (`packages/`)

- **mathison-server**: Main server entry point that orchestrates all components
- **mathison-memory**: Graph and hypergraph memory system for storing and querying structured data
- **mathison-oi**: Open Interpretation engine for multi-modal interpretation
- **mathison-governance**: Treaty-based governance system supporting Substack and authority.nz treaties
- **mathison-sdk-generator**: SDK generator for creating client libraries

### SDKs (`sdks/`)

- **typescript**: TypeScript/JavaScript client SDK
- **python**: Python client SDK
- **rust**: Rust client SDK

### Key Components

1. **Memory Graph**: Supports standard graph operations (nodes, edges) and hypergraph operations (hyperedges connecting multiple nodes)
2. **OI Engine**: Handles interpretation requests with confidence scoring and alternative interpretations
3. **Governance Engine**: Loads and enforces treaty-based rules from Substack or authority.nz sources

## Development Commands

### Build and Test

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Build specific package
pnpm --filter mathison-server build
```

### Running the Server

```bash
# Development mode (with hot reload)
pnpm dev

# Production mode
pnpm server
```

### Generating SDKs

```bash
# Generate all SDKs
pnpm generate-sdks

# Or run directly
pnpm --filter mathison-sdk-generator generate
```

## Configuration

- **config/governance.json**: Governance treaty configuration
  - `treatyUrl`: URL to the governance treaty (Substack or authority.nz)
  - `authority`: Authority type (`substack` or `authority.nz`)

## Governance and Treaties

The governance engine loads treaty documents from either Substack or authority.nz sources. The treaty URL is configured in `config/governance.json` and can be set during bootstrap via:

```bash
bash scripts/bootstrap-mathison.sh "https://yourtreatysource.substack.com/treaty"
```

Treaties define:
- Compliance rules for system operations
- Authority delegation patterns
- Governance decision-making processes

## Implementation TODOs

The following features need implementation:

1. **mathison-server**: HTTP/gRPC API endpoints, WebSocket support
2. **mathison-memory**: Persistent storage, graph traversal algorithms, query DSL
3. **mathison-oi**: Core interpretation logic, multi-modal support
4. **mathison-governance**: Treaty parsing, compliance checking, rule evaluation
5. **mathison-sdk-generator**: API schema-based generation for all target languages
6. **Testing**: Comprehensive test suites for all packages
7. **Documentation**: API documentation and usage examples
