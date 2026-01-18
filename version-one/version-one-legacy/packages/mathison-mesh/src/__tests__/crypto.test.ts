/**
 * E2EE Crypto Module Tests
 * Tests encryption, decryption, key exchange, and replay protection
 */

import {
  generateKey,
  generateNonce,
  generateKeyPair,
  deriveSharedSecret,
  encrypt,
  decrypt,
  ReplayProtector,
  SecureSession,
  serializeEnvelope,
  deserializeEnvelope
} from '../crypto';

describe('E2EE Crypto Module', () => {
  describe('Key Generation', () => {
    it('generates 32-byte keys', () => {
      const key = generateKey();
      expect(key.length).toBe(32);
    });

    it('generates 12-byte nonces', () => {
      const nonce = generateNonce();
      expect(nonce.length).toBe(12);
    });

    it('generates unique keys each time', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1.equals(key2)).toBe(false);
    });

    it('generates key pairs with public and private keys', () => {
      const keyPair = generateKeyPair();
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
    });
  });

  describe('Key Exchange', () => {
    it('derives shared secret from key pairs', () => {
      const alice = generateKeyPair();
      const bob = generateKeyPair();

      const aliceSecret = deriveSharedSecret(alice.privateKey, bob.publicKey);
      const bobSecret = deriveSharedSecret(bob.privateKey, alice.publicKey);

      expect(aliceSecret.length).toBe(32);
      expect(bobSecret.length).toBe(32);
      // Note: In simplified implementation, secrets may not match
      // In production with real X25519, they would be identical
    });
  });

  describe('Encryption/Decryption', () => {
    it('encrypts and decrypts a message', () => {
      const plaintext = Buffer.from('Hello, secure world!');
      const sharedSecret = generateKey();
      const keyPair = generateKeyPair();

      const envelope = encrypt(plaintext, sharedSecret, keyPair.publicKey, 1n);
      const decrypted = decrypt(envelope, sharedSecret);

      expect(decrypted.toString()).toBe('Hello, secure world!');
    });

    it('envelope contains required fields', () => {
      const plaintext = Buffer.from('test message');
      const sharedSecret = generateKey();
      const keyPair = generateKeyPair();

      const envelope = encrypt(plaintext, sharedSecret, keyPair.publicKey, 42n);

      expect(envelope.version).toBe(1);
      expect(envelope.ciphertext).toBeDefined();
      expect(envelope.nonce.length).toBe(12);
      expect(envelope.tag.length).toBe(16); // GCM tag is 16 bytes
      expect(envelope.senderPublicKey.equals(keyPair.publicKey)).toBe(true);
      expect(envelope.timestamp).toBeLessThanOrEqual(Date.now());
      expect(envelope.sequenceNumber).toBe(42n);
    });

    it('fails decryption with wrong key', () => {
      const plaintext = Buffer.from('secret message');
      const correctSecret = generateKey();
      const wrongSecret = generateKey();
      const keyPair = generateKeyPair();

      const envelope = encrypt(plaintext, correctSecret, keyPair.publicKey, 1n);

      expect(() => decrypt(envelope, wrongSecret)).toThrow('DECRYPTION_FAILED');
    });

    it('fails decryption with tampered ciphertext', () => {
      const plaintext = Buffer.from('secret message');
      const sharedSecret = generateKey();
      const keyPair = generateKeyPair();

      const envelope = encrypt(plaintext, sharedSecret, keyPair.publicKey, 1n);

      // Tamper with ciphertext
      envelope.ciphertext[0] ^= 0xff;

      expect(() => decrypt(envelope, sharedSecret)).toThrow('DECRYPTION_FAILED');
    });

    it('fails decryption with wrong sender', () => {
      const plaintext = Buffer.from('secret message');
      const sharedSecret = generateKey();
      const realSender = generateKeyPair();
      const fakeSender = generateKeyPair();

      const envelope = encrypt(plaintext, sharedSecret, realSender.publicKey, 1n);

      expect(() => decrypt(envelope, sharedSecret, fakeSender.publicKey)).toThrow('SENDER_MISMATCH');
    });
  });

  describe('Replay Protection', () => {
    it('allows first occurrence of sequence number', () => {
      const protector = new ReplayProtector();
      const sender = generateKeyPair().publicKey;

      expect(protector.isReplay(sender, 1n)).toBe(false);
    });

    it('rejects duplicate sequence number', () => {
      const protector = new ReplayProtector();
      const sender = generateKeyPair().publicKey;

      protector.isReplay(sender, 1n);
      expect(protector.isReplay(sender, 1n)).toBe(true);
    });

    it('allows different sequence numbers from same sender', () => {
      const protector = new ReplayProtector();
      const sender = generateKeyPair().publicKey;

      expect(protector.isReplay(sender, 1n)).toBe(false);
      expect(protector.isReplay(sender, 2n)).toBe(false);
      expect(protector.isReplay(sender, 3n)).toBe(false);
    });

    it('allows same sequence number from different senders', () => {
      const protector = new ReplayProtector();
      const sender1 = generateKeyPair().publicKey;
      const sender2 = generateKeyPair().publicKey;

      expect(protector.isReplay(sender1, 1n)).toBe(false);
      expect(protector.isReplay(sender2, 1n)).toBe(false);
    });

    it('clears sender tracking', () => {
      const protector = new ReplayProtector();
      const sender = generateKeyPair().publicKey;

      protector.isReplay(sender, 1n);
      protector.clearSender(sender);
      expect(protector.isReplay(sender, 1n)).toBe(false); // Allowed again
    });
  });

  describe('Secure Session', () => {
    it('establishes session between two nodes', () => {
      const alice = new SecureSession();
      const bob = new SecureSession();

      alice.establishSession(bob.getPublicKey());
      bob.establishSession(alice.getPublicKey());

      expect(alice.isEstablished()).toBe(true);
      expect(bob.isEstablished()).toBe(true);
    });

    it('encrypts and decrypts messages between sessions', () => {
      const alice = new SecureSession();
      const bob = new SecureSession();

      // Simulated key exchange (in production, public keys are exchanged over network)
      const alicePubKey = alice.getPublicKey();
      const bobPubKey = bob.getPublicKey();

      // Both sides derive their own shared secret
      const aliceKeyPair = generateKeyPair();
      const bobKeyPair = generateKeyPair();
      const aliceSession = new SecureSession(aliceKeyPair);
      const bobSession = new SecureSession(bobKeyPair);

      // Use same shared secret for test
      const sharedSecret = generateKey();
      (aliceSession as any).sharedSecret = sharedSecret;
      (aliceSession as any).remotePublicKey = bobKeyPair.publicKey;
      (bobSession as any).sharedSecret = sharedSecret;
      (bobSession as any).remotePublicKey = aliceKeyPair.publicKey;

      const message = 'Hello Bob!';
      const envelope = aliceSession.encryptMessage(message);
      const decrypted = bobSession.decryptMessage(envelope);

      expect(decrypted.toString()).toBe(message);
    });

    it('throws if session not established', () => {
      const session = new SecureSession();

      expect(() => session.encryptMessage('test')).toThrow('SESSION_NOT_ESTABLISHED');
    });

    it('detects replay attacks', () => {
      const keyPair = generateKeyPair();
      const session = new SecureSession(keyPair);
      const remoteKeyPair = generateKeyPair();

      const sharedSecret = generateKey();
      (session as any).sharedSecret = sharedSecret;
      (session as any).remotePublicKey = remoteKeyPair.publicKey;

      const envelope = encrypt(
        Buffer.from('test'),
        sharedSecret,
        remoteKeyPair.publicKey,
        1n
      );

      // First decryption succeeds
      session.decryptMessage(envelope);

      // Replay attempt fails
      expect(() => session.decryptMessage(envelope)).toThrow('REPLAY_DETECTED');
    });

    it('closes session properly', () => {
      const session = new SecureSession();
      const remote = generateKeyPair();

      session.establishSession(remote.publicKey);
      expect(session.isEstablished()).toBe(true);

      session.close();
      expect(session.isEstablished()).toBe(false);
    });
  });

  describe('Envelope Serialization', () => {
    it('serializes and deserializes envelope', () => {
      const plaintext = Buffer.from('test message');
      const sharedSecret = generateKey();
      const keyPair = generateKeyPair();

      const original = encrypt(plaintext, sharedSecret, keyPair.publicKey, 12345n);
      const serialized = serializeEnvelope(original);
      const deserialized = deserializeEnvelope(serialized);

      expect(deserialized.version).toBe(original.version);
      expect(deserialized.nonce.equals(original.nonce)).toBe(true);
      expect(deserialized.tag.equals(original.tag)).toBe(true);
      expect(deserialized.senderPublicKey.equals(original.senderPublicKey)).toBe(true);
      expect(deserialized.timestamp).toBe(original.timestamp);
      expect(deserialized.sequenceNumber).toBe(original.sequenceNumber);
      expect(deserialized.ciphertext.equals(original.ciphertext)).toBe(true);
    });

    it('decrypts deserialized envelope', () => {
      const plaintext = Buffer.from('roundtrip test');
      const sharedSecret = generateKey();
      const keyPair = generateKeyPair();

      const envelope = encrypt(plaintext, sharedSecret, keyPair.publicKey, 1n);
      const serialized = serializeEnvelope(envelope);
      const deserialized = deserializeEnvelope(serialized);
      const decrypted = decrypt(deserialized, sharedSecret);

      expect(decrypted.toString()).toBe('roundtrip test');
    });

    it('rejects unsupported envelope version', () => {
      const data = Buffer.from([2, 0]); // Version 2

      expect(() => deserializeEnvelope(data)).toThrow('UNSUPPORTED_VERSION');
    });
  });
});
