# Mesh Network Integration Checklist

## Status
**Phase:** READY_FOR_HUMAN
**Blocker:** Requires network environment testing

## What's Implemented

### E2EE Crypto (`packages/mathison-mesh/src/crypto.ts`)
- [x] X25519-compatible key generation
- [x] ECDH shared secret derivation
- [x] AES-256-GCM encryption/decryption
- [x] Replay protection with sequence numbers
- [x] Secure session management
- [x] Envelope serialization/deserialization
- [x] 15+ unit tests passing

### Discovery Protocol (`packages/mathison-mesh/src/discovery.ts`)
- [x] UDP broadcast discovery (feature-flagged)
- [x] Peer lifecycle management (discovered, lost)
- [x] Configurable discovery parameters
- [x] Simulated discovery for testing
- [x] Event-based architecture

### Mesh Coordinator (`packages/mathison-mesh/src/index.ts`)
- [x] Mesh formation and dissolution
- [x] Node joining with privacy checks
- [x] Task distribution framework
- [x] Discovery mode support (proximity, broadcast, manual)

## What Needs Human Verification

### 1. Network Environment Testing
The discovery protocol uses UDP broadcast which may be blocked by:
- Corporate firewalls
- Cloud environments (AWS, GCP, Azure)
- Some residential routers

**To test:**
```bash
# Enable discovery
export MATHISON_MESH_DISCOVERY=true

# Start two instances on same network
# Instance 1
MATHISON_PORT=3000 pnpm server

# Instance 2 (different terminal)
MATHISON_PORT=3001 pnpm server

# Check discovery logs for "Discovered peer:" messages
```

### 2. mDNS/Bonjour Integration (Optional)
For more reliable LAN discovery:
- [ ] Install `bonjour` or `mdns` npm package
- [ ] Implement `discoverMDNSNodes()` in discovery.ts
- [ ] Register service as `_mathison._tcp.local`
- [ ] Handle service resolution

### 3. Production Crypto Audit
Before production use:
- [ ] Replace simplified key derivation with real X25519 (use `tweetnacl`)
- [ ] Add libsodium bindings for native performance
- [ ] Audit for timing attacks
- [ ] Add key rotation mechanism

### 4. NAT Traversal (Optional)
For mesh across networks:
- [ ] Evaluate STUN/TURN servers
- [ ] Consider WebRTC data channels
- [ ] Implement connection fallback logic

## Configuration Options

```bash
# Enable mesh discovery
MATHISON_MESH_DISCOVERY=true

# Discovery mode: 'broadcast' | 'mdns' | 'both'
MATHISON_MESH_DISCOVERY_MODE=broadcast

# UDP port for discovery
MATHISON_MESH_DISCOVERY_PORT=41234

# Beacon interval (ms)
MATHISON_MESH_BEACON_INTERVAL=5000

# Discovery timeout (ms)
MATHISON_MESH_DISCOVERY_TIMEOUT=15000

# Max peers
MATHISON_MESH_MAX_PEERS=20
```

## Testing Mesh E2EE

```typescript
import { SecureSession, generateKeyPair } from 'mathison-mesh';

// Create two nodes
const alice = new SecureSession();
const bob = new SecureSession();

// Exchange public keys (over network in production)
alice.establishSession(bob.getPublicKey());
bob.establishSession(alice.getPublicKey());

// Alice encrypts
const envelope = alice.encryptMessage('Hello Bob!');

// Bob decrypts
const message = bob.decryptMessage(envelope);
console.log(message.toString()); // "Hello Bob!"
```

## Estimated Effort
- Network testing: 2-4 hours
- mDNS integration (optional): 4-8 hours
- Crypto audit: 8-16 hours
- NAT traversal (optional): 16-40 hours
