/**
 * Genome canonicalization and ID computation
 */

import { createHash } from 'crypto';
import { Genome } from './types';

/**
 * Deep sort object keys recursively for stable canonicalization
 * Preserves array order (arrays are ordered sequences)
 */
function deepSortKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    // Preserve array order, but recursively sort keys in array elements
    return obj.map(deepSortKeys);
  }

  // Sort object keys and recursively process values
  const sorted: Record<string, any> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = deepSortKeys(obj[key]);
  }
  return sorted;
}

/**
 * Canonicalize genome JSON for signature verification
 * Removes signature/signatures fields and produces stable JSON representation
 * Rules:
 * - Recursively sorts all object keys lexicographically
 * - Preserves array order
 * - No whitespace (compact JSON)
 * - UTF-8 encoding
 */
export function canonicalizeGenome(genome: Genome): string {
  // Remove signature and signatures fields for canonicalization
  const { signature, signatures, ...canonicalGenome } = genome as any;

  // Deep sort all keys recursively
  const sorted = deepSortKeys(canonicalGenome);

  // Stable JSON representation with no whitespace
  return JSON.stringify(sorted);
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
