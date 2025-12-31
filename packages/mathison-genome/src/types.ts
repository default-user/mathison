/**
 * Memetic Genome Types
 * Genome format v0.1
 */

export interface GenomeSigner {
  key_id: string;
  alg: 'ed25519';
  public_key: string; // base64
}

export interface GenomeAuthority {
  signers: GenomeSigner[];
  threshold: number;
}

export interface GenomeInvariant {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  testable_claim: string;
  enforcement_hook: string;
}

export interface GenomeCapability {
  cap_id: string;
  risk_class: 'A' | 'B' | 'C' | 'D';
  allow_actions: string[];
  deny_actions: string[];
}

export interface GenomeBuildManifest {
  files: Array<{
    path: string;
    sha256: string;
  }>;
}

export interface GenomeSignature {
  alg: 'ed25519';
  signer_key_id: string;
  sig_base64: string;
}

export interface Genome {
  schema_version: 'genome.v0.1';
  name: string;
  version: string; // semver
  parents: string[]; // genome_ids
  created_at: string; // ISO string
  authority: GenomeAuthority;
  invariants: GenomeInvariant[];
  capabilities: GenomeCapability[];
  build_manifest: GenomeBuildManifest;
  signature?: GenomeSignature;
}

export interface GenomeMetadata {
  genome_id: string;
  genome_name: string;
  genome_version: string;
  signer_key_id: string;
}

export interface GenomeValidationResult {
  valid: boolean;
  errors: string[];
}

export interface GenomeVerificationResult {
  verified: boolean;
  genome_id: string;
  errors: string[];
}
