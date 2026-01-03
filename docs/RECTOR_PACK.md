# Rector Pack — Operator Guide

## Purpose
This document captures what changed during roadmap execution, how to operate the updated system, and any gaps requiring human attention.

---

## What Changed (Summary)

### Phase 0: Rector/Coherence Fixes
- ✅ Repo hygiene: Removed package-lock.json, updated .gitignore
- ✅ Genome tooling: Added tsx dependency, genome scripts (keygen, sign, verify, audit)
- ✅ Real signature tests: No dummy signatures in genome-conformance.test.ts, genome-boot-conformance.test.ts
- ✅ JSON contract: onSend hook enforces JSON-only responses, fail-closed
- ✅ StorageAdapter: First-class abstraction with lifecycle (init/close), FILE/SQLITE implementations

### Phase 1-3: Core APIs (Already Implemented)
- ✅ Memory API: Complete read/write governed endpoints (docs/MEMORY_API.md)
- ✅ OI Interpretation: POST /oi/interpret with governance (docs/OI_API.md)
- ✅ Job API: Complete job execution with checkpointing (docs/JOBS_API.md)

### Phase 4: OpenAPI
- ✅ OpenAPI endpoint: GET /openapi.json returns OpenAPI 3.0 spec
- ⚠️ SDK generation: Deferred (requires openapi-generator or similar)

### Phases 5-8: READY_FOR_HUMAN
- 📋 gRPC: docs/GRPC.md created (requires proto definitions + grpc libs)
- 📋 Mesh Discovery: docs/MESH_DISCOVERY.md created (requires mDNS implementation)
- 📋 Mesh E2EE: docs/MESH_E2EE.md created (requires full handshake)
- 📋 Play Store: docs/PLAY_STORE.md created (requires Play Console credentials)

---

## New Environment Variables
*(None yet)*

---

## New Reason Codes
*(None yet)*

---

## How to Run Tests/Build

### Prerequisites
- Node.js >=18.0.0
- pnpm >=8.0.0

### Commands
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run all tests
pnpm -r test

# Run server
pnpm server

# Run demo
pnpm demo
```

### Genome Operations
```bash
# Generate Ed25519 keypair for genome signing
pnpm genome:keygen [key-id]

# Build manifest from codebase files
pnpm genome:build-manifest

# Sign genome with private key
pnpm genome:sign

# Verify genome signature
pnpm genome:verify

# Comprehensive genome audit (sig + manifest)
pnpm genome:audit <genome-path> [--verify-manifest]
```

---

## Known Gaps / READY_FOR_HUMAN Items

### 1. gRPC Server (Phase 5)
**Status:** READY_FOR_HUMAN
**Docs:** docs/GRPC.md
**Requires:**
- Proto definitions in `proto/` directory
- @grpc/grpc-js and @grpc/proto-loader dependencies
- gRPC interceptors for CIF/CDI governance
- Streaming endpoints: StreamJobStatus, StreamMemorySearch

### 2. Mesh Discovery (Phase 6)
**Status:** READY_FOR_HUMAN
**Docs:** docs/MESH_DISCOVERY.md
**Requires:**
- Real mDNS discovery adapter (using mdns or bonjour npm package)
- UDP broadcast discovery adapter
- Consent gate UI integration
- Multi-node network testing

### 3. Mesh E2EE (Phase 7)
**Status:** READY_FOR_HUMAN
**Docs:** docs/MESH_E2EE.md
**Requires:**
- X25519 ECDH handshake implementation
- AES-256-GCM encryption
- Counter-based replay protection
- Key rotation logic

### 4. Play Store Deployment (Phase 8.2)
**Status:** READY_FOR_HUMAN
**Docs:** docs/PLAY_STORE.md
**Requires:**
- Google Play Console account + credentials
- Android signing keystore (upload key)
- Store assets (icon, screenshots, feature graphic)
- Privacy policy URL

### 5. SDK Generation (Phase 4 - partial)
**Status:** Deferred
**Requires:**
- openapi-generator-cli or similar tool
- Language-specific templates (TypeScript, Python, Rust)
- CI/CD integration for automatic SDK builds

---

## Migration Notes
*(None yet)*

---

## Last Updated
2026-01-03 (Roadmap execution complete - Phases 0-4 done, 5-8 documented)
