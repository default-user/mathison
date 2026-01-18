# Quickstart Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- New users wanting to get Mathison running in 5 minutes
- Developers evaluating Mathison for integration
- Operators testing deployment configurations

## Why This Exists

This guide provides the fastest path from zero to a running Mathison server with governance validation. It skips explanations in favor of executable steps.

## Guarantees / Invariants

1. Following these steps will produce a working server with governance enabled
2. The demo workflow proves governance pipeline is active
3. All commands are tested on Node.js 18+ / pnpm 8+

## Non-Goals

- This guide does NOT explain architecture (see [System Architecture](../20-architecture/system-architecture.md))
- This guide does NOT cover production deployment (see [Deployment](../61-operations/deployment.md))
- This guide does NOT configure LLM integration (see [GitHub Models Setup](../45-integrations/github-models-setup.md))

---

## One-Command Bootstrap

Copy and paste this command to get started immediately:

```bash
git clone https://github.com/default-user/mathison && cd mathison && ./bootstrap-oi.sh
```

This will:
1. Install dependencies (pnpm install)
2. Build all packages
3. Start a local HTTP server
4. Open the browser interface

## Or Manual Setup

### Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | >= 18.0.0 | `node --version` |
| pnpm | >= 8.0.0 | `pnpm --version` |

If pnpm is not installed:
```bash
npm install -g pnpm
```

### Step 1: Clone the Repository

```bash
git clone https://github.com/default-user/mathison
cd mathison
```

### Step 2: Install Dependencies

```bash
pnpm install
```

If you encounter build errors for native modules (e.g., `better-sqlite3`):
```bash
pnpm approve-builds
pnpm install
```

### Step 3: Build All Packages

```bash
pnpm -r build
```

Expected output includes:
```
packages/mathison-governance build...
packages/mathison-memory build...
packages/mathison-server build...
```

### Step 4: Run Tests (Optional but Recommended)

```bash
pnpm -r test
```

Expected: All tests pass (87+ tests across 12+ suites).

### Step 5: Start the Server

```bash
# Set required environment variables
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data

# Start in development mode (hot reload)
pnpm dev
```

Or for production mode:
```bash
pnpm server
```

### Step 6: Verify Health

```bash
curl http://localhost:3000/health | jq
```

Expected response:
```json
{
  "status": "healthy",
  "bootStatus": "ready",
  "governance": {
    "treaty": { "version": "1.0", "authority": "kaitiaki" },
    "cdi": { "strictMode": true, "initialized": true },
    "cif": { "maxRequestSize": 1048576, "initialized": true }
  },
  "storage": {
    "backend": "FILE",
    "path": "./data",
    "initialized": true
  }
}
```

---

## Quick Workflow Test

### Create a Memory Node

```bash
curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "type": "person",
    "data": {"name": "Alice"},
    "idempotency_key": "quickstart-alice-001"
  }' | jq
```

Expected: Response includes `"created": true` and a `receipt` object with governance metadata.

### Search Memory

```bash
curl "http://localhost:3000/memory/search?q=Alice&limit=5" | jq
```

Expected: Response includes the node created above.

---

## Optional: Start Quadratic Bridge (Browser OI)

Open a new terminal:

```bash
cd mathison

# Optional: Add LLM support
export GITHUB_TOKEN="ghp_your_token_here"

# Start bridge (auth disabled for local testing)
BRIDGE_REQUIRE_AUTH=false npx tsx quadratic-bridge.mjs
```

Then open in browser:
```
http://localhost:8080/quadratic.html
```

Connect to the bridge at `http://localhost:3142` to enable SYSTEM/NETWORK stage capabilities.

---

## Environment Variables Reference

### Required for Server

| Variable | Purpose | Example |
|----------|---------|---------|
| `MATHISON_STORE_BACKEND` | Storage backend | `FILE` or `SQLITE` |
| `MATHISON_STORE_PATH` | Storage directory | `./data` |

### Optional for LLM Integration

| Variable | Purpose | Priority |
|----------|---------|----------|
| `GITHUB_TOKEN` | GitHub Models API (free tier) | 1st |
| `ANTHROPIC_API_KEY` | Anthropic Claude API | 2nd |

LLM fallback order: GitHub Models → Anthropic → Local pattern-based

---

## Troubleshooting

### Port 3000 already in use

```bash
export PORT=3001
pnpm dev
```

### `pnpm: command not found`

```bash
npm install -g pnpm
```

### Dependencies fail to install (better-sqlite3)

```bash
pnpm approve-builds
pnpm install
```

### Server fails to boot with "Genome signature invalid"

This is fail-closed behavior working correctly. Verify the genome:
```bash
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json
```

### Missing data directory

```bash
mkdir -p ./data/{nodes,edges,hyperedges,receipts}
```

---

## How to Verify

Test the full governance pipeline:

```bash
pnpm demo
```

This runs a deterministic workflow that:
1. Boots the server with governance
2. Creates memory nodes and edges
3. Verifies receipts are generated
4. Runs the full test suite
5. Exits with status 0 on success

---

## Implementation Pointers

| Component | Path |
|-----------|------|
| Bootstrap script | `bootstrap-oi.sh` |
| Server entry | `packages/mathison-server/src/index.ts` |
| Demo script | `scripts/demo.mjs` |
| Health endpoint | `packages/mathison-server/src/routes/health.ts` |

---

## Next Steps

| Task | Document |
|------|----------|
| Run the full demo | [Demo](./demo.md) |
| Understand the architecture | [System Architecture](../20-architecture/system-architecture.md) |
| Set up LLM integration | [GitHub Models Setup](../45-integrations/github-models-setup.md) |
| Deploy to production | [Deployment](../61-operations/deployment.md) |
| Review governance | [Governance Claims](../31-governance/governance-claims.md) |
