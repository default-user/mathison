# Mesh Discovery — READY_FOR_HUMAN

**Phase 6** — Consent-gated peer discovery with anti-hive guarantees.

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

- [Mesh E2EE](./MESH_E2EE.md)
- [Architecture](./architecture.md)
