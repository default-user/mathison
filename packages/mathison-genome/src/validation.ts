/**
 * Genome schema validation
 */

import { Genome, GenomeValidationResult } from './types';

/**
 * Validate genome against schema v0.1
 */
export function validateGenomeSchema(genome: unknown): GenomeValidationResult {
  const errors: string[] = [];

  if (typeof genome !== 'object' || genome === null) {
    return { valid: false, errors: ['Genome must be an object'] };
  }

  const g = genome as any;

  // Schema version
  if (g.schema_version !== 'genome.v0.1') {
    errors.push(`Invalid schema_version: expected "genome.v0.1", got "${g.schema_version}"`);
  }

  // Required string fields
  const requiredStrings = ['name', 'version', 'created_at'];
  for (const field of requiredStrings) {
    if (typeof g[field] !== 'string' || g[field].trim() === '') {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }

  // Parents array
  if (!Array.isArray(g.parents)) {
    errors.push('Field "parents" must be an array');
  } else {
    for (let i = 0; i < g.parents.length; i++) {
      if (typeof g.parents[i] !== 'string') {
        errors.push(`parents[${i}] must be a string`);
      }
    }
  }

  // Authority
  if (typeof g.authority !== 'object' || g.authority === null) {
    errors.push('Field "authority" must be an object');
  } else {
    if (!Array.isArray(g.authority.signers)) {
      errors.push('authority.signers must be an array');
    } else {
      for (let i = 0; i < g.authority.signers.length; i++) {
        const signer = g.authority.signers[i];
        if (typeof signer.key_id !== 'string' || signer.key_id.trim() === '') {
          errors.push(`authority.signers[${i}].key_id is required`);
        }
        if (signer.alg !== 'ed25519') {
          errors.push(`authority.signers[${i}].alg must be "ed25519"`);
        }
        if (typeof signer.public_key !== 'string' || signer.public_key.trim() === '') {
          errors.push(`authority.signers[${i}].public_key is required`);
        }
      }
    }
    if (typeof g.authority.threshold !== 'number' || g.authority.threshold < 1) {
      errors.push('authority.threshold must be a number >= 1');
    }
  }

  // Invariants
  if (!Array.isArray(g.invariants)) {
    errors.push('Field "invariants" must be an array');
  } else {
    for (let i = 0; i < g.invariants.length; i++) {
      const inv = g.invariants[i];
      if (typeof inv.id !== 'string' || inv.id.trim() === '') {
        errors.push(`invariants[${i}].id is required`);
      }
      if (!['CRITICAL', 'HIGH', 'MEDIUM'].includes(inv.severity)) {
        errors.push(`invariants[${i}].severity must be CRITICAL, HIGH, or MEDIUM`);
      }
      if (typeof inv.testable_claim !== 'string') {
        errors.push(`invariants[${i}].testable_claim is required`);
      }
      if (typeof inv.enforcement_hook !== 'string') {
        errors.push(`invariants[${i}].enforcement_hook is required`);
      }
    }
  }

  // Capabilities
  if (!Array.isArray(g.capabilities)) {
    errors.push('Field "capabilities" must be an array');
  } else {
    for (let i = 0; i < g.capabilities.length; i++) {
      const cap = g.capabilities[i];
      if (typeof cap.cap_id !== 'string' || cap.cap_id.trim() === '') {
        errors.push(`capabilities[${i}].cap_id is required`);
      }
      if (!['A', 'B', 'C', 'D'].includes(cap.risk_class)) {
        errors.push(`capabilities[${i}].risk_class must be A, B, C, or D`);
      }
      if (!Array.isArray(cap.allow_actions)) {
        errors.push(`capabilities[${i}].allow_actions must be an array`);
      }
      if (!Array.isArray(cap.deny_actions)) {
        errors.push(`capabilities[${i}].deny_actions must be an array`);
      }
    }
  }

  // Build manifest
  if (typeof g.build_manifest !== 'object' || g.build_manifest === null) {
    errors.push('Field "build_manifest" must be an object');
  } else {
    if (!Array.isArray(g.build_manifest.files)) {
      errors.push('build_manifest.files must be an array');
    } else {
      for (let i = 0; i < g.build_manifest.files.length; i++) {
        const file = g.build_manifest.files[i];
        if (typeof file.path !== 'string' || file.path.trim() === '') {
          errors.push(`build_manifest.files[${i}].path is required`);
        }
        if (typeof file.sha256 !== 'string' || file.sha256.trim() === '') {
          errors.push(`build_manifest.files[${i}].sha256 is required`);
        }
      }
    }
  }

  // Signature (optional, but if present must be valid structure)
  if (g.signature !== undefined) {
    if (typeof g.signature !== 'object' || g.signature === null) {
      errors.push('Field "signature" must be an object if present');
    } else {
      if (g.signature.alg !== 'ed25519') {
        errors.push('signature.alg must be "ed25519"');
      }
      if (typeof g.signature.signer_key_id !== 'string' || g.signature.signer_key_id.trim() === '') {
        errors.push('signature.signer_key_id is required');
      }
      if (typeof g.signature.sig_base64 !== 'string' || g.signature.sig_base64.trim() === '') {
        errors.push('signature.sig_base64 is required');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
