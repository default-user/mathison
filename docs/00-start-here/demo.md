# Demo — Buyer Quick Evaluation

**Version:** 1.0.0
**Last Updated:** 2026-01-03

---

## Who This Is For

- Technical evaluators assessing Mathison for adoption
- Security auditors verifying governance claims
- Developers understanding the governance pipeline

## Why This Exists

This demo provides a deterministic, 2-minute evaluation of Mathison's core governance and memory capabilities. It proves that the governance pipeline (CIF→CDI→ActionGate→CIF) is active and structurally cannot be bypassed.

## Guarantees / Invariants

1. Demo completes in under 2 minutes on standard hardware
2. All governance pipeline stages are exercised and verified
3. Receipts are generated for all write operations
4. Genome signature verification is tested (fail-closed on invalid)
5. Idempotency is enforced (duplicate requests return cached responses)

## Non-Goals

- This demo does NOT test LLM integration (requires API keys)
- This demo does NOT test mobile deployment (requires React Native)
- This demo does NOT test mesh networking (requires multiple instances)
- This demo does NOT test production security hardening

---

## Prerequisites

### Required

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | >= 18.0.0 | `node --version` |
| pnpm | >= 8.0.0 | `pnpm --version` |
| bash | any | Built-in on macOS/Linux |
| Port 3000 | available | `lsof -i :3000` |

### Optional (for LLM features)

| Requirement | Purpose |
|-------------|---------|
| GitHub Token | Free tier LLM (15 req/min) |
| Anthropic API Key | Fallback LLM provider |

### Not Required

- No Docker
- No cloud credentials
- No database setup (uses FILE backend)

---

## One-Command Demo

```bash
pnpm demo
```

This command will:

1. **Install dependencies** (if needed)
2. **Build packages**
3. **Start server** in background
4. **Execute deterministic workflow:**
   - Health check (governance initialization)
   - Create memory nodes (ActionGate + receipts)
   - Create edges between nodes
   - Verify receipts contain genome metadata
   - Search memory (governed read)
5. **Stop server**
6. **Run test suite**
7. **Exit with status 0** (success) or **1** (failure)

**Expected Duration:** ~60-90 seconds (fresh install: ~120 seconds)

---

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
- Governance treaty loaded from `docs/tiriti.md`
- Genome signature verified using Ed25519
- Fail-closed defaults active (strictMode: true)

### 2. Health Check Response

```json
{
  "status": "healthy",
  "bootStatus": "ready",
  "governance": {
    "treaty": { "version": "1.0", "authority": "kaitiaki" },
    "cdi": { "strictMode": true, "initialized": true },
    "cif": { "maxRequestSize": 1048576, "maxResponseSize": 1048576, "initialized": true }
  },
  "storage": { "backend": "FILE", "path": "./data", "initialized": true }
}
```

**What This Proves:**
- Server is ready
- Governance pipeline initialized
- Strict mode enabled (fail-closed)

### 3. Memory Write with Receipt

**Request:**
```json
POST /memory/nodes
{
  "type": "person",
  "data": { "name": "Alice" },
  "idempotency_key": "demo-alice-001"
}
```

**Response:**
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
- ActionGate intercepts write operations
- Receipt generated with genome metadata (genome_id, genome_version)
- Policy ID traced to genome rule
- Idempotency enforced (repeat request returns same response)

### 4. Edge Creation (Governed Relationship)

**Request:**
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
- Receipts trace all mutations to genome

### 5. Search Results

**Request:**
```
GET /memory/search?q=Alice&limit=10
```

**Response:**
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
- Read operations pass through governance pipeline (no receipt, no mutation)

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

---

## Manual Step-by-Step

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

---

## Success Criteria

Demo is successful if:

1. ✅ Server boots without errors
2. ✅ Health check returns `"status": "healthy"`
3. ✅ Memory node creation returns receipt
4. ✅ Edge creation returns receipt
5. ✅ Search finds created nodes
6. ✅ All tests pass (`pnpm -r test`)
7. ✅ Demo script exits with status 0

---

## Troubleshooting

### Port 3000 already in use

```bash
export PORT=3001
pnpm demo
```

### `pnpm: command not found`

```bash
npm install -g pnpm
```

### Server fails to boot with "Genome signature invalid"

**Expected Behavior:** This is fail-closed working correctly.

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

### Dependencies fail to install (better-sqlite3)

```bash
pnpm approve-builds
pnpm install
```

### Demo script hangs at "Waiting for server..."

**Possible Causes:**
- Port already in use (`lsof -i :3000`)
- Build failed (run `pnpm -r build` manually)
- Missing dependencies (run `pnpm install`)

**Debug:**
```bash
# Run server in foreground to see errors
export MATHISON_STORE_BACKEND=FILE
export MATHISON_STORE_PATH=./data
pnpm --filter mathison-server start
```

---

## What This Demo Does NOT Cover

| Feature | See Instead |
|---------|-------------|
| LLM integration | [GitHub Models Setup](../45-integrations/github-models-setup.md) |
| Mobile deployment | [Mobile Deployment](../60-mobile/mobile-deployment.md) |
| Mesh networking | [Mesh Discovery](../50-mesh/mesh_discovery.md) |
| Production security | [Production Requirements](../61-operations/production-requirements.md) |
| Browser OI runtime | Open `quadratic.html` separately |

---

## How to Verify

Run the demo script and observe exit code:

```bash
pnpm demo
echo "Exit code: $?"
```

Exit code 0 = success, 1 = failure.

Run individual verification:

```bash
# Verify genome signature
pnpm tsx scripts/genome-verify.ts genomes/TOTK_ROOT_v1.0.0/genome.json

# Run all tests
pnpm -r test

# Check for governance pipeline bypass (should find none)
grep -r "storage.write" packages/mathison-server/src/routes/
```

---

## Implementation Pointers

| Component | Path |
|-----------|------|
| Demo script | `scripts/demo.mjs` |
| Server conformance tests | `packages/mathison-server/src/__tests__/server-conformance.test.ts` |
| Genome boot tests | `packages/mathison-server/src/__tests__/genome-boot-conformance.test.ts` |
| Memory write tests | `packages/mathison-server/src/__tests__/memory-write-conformance.test.ts` |
| ActionGate | `packages/mathison-governance/src/action-gate.ts` |

---

## Next Steps After Demo

| Task | Document |
|------|----------|
| Review governance | [Tiriti o te Kai](../31-governance/tiriti.md) |
| Check implementation status | [Governance Claims](../31-governance/governance-claims.md) |
| Understand architecture | [System Architecture](../20-architecture/system-architecture.md) |
| Review security model | [Threat Model](../61-operations/threat-model.md) |
| Explore API | [Jobs API](../40-apis/jobs_api.md), [Memory API](../40-apis/memory_api.md) |
