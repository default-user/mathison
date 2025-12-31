# Demo — Buyer Quick Evaluation

## Purpose

This demo provides a deterministic, 2-minute evaluation of Mathison's core governance and memory capabilities. It proves that:

1. Governance pipeline (CIF→CDI→ActionGate→CIF) is active
2. Genome signature verification works (fail-closed on invalid)
3. Memory write operations generate receipts
4. Server responds to governed requests

## Prerequisites

**Required:**
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- macOS or Linux (bash script)
- Ports 3000 available (or configure `PORT` env var)

**Optional (for LLM features):**
- GitHub Token (free tier: 15 req/min, 150/day)
- Anthropic API Key (fallback)

**Not Required:**
- No Docker
- No cloud credentials
- No database setup (uses FILE backend)

## One-Command Quickstart

```bash
pnpm demo
```

This command will:
1. Install dependencies (if needed)
2. Build packages
3. Start server in background
4. Execute deterministic workflow:
   - Health check
   - Create memory nodes
   - Create edges between nodes
   - Verify receipts
   - Search memory
5. Stop server
6. Run test suite
7. Exit with status 0 (success) or 1 (failure)

**Expected Duration:** ~60-90 seconds (fresh install: ~120 seconds)

## What You'll See

### 1. Server Boot (Governance Initialization)

```
⚖️  Initializing Governance Engine...
📜 Loading treaty from: ./docs/tiriti.md
✓ Treaty loaded: Tiriti o te Kai v1.0
✓ Initialized 3 core governance rules
🧬 Loading genome from: genomes/TOTK_ROOT_v1.0.0/genome.json
✓ Genome signature verified
✓ Genome loaded: TOTK_ROOT v1.0.0
🚀 Server listening on http://localhost:3000
```

**What This Proves:**
- Governance treaty loaded
- Genome signature verified (Ed25519)
- Fail-closed defaults active

### 2. Health Check Response

```json
{
  "status": "healthy",
  "bootStatus": "ready",
  "governance": {
    "treaty": {
      "version": "1.0",
      "authority": "kaitiaki"
    },
    "cdi": {
      "strictMode": true,
      "initialized": true
    },
    "cif": {
      "maxRequestSize": 1048576,
      "maxResponseSize": 1048576,
      "initialized": true
    }
  },
  "storage": {
    "backend": "FILE",
    "path": "./data",
    "initialized": true
  }
}
```

**What This Proves:**
- Server is ready
- Governance pipeline initialized
- Strict mode enabled (fail-closed)

### 3. Memory Write with Receipt

Request:
```json
POST /memory/nodes
{
  "type": "person",
  "data": { "name": "Alice" },
  "idempotency_key": "demo-alice-001"
}
```

Response:
```json
{
  "node": {
    "id": "node_abc123",
    "type": "person",
    "data": { "name": "Alice" },
    "metadata": { "created_at": "2025-12-31T..." }
  },
  "created": true,
  "receipt": {
    "receipt_id": "receipt_xyz789",
    "action": "create_node",
    "decision": "ALLOW",
    "policy_id": "allow_memory_write",
    "genome_id": "TOTK_ROOT",
    "genome_version": "1.0.0",
    "timestamp": "2025-12-31T...",
    "store_backend": "FILE"
  }
}
```

**What This Proves:**
- ActionGate intercepts write
- Receipt generated with genome metadata
- Idempotency enforced (repeat request returns same response)

### 4. Edge Creation (Governed Relationship)

Request:
```json
POST /memory/edges
{
  "from": "node_alice",
  "to": "node_bob",
  "type": "knows",
  "idempotency_key": "demo-edge-001"
}
```

Response includes receipt (same structure as node creation).

**What This Proves:**
- Graph relationships are governed
- Receipts trace all mutations

### 5. Search Results

Request:
```
GET /memory/search?q=Alice&limit=10
```

Response:
```json
{
  "query": "Alice",
  "limit": 10,
  "count": 1,
  "results": [
    {
      "id": "node_abc123",
      "type": "person",
      "data": { "name": "Alice" },
      "score": 1.0
    }
  ]
}
```

**What This Proves:**
- Memory persistence works
- Search functionality active

### 6. Test Suite Summary

```
PASS  packages/mathison-governance/src/__tests__/...
PASS  packages/mathison-server/src/__tests__/server-conformance.test.ts
PASS  packages/mathison-server/src/__tests__/genome-boot-conformance.test.ts
PASS  packages/mathison-server/src/__tests__/memory-write-conformance.test.ts

Test Suites: 12 passed, 12 total
Tests:       87 passed, 87 total
```

**What This Proves:**
- Governance pipeline verified by tests
- Conformance tests pass (FILE/SQLite backends equivalent)
- Genome fail-closed behavior tested

## Manual Step-by-Step (Optional)

If you prefer to run steps manually instead of `pnpm demo`:

### Step 1: Install and Build

```bash
pnpm install
pnpm -r build
```

### Step 2: Set Environment Variables

```bash
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data
export PORT=3000
```

### Step 3: Start Server

```bash
pnpm --filter mathison-server start &
SERVER_PID=$!
sleep 5  # Wait for boot
```

### Step 4: Health Check

```bash
curl http://localhost:3000/health | jq
```

Expected: `"status": "healthy"`

### Step 5: Create Memory Node

```bash
curl -X POST http://localhost:3000/memory/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "type": "person",
    "data": {"name": "Alice"},
    "idempotency_key": "manual-alice-001"
  }' | jq
```

Expected: Response includes `"created": true` and `"receipt"` object.

### Step 6: Create Edge

```bash
curl -X POST http://localhost:3000/memory/edges \
  -H "Content-Type: application/json" \
  -d '{
    "from": "<node_id_from_step5>",
    "to": "<node_id_from_step5>",
    "type": "self_reference",
    "idempotency_key": "manual-edge-001"
  }' | jq
```

### Step 7: Search

```bash
curl "http://localhost:3000/memory/search?q=Alice&limit=5" | jq
```

### Step 8: Stop Server

```bash
kill $SERVER_PID
```

### Step 9: Run Tests

```bash
pnpm -r test
```

## Troubleshooting

### Issue: Port 3000 already in use

**Solution:**
```bash
export PORT=3001
pnpm demo
```

### Issue: `pnpm: command not found`

**Solution:**
```bash
npm install -g pnpm
```

### Issue: Server fails to boot with "Genome signature invalid"

**Expected Behavior:** This is fail-closed working correctly. The test genome in `genomes/TOTK_ROOT_v1.0.0/` should have a valid signature.

**Verify:**
```bash
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json
```

Expected: `✓ Genome signature is valid`

If invalid, regenerate:
```bash
pnpm tsx scripts/genome-sign.ts \
  genomes/TOTK_ROOT_v1.0.0/genome.json \
  genomes/TOTK_ROOT_v1.0.0/key.priv
```

### Issue: Dependencies fail to install (better-sqlite3)

**Solution:**
```bash
pnpm approve-builds
pnpm install
```

### Issue: `ENOENT: no such file or directory, open './data/...'`

**Expected Behavior:** Server creates `./data/` directory on first write. If missing, create manually:
```bash
mkdir -p ./data/{nodes,edges,hyperedges,receipts}
```

### Issue: Tests fail with "jest: not found"

**Solution:**
```bash
pnpm install
pnpm -r build
pnpm -r test
```

### Issue: Demo script hangs at "Waiting for server..."

**Possible Causes:**
- Port already in use (check `lsof -i :3000`)
- Build failed (run `pnpm -r build` manually)
- Missing dependencies (run `pnpm install`)

**Debug:**
```bash
# Run server in foreground to see errors
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data
pnpm --filter mathison-server start
```

## Success Criteria

Demo is successful if:

1. ✅ Server boots without errors
2. ✅ Health check returns `"status": "healthy"`
3. ✅ Memory node creation returns receipt
4. ✅ Edge creation returns receipt
5. ✅ Search finds created nodes
6. ✅ All tests pass (`pnpm -r test`)
7. ✅ Demo script exits with status 0

## What This Demo Does NOT Cover

- LLM integration (requires API keys)
- Mobile deployment (requires React Native environment)
- Mesh networking (requires multiple instances)
- Production security hardening (HSM, rate limiting, etc.)
- Quadratic Monolith browser runtime (separate demo: `quadratic.html`)

For LLM features, see `GITHUB_MODELS_SETUP.md`.

For production deployment, see `PRODUCTION_REQUIREMENTS.md`.

For mobile, see `docs/mobile-deployment.md`.

## Next Steps After Demo

1. **Review Governance:** Read `docs/tiriti.md` (treaty) and `GOVERNANCE_CLAIMS.md` (implementation status)
2. **Review Architecture:** Read `ARCHITECTURE.md` for system design
3. **Review Security:** Read `THREAT_MODEL.md` and `SECURITY.md`
4. **Review Provenance:** Read `PROVENANCE.md` for dependency chain-of-title
5. **Explore API:** See `README.md` for full API documentation

## Contact

For demo issues: open an issue in the repository.

**Last Updated:** 2025-12-31
