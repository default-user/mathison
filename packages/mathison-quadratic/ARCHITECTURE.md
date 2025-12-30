# Quadratic Monolith Architecture

## 10-Line Invariant Summary

1. **Two-Plane Separation**: Plane A (meaning) never calls privileged ops directly; always via IntentEnvelope → Plane B (capability adapters)
2. **Growth Ladder**: Capabilities unlock progressively: WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA
3. **Fail-Closed**: Unknown action/stage/risk → DENY by default; no silent escalation
4. **Receipt Hash Chain**: Every action appends to hash-chained log; replay protection via seen-intent set
5. **CIF Boundary**: All inputs sanitized (ingress); all outputs redacted (egress); size-limited
6. **CDI Gating**: Action allowlist per stage; risk threshold per posture; structural enforcement
7. **Anti-Hive**: Each OI has namespace isolation (oi_id); no identity fusion; mesh = message-passing only
8. **Checkpoint/Compact**: Receipt log auto-compacts at MAX_LOG_SIZE; checkpoints preserve last N receipts
9. **Runtime Polymorphism**: Same code runs in Node (CLI) and Browser (module); adapters install per environment
10. **Single-File Monolith**: All runtime logic in one TypeScript file; zero internal package imports; minimal external deps

## Two-Plane Architecture

```
┌─────────────────────────────────────────────────────┐
│  PLANE A: MEANING (Governance + Memory + Receipts)  │
│  ┌───────────────────────────────────────────────┐  │
│  │  CIF (Context Integrity Firewall)             │  │
│  │  - Ingress: Sanitize, validate, quarantine    │  │
│  │  - Egress: Redact, size-check                 │  │
│  └────────────────┬──────────────────────────────┘  │
│                   ↓                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  CDI (Conscience Decision Interface)          │  │
│  │  - Stage gate: Check required stage           │  │
│  │  - Action allowlist: Per-stage permissions    │  │
│  │  - Risk threshold: Posture-based limits       │  │
│  └────────────────┬──────────────────────────────┘  │
│                   ↓                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Intent Generation                             │  │
│  │  IntentEnvelope {                              │  │
│  │    intent_id, action, args, risk_class,       │  │
│  │    stage_required, basis, signatures          │  │
│  │  }                                             │  │
│  └────────────────┬──────────────────────────────┘  │
│                   ↓                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Memory Graph                                  │  │
│  │  - Nodes (id, type, data, metadata)           │  │
│  │  - Edges (source, target, type)               │  │
│  │  - Simple text search                         │  │
│  │  - Checkpoint/restore                         │  │
│  └────────────────┬──────────────────────────────┘  │
│                   ↓                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Receipt Log (Hash Chain)                     │  │
│  │  - Append-only                                 │  │
│  │  - prev_hash → logs_hash chain                │  │
│  │  - Replay protection (seen intents)           │  │
│  │  - Auto-compact (MAX_LOG_SIZE)                │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      ↓
        ┌─────────────────────────────┐
        │  QUADRATIC BOUNDARY          │
        │  (Intent → Receipt)          │
        └─────────────┬───────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│  PLANE B: CAPABILITY (Adapters)                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Adapter Registry                              │  │
│  │  - MemoryAdapter (all stages)                  │  │
│  │  - StorageAdapter (BROWSER+)                   │  │
│  │  - SystemAdapter (SYSTEM+, Node only)          │  │
│  │  - NetworkAdapter (NETWORK+)                   │  │
│  │  - MeshAdapter (MESH+, future)                 │  │
│  │  - OrchestraAdapter (ORCHESTRA+, future)       │  │
│  └────────────────┬──────────────────────────────┘  │
│                   ↓                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Execute Action                                │  │
│  │  - Validate intent against adapter caps       │  │
│  │  - Execute privileged operation                │  │
│  │  - Return artifacts                            │  │
│  └────────────────┬──────────────────────────────┘  │
│                   ↓                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Receipt Generation                            │  │
│  │  ReceiptEnvelope {                             │  │
│  │    receipt_id, intent_id,                      │  │
│  │    outcome: ALLOW|DENY,                        │  │
│  │    reason, artifacts,                          │  │
│  │    logs_hash, prev_hash,                       │  │
│  │    timestamp, adapter_sig                      │  │
│  │  }                                             │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Growth Ladder Progression

```
WINDOW (Stage 0)
  └─ Capabilities: Local memory (ephemeral), basic queries
  └─ Adapters: MemoryAdapter, StorageAdapter (in-memory only)
  └─ Risk Allowed: NONE, LOW
  └─ Actions: memory.put, memory.get, memory.search, status, help
  └─ Environment: Any (Node/Browser)

BROWSER (Stage 1)
  └─ Capabilities: + Persistent storage (localStorage/IndexedDB)
  └─ Adapters: + StorageAdapter (persistent)
  └─ Risk Allowed: + MEDIUM
  └─ Actions: + storage.persist, storage.load
  └─ Environment: Browser preferred

SYSTEM (Stage 2)
  └─ Capabilities: + Filesystem access (allowlisted paths)
  └─ Adapters: + SystemAdapter
  └─ Risk Allowed: + HIGH
  └─ Actions: + fs.read, fs.write
  └─ Environment: Node only

NETWORK (Stage 3)
  └─ Capabilities: + HTTP calls (allowlisted domains)
  └─ Adapters: + NetworkAdapter
  └─ Risk Allowed: + HIGH
  └─ Actions: + http.get, http.post
  └─ Environment: Node/Browser

MESH (Stage 4)
  └─ Capabilities: + Peer messaging (BeamEnvelope protocol)
  └─ Adapters: + MeshAdapter
  └─ Risk Allowed: + CRITICAL
  └─ Actions: + mesh.send, mesh.receive
  └─ Environment: Node/Browser

ORCHESTRA (Stage 5)
  └─ Capabilities: + Multi-OI coordination (anti-hive enforced)
  └─ Adapters: + OrchestraAdapter
  └─ Risk Allowed: + CRITICAL
  └─ Actions: + orchestra.coordinate, orchestra.delegate
  └─ Environment: Node preferred
```

## Governance Pipeline (Every Action)

```
1. Input → CIF.ingress()
   - Size check (max 1MB)
   - Sanitize dangerous patterns
   - Quarantine untrusted content

2. CDI.decide(intent)
   - Stage gate: intent.stage_required <= oi.state.stage
   - Action allowlist: action in allowedActions[stage]
   - Risk threshold: risk_class <= riskThresholds[posture]
   - Return: { allow: boolean, reason: ReceiptReason }

3. If DENY:
   - Append DENY receipt
   - Return { success: false, reason, receipt_id }

4. If ALLOW:
   - Adapter.execute(action, args)
   - CDI.outputCheck(result) [placeholder]
   - CIF.egress(result)
   - Append ALLOW receipt
   - Return { success: true, data, receipt_id }
```

## Receipt Hash Chain

```
Receipt 0:  prev_hash=0000...0000, logs_hash=a1b2c3d4...
              ↓
Receipt 1:  prev_hash=a1b2c3d4..., logs_hash=e5f6g7h8...
              ↓
Receipt 2:  prev_hash=e5f6g7h8..., logs_hash=i9j0k1l2...
              ↓
Receipt N:  prev_hash=..., logs_hash=...

Properties:
- Tamper-evident: Change any receipt → breaks chain
- Replay protection: seenIntents Set tracks intent_ids
- Auto-compact: Keep last 1000 receipts after MAX_LOG_SIZE
- Checkpoint: Export full receipt array for restore
```

## Anti-Hive Enforcement

Each OI instance maintains:

```typescript
OI {
  oi_id: unique,              // Namespace isolation
  memory: MemoryStore,        // Private graph
  receipts: ReceiptLog,       // Private audit trail
  adapters: Map<name, Adapter> // Stage-gated capabilities
}
```

**No shared state**:
- Memory graphs are per-OI
- Receipt logs are per-OI
- Mesh messages use explicit envelopes with taint labels
- Orchestra coordination = message-passing, not shared memory

**No identity fusion**:
- Each OI maintains sovereign decision-making
- Cross-OI communication requires explicit consent
- No raw self-model export (only checkpoint bundles)

## Runtime Polymorphism

```typescript
// Runtime detection
const IS_NODE = typeof process !== 'undefined' && process.versions?.node;
const IS_BROWSER = typeof window !== 'undefined';

// Crypto
if (IS_NODE) {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
} else if (IS_BROWSER && window.crypto?.subtle) {
  const buffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(data));
  return arrayToHex(buffer);
}

// Storage
class StorageAdapter {
  async execute(action, args) {
    if (action === 'storage.persist') {
      if (IS_NODE && args.path) {
        const fs = await import('fs/promises');
        await fs.writeFile(args.path, bundle);
      } else if (IS_BROWSER && window.localStorage) {
        window.localStorage.setItem('mathison_bundle', bundle);
      }
    }
  }
}
```

## File Structure (Single File)

```typescript
quad.ts (1113 lines):

// Runtime Detection (10 lines)
// Types & Enums (130 lines)
// Crypto Utilities (30 lines)
// Memory Store (100 lines)
// Receipt System (80 lines)
// CIF (50 lines)
// CDI (90 lines)
// Adapters (200 lines)
// OI Core (250 lines)
// Browser Boot (60 lines)
// Factory (10 lines)
// CLI (100 lines)
// Architecture Comments (20 lines)
```

**Zero imports** from other Mathison packages. Only Node/Browser built-ins.

## Extension Points

### Adding New Adapters

```typescript
class CustomAdapter implements Adapter {
  name = 'custom';

  async execute(action: string, args: Record<string, any>): Promise<any> {
    switch (action) {
      case 'custom.action':
        // Your implementation
        return { result: 'data' };
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

// Register in OI.installBaseAdapters()
if (this.state.stage >= Stage.CUSTOM_STAGE) {
  this.adapters.set('custom', new CustomAdapter());
}
```

### Adding New Actions

Update CDI allowlist:

```typescript
allowedActions.set(Stage.CUSTOM_STAGE, new Set([
  ...allowedActions.get(Stage.PREVIOUS_STAGE)!,
  'custom.action',
  'custom.other',
]));
```

### Custom CIF Patterns

```typescript
this.cif = new CIF({
  maxInputSize: 1024 * 1024,
  maxOutputSize: 1024 * 1024,
  redactPatterns: [
    /password["\s:=]+[^\s"]+/gi,
    /token["\s:=]+[^\s"]+/gi,
    /api[_-]?key["\s:=]+[^\s"]+/gi,
    /custom_secret["\s:=]+[^\s"]+/gi, // Add your patterns
  ],
});
```

## Performance Characteristics

- **Memory**: O(N) for N nodes/edges in graph
- **Search**: O(N) linear scan (no indexing yet)
- **Receipt append**: O(1) amortized (with periodic compaction)
- **Hash chain verify**: O(N) for full chain
- **Checkpoint**: O(N) serialize all nodes/edges/receipts

**Scalability limits**:
- Browser localStorage: ~5-10MB typical quota
- Node in-memory: Limited by available RAM
- Receipt log: Auto-compacts at 10,000 receipts

## Security Properties

1. **Stage Gating**: Cannot call higher-stage actions without upgrade
2. **Action Allowlist**: Only explicit per-stage actions allowed
3. **Risk Thresholds**: Posture controls max risk class
4. **Replay Protection**: Duplicate intent_id throws error
5. **Tamper Evidence**: Receipt hash chain detects modifications
6. **CIF Redaction**: Sensitive patterns removed from output
7. **Size Limits**: 1MB max input/output prevents DoS
8. **Anti-Hive**: Namespace isolation prevents identity fusion

## Future Enhancements

- [ ] Vector search (embeddings via adapter)
- [ ] Capability tokens (more granular than stage gates)
- [ ] Actual mesh protocol (BeamEnvelope implementation)
- [ ] Orchestra coordination (multi-OI task delegation)
- [ ] LLM integration (via NetworkAdapter or custom)
- [ ] IndexedDB storage (for larger browser storage)
- [ ] Receipt verification CLI (`quad verify`)
- [ ] Policy DSL (more flexible than hardcoded allowlists)

---

**The Quadratic Monolith proves**: Complex governance + sophisticated capabilities can fit in a single, readable, portable file.
