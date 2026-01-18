# Mathison Quadratic Monolith

Single-file OI runtime implementing **two-plane architecture** with **growth ladder stages**.

## Overview

The Quadratic Monolith is a complete Ongoing Intelligence runtime in a single TypeScript file:

- **Plane A (Meaning)**: Governance (CIF + CDI) + Memory Graph + Receipt Hash Chain
- **Plane B (Capability)**: Stage-gated adapters (browser/system/network/mesh/orchestra)
- **Growth Ladder**: WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA
- **Runs Anywhere**: Node (CLI) or Browser (module)
- **Zero Dependencies**: Self-contained runtime (uses only Node/Browser built-ins)

## Architecture Invariants

1. **Two-Plane Separation**: Plane A never calls privileged ops directly; always via IntentEnvelope → Plane B adapters
2. **Growth Ladder**: Capabilities unlock progressively across 6 stages
3. **Fail-Closed**: Unknown action/stage/risk → DENY by default
4. **Receipt Hash Chain**: Every action appends to hash-chained log with replay protection
5. **CIF Boundary**: All inputs sanitized (ingress); outputs redacted (egress)
6. **CDI Gating**: Action allowlist per stage; risk threshold per posture
7. **Anti-Hive**: Each OI has namespace isolation; no identity fusion
8. **Checkpoint/Compact**: Receipt log auto-compacts; checkpoints preserve state
9. **Runtime Polymorphism**: Same code runs in Node and Browser
10. **Single-File Monolith**: Zero internal package imports

## Node CLI Usage

### Installation

```bash
cd packages/mathison-quadratic
pnpm install
pnpm run build
```

### Commands

**Initialize OI:**
```bash
tsx quad.ts init
```

**Check status:**
```bash
tsx quad.ts status
```

**Dispatch action:**
```bash
# Simple text
tsx quad.ts dispatch "hello"

# JSON action
tsx quad.ts dispatch '{"action":"memory.put","args":{"data":{"test":"data"}}}'
```

**Upgrade stage:**
```bash
tsx quad.ts upgrade BROWSER
tsx quad.ts upgrade SYSTEM
```

**Run self-tests:**
```bash
tsx quad.ts selftest
```

### From Root Package Scripts

```bash
# From mathison root
pnpm quad:selftest        # Run self-tests
pnpm quad:node            # Start interactive CLI
pnpm quad:build           # Build TypeScript
```

## Browser Usage

```typescript
import { bootBrowser, createOI } from 'mathison-quadratic';

// Boot with UI
const container = document.getElementById('oi-container')!;
const oi = bootBrowser({ mount: container });

// Or create programmatically
const oi = createOI({ stage: 'BROWSER', posture: 'NORMAL' });

// Dispatch actions
const result = await oi.dispatch({
  action: 'memory.put',
  args: { data: { note: 'Hello from browser' } }
});

// Upgrade stage
await oi.upgrade('NETWORK');

// Export/Import bundle
const bundle = await oi.exportBundle();
localStorage.setItem('oi-bundle', bundle);

const restored = createOI();
await restored.importBundle(bundle);
```

## Growth Ladder Stages

| Stage | Capabilities | Risk Class Allowed |
|-------|-------------|-------------------|
| **WINDOW** | Local memory (ephemeral), basic queries | NONE, LOW |
| **BROWSER** | + Persistent storage (localStorage/IndexedDB) | + MEDIUM |
| **SYSTEM** | + Filesystem access (Node only, allowlisted paths) | + HIGH |
| **NETWORK** | + HTTP calls (allowlisted domains) | + HIGH |
| **MESH** | + Peer messaging (BeamEnvelope-style) | + CRITICAL |
| **ORCHESTRA** | + Multi-OI coordination (anti-hive enforced) | + CRITICAL |

## Actions by Stage

### WINDOW Stage
- `memory.put` - Store node in memory graph
- `memory.get` - Retrieve node by ID
- `memory.search` - Search nodes by text
- `status` - Get OI status
- `help` - Show help

### BROWSER Stage (+WINDOW)
- `storage.persist` - Save checkpoint to localStorage
- `storage.load` - Load checkpoint from localStorage

### SYSTEM Stage (+BROWSER)
- `fs.read` - Read file (allowlisted paths only)
- `fs.write` - Write file (allowlisted paths only)

### NETWORK Stage (+SYSTEM)
- `http.get` - HTTP GET (allowlisted domains)
- `http.post` - HTTP POST (allowlisted domains)
- `llm.complete` - LLM inference (GitHub Models API → Anthropic fallback)

### MESH Stage (+NETWORK)
- `mesh.send` - Send message to peer OI
- `mesh.receive` - Receive message from peer

### ORCHESTRA Stage (+MESH)
- `orchestra.coordinate` - Coordinate multiple OIs
- `orchestra.delegate` - Delegate task to OI

## Governance Pipeline

Every action flows through:

```
Input
  ↓
CIF Ingress (sanitize, size check)
  ↓
CDI Decide (stage gate, action allowlist, risk check)
  ↓
Adapter Execute (Plane B capability)
  ↓
CDI Output Check
  ↓
CIF Egress (redact, size check)
  ↓
Receipt Append (hash chain)
  ↓
Output
```

## Receipt System

Every action generates a receipt:

```typescript
{
  receipt_id: "1735569823456-abc123",
  intent_id: "1735569823450-xyz789",
  outcome: "ALLOW" | "DENY",
  reason: "ALLOW" | "DENY_UNKNOWN_STAGE" | "DENY_RISK" | ...,
  artifacts: { /* result data */ },
  logs_hash: "a1b2c3...",      // SHA-256 of receipt
  prev_hash: "d4e5f6...",      // Previous receipt hash
  timestamp: 1735569823456,
  adapter_sig?: "..."
}
```

**Hash Chain Properties:**
- Tamper-evident (any modification breaks chain)
- Replay protection (seen-intent set)
- Auto-compaction (keeps last 1000 receipts)
- Checkpoint/restore support

## Anti-Hive Design

Each OI instance maintains:
- **Unique OI ID** - Namespace isolation
- **Private memory graph** - No shared mutable state
- **Private receipt log** - Independent audit trail
- **Message-passing only** - MESH stage uses envelopes

**No identity fusion**: Cross-OI communication via explicit BeamEnvelope messages with taint labels.

## Examples

### Node: Store and Search Memory

```bash
# Store data
tsx quad.ts dispatch '{"action":"memory.put","args":{"data":{"note":"Meeting notes","date":"2024-01-15"}}}'

# Search
tsx quad.ts dispatch '{"action":"memory.search","args":{"query":"meeting"}}'
```

### Node: Upgrade and Use Filesystem

```bash
# Upgrade to SYSTEM stage
tsx quad.ts upgrade SYSTEM

# Write file (allowlisted path)
tsx quad.ts dispatch '{"action":"fs.write","args":{"path":"./data/test.txt","content":"Hello"}}'

# Read file
tsx quad.ts dispatch '{"action":"fs.read","args":{"path":"./data/test.txt"}}'
```

### Browser: Persistent OI

```html
<!DOCTYPE html>
<html>
<body>
  <div id="oi-container"></div>
  <script type="module">
    import { bootBrowser } from './dist/quad.js';

    const oi = bootBrowser({
      mount: document.getElementById('oi-container')
    });

    // OI is now interactive
  </script>
</body>
</html>
```

## Testing

Run the built-in self-test suite:

```bash
pnpm quad:selftest
```

Tests verify:
1. Allow case (memory.put)
2. Deny case (unknown action)
3. Stage gating (http.get requires NETWORK stage)
4. Replay protection (duplicate intent_id throws)
5. Checkpoint/restore (export + import bundle)

## File Structure

```
mathison-quadratic/
├── quad.ts           # Single-file runtime (1200+ lines)
├── package.json      # Thin wrapper
├── tsconfig.json     # TypeScript config
└── README.md         # This file
```

**All runtime logic is in `quad.ts`** - no imports from other Mathison packages.

## Implementation Notes

### Crypto (Hash Chain)
- **Node**: Uses built-in `crypto` module (SHA-256)
- **Browser**: Uses `window.crypto.subtle` (WebCrypto API)
- **Fallback**: Simple hash for minimal environments

### Storage
- **Node**: In-memory + optional filesystem persistence
- **Browser**: In-memory + localStorage persistence
- **Memory**: Nodes + Edges with simple text search

### CIF Redaction
Default patterns (configurable):
- `password: "..."`
- `token: "..."`
- `api_key: "..."`

### CDI Policy
- **Stage gates**: Progressive unlock via `upgrade()`
- **Action allowlists**: Per-stage action sets
- **Risk thresholds**: Posture-based limits (LOW/NORMAL/HIGH)

## Limitations & Future Work

**Current Limitations:**
- Text search only (no vector embeddings)
- Simple allowlist-based security (no capability tokens)
- No mesh/orchestra adapters implemented yet (stubs only)
- localStorage has quota limits (~5-10MB in most browsers)

**Current Features:**
- ✓ LLM integration (GitHub Models API with free tier, Anthropic fallback)
- ✓ Mesh protocol (BeamEnvelope messaging)
- ✓ Orchestra coordination protocol

**Future Enhancements:**
- Vector search integration (embeddings via LLM adapter)
- Capability-based security tokens
- Enhanced peer discovery (WebRTC/WebSocket)
- IndexedDB for larger browser storage

## License

See main Mathison repository LICENSE file.

## Governance

This runtime enforces **Tiriti o te Kai v1.0** principles:
- People first; tools serve
- Consent and stop always win
- Fail-closed on uncertainty
- No hive mind (anti-identity-fusion)
- Honest limits (no false capabilities)

---

**Quadratic Monolith**: Two planes. One file. Unbounded growth. Bounded by governance.
