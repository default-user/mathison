# Mesh Discovery — READY_FOR_HUMAN

**Phase 6** — Consent-gated peer discovery with anti-hive guarantees.

---

## Who This Is For

- **Mesh engineers** implementing peer-to-peer discovery mechanisms
- **Security reviewers** auditing anti-hive guarantees and consent gates
- **Integration engineers** connecting discovery to E2EE handshakes
- **Network operators** deploying multi-node environments with LAN discovery

---

## Why This Exists

**Problem:** P2P systems often auto-connect discovered peers, creating emergent hive behavior without human consent.

**Solution:** Mesh discovery decouples discovery from connection. Discovery proposes peers; humans approve connections. This preserves individual agency while enabling network formation.

**Key principle:** Discovery is a proposal mechanism, not an automation engine.

---

## Guarantees / Invariants

1. **Discovery ≠ Connection**: Discovery NEVER triggers automatic peer connections
2. **Explicit consent required**: Every peer connection requires human approval
3. **Rate-limited proposals**: Maximum 10 discovery proposals per minute
4. **Attestation-gated**: Peers must prove `genome_id` before consent prompt shows
5. **Allowlist/denylist enforced**: CIDR blocks and peer ID filters applied before proposals
6. **No credential leakage**: Discovery announcements contain only public identity data

---

## Non-Goals

- **Automatic mesh formation** — always requires human consent
- **Global peer discovery** — LAN-first; DHT is future work
- **Trust-on-first-use (TOFU)** — all peers require explicit approval
- **NAT traversal** — discovery announces local addresses; relay/STUN out of scope
- **Peer reputation** — denylist only; no scoring system

---

## How to Verify

### Test discovery isolation (no auto-connect):
```bash
# Terminal 1: Start node A
MATHISON_MESH_DISCOVERY=mdns pnpm server

# Terminal 2: Start node B
MATHISON_MESH_DISCOVERY=mdns MATHISON_PORT=3001 pnpm server

# Verify: Node A logs "Peer candidate discovered" but does NOT connect
# Verify: No E2EE handshake initiated without human approval
```

### Test rate limiting:
```bash
# Simulate 20 peer announcements in 1 minute
# Verify: Only first 10 trigger consent prompts
# Verify: Excess announcements logged as rate-limited
```

### Test attestation requirement:
```typescript
// Announce peer without genome signature
const invalidPeer = { peer_id: 'test', genome_id: 'unsigned', ... };
discovery.announce(invalidPeer);

// Verify: No consent prompt shown
// Verify: Rejection logged: "Missing genome attestation"
```

### Test denylist enforcement:
```typescript
// Add peer to denylist
mesh.denyPeer('peer-abc');

// Verify: Future announcements from 'peer-abc' ignored
// Verify: No consent prompts for denied peer
```

---

## Implementation Pointers

- **Discovery adapters**: `packages/mathison-mesh/src/discovery/`
- **Consent gate hook**: Integration point for UI layer (not implemented in core)
- **mDNS library recommendation**: `mdns` or `bonjour` npm packages
- **UDP broadcast**: Use Node.js `dgram` module for LAN broadcast
- **Rate limiter**: Token bucket algorithm, 10 tokens/minute
- **Attestation verification**: Use genome's public key to verify signed `peer_id`
- **Mock adapter for tests**: `MockDiscoveryAdapter` for deterministic testing

---

## Status: READY_FOR_HUMAN

Mesh discovery primitives exist in `packages/mathison-mesh`, but require:
- Real mDNS/UDP broadcast implementation (currently mocked)
- Human consent gate integration
- Production testing in multi-node environment

---

## Requirements

### Discovery Adapter Interface

```typescript
interface DiscoveryAdapter {
  discover(filter?: DiscoveryFilter): AsyncIterable<PeerCandidate>;
  announce(identity: LocalIdentity): Promise<void>;
  stop(): Promise<void>;
}

interface PeerCandidate {
  peer_id: string;
  addresses: string[];  // e.g., ['192.168.1.100:3000']
  capabilities: string[];
  genome_id: string;
  announced_at: number;
}
```

### Discovery Modes

1. **Manual Discovery**: Explicit peer add (always available)
2. **LAN Discovery**: mDNS or UDP broadcast (requires real network)
3. **DHT Discovery**: Kademlia-style DHT (future)

---

## Anti-Hive Principles

1. **Discovery ≠ Connection**: Discovery only proposes peers, NEVER auto-connects
2. **Explicit Consent Required**: Human must approve each peer connection
3. **Rate Limiting**: Max discovery proposals per minute
4. **Allowlist/Denylist**: CIDR blocks + peer ID filters
5. **Attestation**: Peers must prove genome_id before connection

---

## Consent Gate Flow

```
1. Discovery announces peer_candidate
2. System UI shows notification: "Peer X requests connection (genome: Y)"
3. Human reviews peer info + genome attestation
4. Human clicks "Allow" or "Deny"
5. If Allow: system initiates E2EE handshake (Phase 7)
6. If Deny: peer added to denylist
```

---

## Implementation Checklist

- [ ] Implement real mDNS discovery adapter (using mdns or bonjour npm package)
- [ ] Implement UDP broadcast discovery adapter
- [ ] Add consent gate UI integration point
- [ ] Add rate limiting (max 10 proposals/minute)
- [ ] Add CIDR allowlist/denylist support
- [ ] Add peer attestation (genome signature verification before consent prompt)
- [ ] Add deterministic tests with mocked network layer
- [ ] Document threat model (Sybil attacks, replay attacks, etc.)

---

## Testing

```bash
# Terminal 1: Start node A
MATHISON_MESH_DISCOVERY=mdns pnpm server

# Terminal 2: Start node B
MATHISON_MESH_DISCOVERY=mdns MATHISON_PORT=3001 pnpm server

# Node A should discover Node B (proposal logged, awaiting consent)
```

---

## Threat Model

- **Sybil Attack**: Malicious peer announces many fake identities
  - Mitigation: Rate limiting + genome attestation
- **Replay Attack**: Attacker replays old discovery announcements
  - Mitigation: Timestamp validation + nonce
- **MITM**: Attacker intercepts discovery messages
  - Mitigation: E2EE handshake in Phase 7

---

## See Also

- [Mesh E2EE](./mesh_e2ee.md)
- [Architecture](../architecture.md)
