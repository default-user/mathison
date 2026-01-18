/**
 * Test utilities for server conformance tests
 * Provides real Ed25519 signature generation (no dummy signatures)
 */

// Type declaration for Web Crypto API (available in Node 18+)
/// <reference lib="dom" />

export interface TestKeypair {
  keyId: string;
  publicKeyBase64: string;
  privateKey: CryptoKey;
}

/**
 * Generate a real Ed25519 keypair for testing
 */
export async function generateTestKeypair(keyId: string): Promise<TestKeypair> {
  const { subtle } = globalThis.crypto;

  const keypair = await subtle.generateKey(
    {
      name: 'Ed25519',
      namedCurve: 'Ed25519'
    } as any,
    true,
    ['sign', 'verify']
  );

  const publicKeyRaw = await subtle.exportKey('spki', keypair.publicKey);
  const publicKeyBase64 = Buffer.from(publicKeyRaw).toString('base64');

  return {
    keyId,
    publicKeyBase64,
    privateKey: keypair.privateKey
  };
}

function sortKeysDeep(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortKeysDeep);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((result: any, key) => {
        result[key] = sortKeysDeep(obj[key]);
        return result;
      }, {});
  }
  return obj;
}

function canonicalizeGenome(genome: any): string {
  const clone = JSON.parse(JSON.stringify(genome));
  delete clone.signature;
  delete clone.signatures;
  return JSON.stringify(sortKeysDeep(clone));
}

/**
 * Sign a genome with a real Ed25519 signature (no dummy)
 */
export async function signGenome(
  genome: any,
  keypair: TestKeypair
): Promise<any> {
  const { subtle } = globalThis.crypto;

  const canonical = canonicalizeGenome(genome);
  const canonicalBytes = Buffer.from(canonical, 'utf-8');

  const signatureBuffer = await subtle.sign(
    'Ed25519',
    keypair.privateKey,
    canonicalBytes
  );

  const sig_base64 = Buffer.from(signatureBuffer).toString('base64');

  return {
    ...genome,
    signature: {
      alg: 'ed25519',
      signer_key_id: keypair.keyId,
      sig_base64
    }
  };
}
