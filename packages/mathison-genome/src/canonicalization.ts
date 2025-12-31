/**
 * Genome canonicalization and ID computation
 */

import { createHash } from 'crypto';
import { Genome } from './types';

/**
 * Canonicalize genome JSON for signature verification
 * Removes signature field and produces stable JSON representation
 */
export function canonicalizeGenome(genome: Genome): string {
  // Remove signature field for canonicalization
  const { signature, ...canonicalGenome } = genome;

  // Stable JSON representation with sorted keys
  return JSON.stringify(canonicalGenome, Object.keys(canonicalGenome).sort(), 2);
}

/**
 * Compute genome ID from canonical representation
 * genome_id = sha256(canonical_json_without_signature)
 */
export function computeGenomeId(genome: Genome): string {
  const canonical = canonicalizeGenome(genome);
  const hash = createHash('sha256');
  hash.update(canonical, 'utf8');
  return hash.digest('hex');
}

/**
 * Compute SHA256 hash of any string
 */
export function sha256(input: string): string {
  const hash = createHash('sha256');
  hash.update(input, 'utf8');
  return hash.digest('hex');
}
