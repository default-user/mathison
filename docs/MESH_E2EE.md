# Mesh E2EE — READY_FOR_HUMAN

**Phase 7** — End-to-end encryption for mesh connections.

---

## Status: READY_FOR_HUMAN

Crypto primitives partially exist in `packages/mathison-mesh`, but require:
- Full E2EE handshake implementation
- Key rotation logic
- Replay protection tests
- Integration with discovery (Phase 6)

---

## Requirements

### MeshCrypto Interface

```typescript
interface MeshCrypto {
  // Identity keys (long-term)
  generateIdentityKeypair(): Promise<IdentityKeypair>;

  // Session keys (ephemeral)
  initiateHandshake(peerPublicKey: string): Promise<SessionKeys>;
  completeHandshake(initiatorEphemeral: string): Promise<SessionKeys>;

  // Message encryption
  encrypt(plaintext: Buffer, sessionKey: SessionKeys): EncryptedMessage;
  decrypt(encrypted: EncryptedMessage, sessionKey: SessionKeys): Buffer;

  // Key management
  rotateSessionKey(session_id: string): Promise<SessionKeys>;
  revokeSessionKey(session_id: string): Promise<void>;
}

interface IdentityKeypair {
  key_id: string;
  publicKey: string;   // X25519 or Ed25519
  privateKey: CryptoKey;  // NEVER logged or serialized
}

interface SessionKeys {
  session_id: string;
  encryptKey: Buffer;  // AES-256 or ChaCha20
  macKey: Buffer;      // HMAC-SHA256 or Poly1305
  counter: number;     // For replay protection
}

interface EncryptedMessage {
  session_id: string;
  nonce: string;       // Base64
  ciphertext: string;  // Base64
  mac: string;         // Base64
  counter: number;
}
```

---

## Handshake Protocol

**Phase 1: Key Exchange (X25519 ECDH)**
1. Alice generates ephemeral keypair (Alice_ephemeral)
2. Alice sends Alice_ephemeral.public + Alice_identity.public to Bob
3. Bob generates ephemeral keypair (Bob_ephemeral)
4. Bob derives shared secret: ECDH(Bob_ephemeral.private, Alice_ephemeral.public)
5. Bob sends Bob_ephemeral.public + Bob_identity.public to Alice
6. Alice derives shared secret: ECDH(Alice_ephemeral.private, Bob_ephemeral.public)
7. Both derive session keys: HKDF-SHA256(shared_secret, salt, info) → (encryptKey, macKey)

**Phase 2: Mutual Authentication**
8. Alice signs challenge: Sign(Alice_identity.private, challenge)
9. Bob verifies signature with Alice_identity.public
10. Bob signs challenge: Sign(Bob_identity.private, challenge)
11. Alice verifies signature with Bob_identity.public

---

## Encryption (AEAD)

Use **AES-256-GCM** or **ChaCha20-Poly1305**:
- **Nonce**: 12 bytes random (never reused for same key)
- **AAD** (Additional Authenticated Data): session_id + counter
- **Counter**: Monotonically increasing (replay protection)

Example:
```typescript
function encrypt(plaintext: Buffer, sessionKey: SessionKeys): EncryptedMessage {
  const nonce = randomBytes(12);
  const counter = sessionKey.counter++;

  const aad = Buffer.concat([
    Buffer.from(sessionKey.session_id),
    Buffer.from(counter.toString())
  ]);

  const cipher = createCipheriv('aes-256-gcm', sessionKey.encryptKey, nonce);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  const mac = cipher.getAuthTag();

  return {
    session_id: sessionKey.session_id,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    mac: mac.toString('base64'),
    counter
  };
}
```

---

## Replay Protection

- **Counter**: Each message has incrementing counter
- **Window**: Accept messages within window (e.g., counter ± 100)
- **Seen Set**: Track seen counters, reject duplicates
- **Rotation**: Rotate session keys every N messages (e.g., 1000)

---

## Key Custody

- **Identity keys**: Stored in StorageAdapter (encrypted at rest)
- **Session keys**: In-memory only, wiped on close
- **NEVER log keys** in receipts or errors
- Use secure memory wiping when available

---

## Implementation Checklist

- [ ] Implement X25519 ECDH handshake
- [ ] Implement AES-256-GCM encryption
- [ ] Implement counter-based replay protection
- [ ] Implement key rotation (session keys every 1000 messages)
- [ ] Add tests: roundtrip, tamper detection, replay rejection
- [ ] Integrate with StorageAdapter for identity key storage
- [ ] Add key revocation mechanism
- [ ] Document threat model (MITM, replay, forward secrecy)

---

## Testing

```typescript
// Test roundtrip
const alice = new MeshCrypto();
const bob = new MeshCrypto();

const aliceIdentity = await alice.generateIdentityKeypair();
const bobIdentity = await bob.generateIdentityKeypair();

const aliceSession = await alice.initiateHandshake(bobIdentity.publicKey);
const bobSession = await bob.completeHandshake(aliceIdentity.publicKey);

const plaintext = Buffer.from('Hello, Bob!');
const encrypted = alice.encrypt(plaintext, aliceSession);
const decrypted = bob.decrypt(encrypted, bobSession);

assert.equal(decrypted.toString(), 'Hello, Bob!');
```

---

## Threat Model

- **MITM**: Prevented by mutual authentication (Ed25519 signatures)
- **Replay**: Prevented by counter + seen-set
- **Forward Secrecy**: Ephemeral keys deleted after session
- **Key Compromise**: Rotate session keys frequently

---

## See Also

- [Mesh Discovery](./MESH_DISCOVERY.md)
- [Storage Adapter](./architecture.md#storage)
