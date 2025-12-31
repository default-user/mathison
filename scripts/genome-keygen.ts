#!/usr/bin/env tsx
/**
 * Generate Ed25519 keypair for genome signing
 * Usage: tsx scripts/genome-keygen.ts [key-id]
 *
 * Outputs:
 * - Private key (base64) to stderr - SET AS GENOME_SIGNING_PRIVATE_KEY env var
 * - Public key (base64) to stdout - USE IN genome.json authority.signers
 *
 * WARNING: NEVER commit private keys to the repository!
 */

async function generateKeypair(keyId: string): Promise<void> {
  const { subtle } = globalThis.crypto;

  // Generate Ed25519 keypair
  const keypair = await subtle.generateKey(
    {
      name: 'Ed25519',
      namedCurve: 'Ed25519'
    } as any,
    true,
    ['sign', 'verify']
  );

  // Export private key (raw format)
  const privateKeyRaw = await subtle.exportKey('pkcs8', keypair.privateKey);
  const privateKeyBase64 = Buffer.from(privateKeyRaw).toString('base64');

  // Export public key (raw format)
  const publicKeyRaw = await subtle.exportKey('spki', keypair.publicKey);
  const publicKeyBase64 = Buffer.from(publicKeyRaw).toString('base64');

  console.error('🔐 Ed25519 Keypair Generated');
  console.error(`   Key ID: ${keyId}`);
  console.error('');
  console.error('⚠️  PRIVATE KEY (keep secret, set as GENOME_SIGNING_PRIVATE_KEY):');
  console.error(`   ${privateKeyBase64}`);
  console.error('');
  console.log(`{
  "key_id": "${keyId}",
  "alg": "ed25519",
  "public_key": "${publicKeyBase64}"
}`);
  console.error('');
  console.error('👆 Copy public key JSON above into genome.json authority.signers array');
}

// CLI entry point
if (require.main === module) {
  const keyId = process.argv[2] || 'dev-key-001';
  generateKeypair(keyId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Keygen failed:', error.message);
      process.exit(1);
    });
}
