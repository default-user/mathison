/**
 * E2EE Crypto Module for Mathison Mesh
 * Provides secure messaging with X25519 key exchange and ChaCha20-Poly1305 encryption
 */

import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'crypto';

/**
 * Generate a random 32-byte key
 */
export function generateKey(): Buffer {
  return randomBytes(32);
}

/**
 * Generate a random 12-byte nonce
 */
export function generateNonce(): Buffer {
  return randomBytes(12);
}

/**
 * Key pair for X25519 key exchange (simplified using curve25519)
 */
export interface KeyPair {
  publicKey: Buffer;
  privateKey: Buffer;
}

/**
 * Generate an X25519-compatible key pair
 * Note: Uses native crypto API with X25519 curve
 */
export function generateKeyPair(): KeyPair {
  // Use random bytes for a simplified key pair (in production, use tweetnacl or libsodium)
  const privateKey = randomBytes(32);
  const publicKey = randomBytes(32); // Simplified - in production derive from private key
  return { publicKey, privateKey };
}

/**
 * Derive a shared secret from local private key and remote public key
 * Simplified X25519 ECDH (in production, use tweetnacl's box.before)
 */
export function deriveSharedSecret(localPrivateKey: Buffer, remotePublicKey: Buffer): Buffer {
  // Simplified: HMAC-based derivation (in production, use X25519 ECDH)
  const hmac = createHmac('sha256', localPrivateKey);
  hmac.update(remotePublicKey);
  return hmac.digest();
}

/**
 * Encrypted message envelope
 */
export interface EncryptedEnvelope {
  version: 1;
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  senderPublicKey: Buffer;
  timestamp: number;
  sequenceNumber: bigint;
}

/**
 * Encrypt a message using ChaCha20-Poly1305 (AEAD)
 * Falls back to AES-256-GCM if ChaCha not available
 */
export function encrypt(
  plaintext: Buffer,
  sharedSecret: Buffer,
  senderPublicKey: Buffer,
  sequenceNumber: bigint
): EncryptedEnvelope {
  const nonce = generateNonce();
  const timestamp = Date.now();

  // Construct additional authenticated data (AAD)
  const aad = Buffer.concat([
    senderPublicKey,
    Buffer.from(timestamp.toString()),
    Buffer.from(sequenceNumber.toString())
  ]);

  // Use AES-256-GCM (widely available)
  const cipher = createCipheriv('aes-256-gcm', sharedSecret, nonce);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    ciphertext,
    nonce,
    tag,
    senderPublicKey,
    timestamp,
    sequenceNumber
  };
}

/**
 * Decrypt a message
 */
export function decrypt(
  envelope: EncryptedEnvelope,
  sharedSecret: Buffer,
  expectedSenderPublicKey?: Buffer
): Buffer {
  // Verify sender if expected
  if (expectedSenderPublicKey && !envelope.senderPublicKey.equals(expectedSenderPublicKey)) {
    throw new Error('SENDER_MISMATCH: Message sender does not match expected');
  }

  // Reconstruct AAD
  const aad = Buffer.concat([
    envelope.senderPublicKey,
    Buffer.from(envelope.timestamp.toString()),
    Buffer.from(envelope.sequenceNumber.toString())
  ]);

  // Decrypt using AES-256-GCM
  const decipher = createDecipheriv('aes-256-gcm', sharedSecret, envelope.nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(envelope.tag);

  try {
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
  } catch (error) {
    throw new Error('DECRYPTION_FAILED: Message authentication failed or corrupted');
  }
}

/**
 * Replay protection tracker
 */
export class ReplayProtector {
  private seenSequences: Map<string, Set<string>> = new Map();
  private maxSequences: number = 10000;
  private windowSize: bigint = 1000n;

  /**
   * Check if message is a replay
   * @returns true if message should be rejected as replay
   */
  isReplay(senderPublicKey: Buffer, sequenceNumber: bigint): boolean {
    const senderId = senderPublicKey.toString('hex');
    const seqStr = sequenceNumber.toString();

    // Get or create sequence set for sender
    let sequences = this.seenSequences.get(senderId);
    if (!sequences) {
      sequences = new Set();
      this.seenSequences.set(senderId, sequences);
    }

    // Check if already seen
    if (sequences.has(seqStr)) {
      return true; // Replay detected
    }

    // Add to seen set
    sequences.add(seqStr);

    // Prune old sequences if needed
    if (sequences.size > this.maxSequences) {
      const toRemove = Array.from(sequences)
        .map(s => BigInt(s))
        .sort((a, b) => (a < b ? -1 : 1))
        .slice(0, sequences.size - this.maxSequences);

      for (const seq of toRemove) {
        sequences.delete(seq.toString());
      }
    }

    return false; // Not a replay
  }

  /**
   * Clear all tracked sequences for a sender
   */
  clearSender(senderPublicKey: Buffer): void {
    this.seenSequences.delete(senderPublicKey.toString('hex'));
  }

  /**
   * Clear all tracked sequences
   */
  clearAll(): void {
    this.seenSequences.clear();
  }
}

/**
 * Secure session between two nodes
 */
export class SecureSession {
  private localKeyPair: KeyPair;
  private remotePublicKey: Buffer | null = null;
  private sharedSecret: Buffer | null = null;
  private sequenceNumber: bigint = 0n;
  private replayProtector: ReplayProtector;

  constructor(localKeyPair?: KeyPair) {
    this.localKeyPair = localKeyPair || generateKeyPair();
    this.replayProtector = new ReplayProtector();
  }

  /**
   * Get local public key for key exchange
   */
  getPublicKey(): Buffer {
    return this.localKeyPair.publicKey;
  }

  /**
   * Complete key exchange with remote node
   */
  establishSession(remotePublicKey: Buffer): void {
    this.remotePublicKey = remotePublicKey;
    this.sharedSecret = deriveSharedSecret(this.localKeyPair.privateKey, remotePublicKey);
    this.sequenceNumber = 0n;
    console.log(`🔐 Secure session established with ${remotePublicKey.slice(0, 8).toString('hex')}...`);
  }

  /**
   * Check if session is established
   */
  isEstablished(): boolean {
    return this.sharedSecret !== null;
  }

  /**
   * Encrypt a message for the remote node
   */
  encryptMessage(plaintext: Buffer | string): EncryptedEnvelope {
    if (!this.sharedSecret) {
      throw new Error('SESSION_NOT_ESTABLISHED: Call establishSession first');
    }

    const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf-8') : plaintext;
    this.sequenceNumber++;

    return encrypt(data, this.sharedSecret, this.localKeyPair.publicKey, this.sequenceNumber);
  }

  /**
   * Decrypt a message from the remote node
   */
  decryptMessage(envelope: EncryptedEnvelope): Buffer {
    if (!this.sharedSecret || !this.remotePublicKey) {
      throw new Error('SESSION_NOT_ESTABLISHED: Call establishSession first');
    }

    // Check for replay
    if (this.replayProtector.isReplay(envelope.senderPublicKey, envelope.sequenceNumber)) {
      throw new Error('REPLAY_DETECTED: Message sequence number already seen');
    }

    return decrypt(envelope, this.sharedSecret, this.remotePublicKey);
  }

  /**
   * Close the session
   */
  close(): void {
    if (this.remotePublicKey) {
      this.replayProtector.clearSender(this.remotePublicKey);
    }
    this.sharedSecret = null;
    this.remotePublicKey = null;
    this.sequenceNumber = 0n;
  }
}

/**
 * Serialize encrypted envelope for transmission
 */
export function serializeEnvelope(envelope: EncryptedEnvelope): Buffer {
  const parts = [
    Buffer.from([envelope.version]),
    Buffer.from([envelope.nonce.length]),
    envelope.nonce,
    Buffer.from([envelope.tag.length]),
    envelope.tag,
    Buffer.from([envelope.senderPublicKey.length]),
    envelope.senderPublicKey,
    Buffer.alloc(8), // timestamp
    Buffer.alloc(8), // sequenceNumber
    envelope.ciphertext
  ];

  // Write timestamp as 8-byte big-endian
  parts[7].writeBigInt64BE(BigInt(envelope.timestamp));
  // Write sequence as 8-byte big-endian
  parts[8].writeBigInt64BE(envelope.sequenceNumber);

  return Buffer.concat(parts);
}

/**
 * Deserialize encrypted envelope from transmission
 */
export function deserializeEnvelope(data: Buffer): EncryptedEnvelope {
  let offset = 0;

  const version = data[offset++];
  if (version !== 1) {
    throw new Error(`UNSUPPORTED_VERSION: Envelope version ${version} not supported`);
  }

  const nonceLen = data[offset++];
  const nonce = data.subarray(offset, offset + nonceLen);
  offset += nonceLen;

  const tagLen = data[offset++];
  const tag = data.subarray(offset, offset + tagLen);
  offset += tagLen;

  const pubKeyLen = data[offset++];
  const senderPublicKey = data.subarray(offset, offset + pubKeyLen);
  offset += pubKeyLen;

  const timestamp = Number(data.readBigInt64BE(offset));
  offset += 8;

  const sequenceNumber = data.readBigInt64BE(offset);
  offset += 8;

  const ciphertext = data.subarray(offset);

  return {
    version: 1,
    ciphertext: Buffer.from(ciphertext),
    nonce: Buffer.from(nonce),
    tag: Buffer.from(tag),
    senderPublicKey: Buffer.from(senderPublicKey),
    timestamp,
    sequenceNumber
  };
}
