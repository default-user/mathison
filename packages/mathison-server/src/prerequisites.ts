/**
 * Centralized Prerequisite Validation
 * Fail-closed validation of all system prerequisites
 * Used by BOTH HTTP and gRPC stacks
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadAndVerifyGenome, Genome } from 'mathison-genome';

export enum PrerequisiteCode {
  TREATY_MISSING = 'PREREQ_TREATY_MISSING',
  TREATY_UNREADABLE = 'PREREQ_TREATY_UNREADABLE',
  TREATY_INVALID_SCHEMA = 'PREREQ_TREATY_INVALID_SCHEMA',
  GENOME_MISSING = 'PREREQ_GENOME_MISSING',
  GENOME_UNREADABLE = 'PREREQ_GENOME_UNREADABLE',
  GENOME_INVALID_SCHEMA = 'PREREQ_GENOME_INVALID_SCHEMA',
  GENOME_SIGNATURE_INVALID = 'PREREQ_GENOME_SIGNATURE_INVALID',
  CONFIG_MISSING = 'PREREQ_CONFIG_MISSING',
  CONFIG_UNREADABLE = 'PREREQ_CONFIG_UNREADABLE',
  CONFIG_INVALID_SCHEMA = 'PREREQ_CONFIG_INVALID_SCHEMA',
  ADAPTER_MISSING = 'PREREQ_ADAPTER_MISSING',
  ADAPTER_INVALID = 'PREREQ_ADAPTER_INVALID',
  CRYPTO_MISSING = 'PREREQ_CRYPTO_MISSING',
  CRYPTO_INVALID = 'PREREQ_CRYPTO_INVALID'
}

export interface PrerequisiteError {
  code: PrerequisiteCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface PrerequisiteValidationResult {
  ok: boolean;
  errors: PrerequisiteError[];
  warnings?: string[];
}

export interface Treaty {
  path: string;
  version: string;
  authority: string;
  content: string;
}

export interface GovernanceConfig {
  treatyPath: string;
  treatyVersion: string;
  authority: string;
  rules: Record<string, unknown>;
}

export interface ValidatedPrerequisites {
  treaty: Treaty;
  genome: Genome;
  genomeId: string;
  config: GovernanceConfig;
}

/**
 * Validate treaty file exists and is readable
 */
export async function validateTreaty(configPath: string): Promise<{ treaty: Treaty | null; error: PrerequisiteError | null }> {
  try {
    // Read governance config
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: GovernanceConfig = JSON.parse(configContent);

    // Resolve treaty path
    const treatyPath = path.join(process.cwd(), config.treatyPath);

    // Check treaty exists
    try {
      await fs.access(treatyPath);
    } catch {
      return {
        treaty: null,
        error: {
          code: PrerequisiteCode.TREATY_MISSING,
          message: `Treaty file not found: ${config.treatyPath}`,
          details: { path: treatyPath }
        }
      };
    }

    // Read treaty content
    let content: string;
    try {
      content = await fs.readFile(treatyPath, 'utf-8');
    } catch (error) {
      return {
        treaty: null,
        error: {
          code: PrerequisiteCode.TREATY_UNREADABLE,
          message: `Treaty file unreadable: ${error instanceof Error ? error.message : String(error)}`,
          details: { path: treatyPath }
        }
      };
    }

    // Validate basic schema (version present)
    const versionMatch = content.match(/version: "([^"]+)"/);
    if (!versionMatch) {
      return {
        treaty: null,
        error: {
          code: PrerequisiteCode.TREATY_INVALID_SCHEMA,
          message: 'Treaty missing version field',
          details: { path: treatyPath }
        }
      };
    }

    const treaty: Treaty = {
      path: config.treatyPath,
      version: versionMatch[1],
      authority: config.authority,
      content
    };

    return { treaty, error: null };
  } catch (error) {
    return {
      treaty: null,
      error: {
        code: PrerequisiteCode.CONFIG_UNREADABLE,
        message: `Governance config unreadable: ${error instanceof Error ? error.message : String(error)}`,
        details: { path: configPath }
      }
    };
  }
}

/**
 * Validate genome file exists, is readable, and signature valid
 */
export async function validateGenome(): Promise<{ genome: Genome | null; genomeId: string | null; error: PrerequisiteError | null }> {
  const genomePath = process.env.MATHISON_GENOME_PATH || './genomes/TOTK_ROOT_v1.0.0/genome.json';
  const isProduction = process.env.MATHISON_ENV === 'production';
  const verifyManifest = process.env.MATHISON_VERIFY_MANIFEST === 'true' || isProduction;

  // Check genome file exists
  try {
    await fs.access(genomePath);
  } catch {
    return {
      genome: null,
      genomeId: null,
      error: {
        code: PrerequisiteCode.GENOME_MISSING,
        message: `Genome file not found: ${genomePath}`,
        details: { path: genomePath }
      }
    };
  }

  // Load and verify genome
  try {
    const repoRoot = process.env.MATHISON_REPO_ROOT || process.cwd();
    const { genome, genome_id } = await loadAndVerifyGenome(genomePath, {
      verifyManifest,
      repoRoot
    });

    return { genome, genomeId: genome_id, error: null };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Classify error type
    if (errorMsg.includes('signature') || errorMsg.includes('verify')) {
      return {
        genome: null,
        genomeId: null,
        error: {
          code: PrerequisiteCode.GENOME_SIGNATURE_INVALID,
          message: `Genome signature invalid: ${errorMsg}`,
          details: { path: genomePath }
        }
      };
    }

    if (errorMsg.includes('schema') || errorMsg.includes('validation')) {
      return {
        genome: null,
        genomeId: null,
        error: {
          code: PrerequisiteCode.GENOME_INVALID_SCHEMA,
          message: `Genome schema invalid: ${errorMsg}`,
          details: { path: genomePath }
        }
      };
    }

    return {
      genome: null,
      genomeId: null,
      error: {
        code: PrerequisiteCode.GENOME_UNREADABLE,
        message: `Genome unreadable: ${errorMsg}`,
        details: { path: genomePath }
      }
    };
  }
}

/**
 * Validate governance config exists and is readable
 */
export async function validateConfig(configPath: string): Promise<{ config: GovernanceConfig | null; error: PrerequisiteError | null }> {
  // Check config exists
  try {
    await fs.access(configPath);
  } catch {
    return {
      config: null,
      error: {
        code: PrerequisiteCode.CONFIG_MISSING,
        message: `Governance config not found: ${configPath}`,
        details: { path: configPath }
      }
    };
  }

  // Read and parse config
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config: GovernanceConfig = JSON.parse(content);

    // Validate schema
    if (!config.treatyPath || !config.treatyVersion || !config.authority) {
      return {
        config: null,
        error: {
          code: PrerequisiteCode.CONFIG_INVALID_SCHEMA,
          message: 'Governance config missing required fields (treatyPath, treatyVersion, authority)',
          details: { path: configPath }
        }
      };
    }

    return { config, error: null };
  } catch (error) {
    return {
      config: null,
      error: {
        code: PrerequisiteCode.CONFIG_UNREADABLE,
        message: `Governance config unreadable: ${error instanceof Error ? error.message : String(error)}`,
        details: { path: configPath }
      }
    };
  }
}

/**
 * Validate storage adapter configuration
 */
export async function validateAdapter(): Promise<{ ok: boolean; error: PrerequisiteError | null }> {
  const backend = process.env.MATHISON_STORE_BACKEND;
  const storePath = process.env.MATHISON_STORE_PATH;

  if (!backend) {
    return {
      ok: false,
      error: {
        code: PrerequisiteCode.ADAPTER_MISSING,
        message: 'MATHISON_STORE_BACKEND environment variable not set',
        details: { required: 'FILE or SQLITE' }
      }
    };
  }

  if (backend !== 'FILE' && backend !== 'SQLITE') {
    return {
      ok: false,
      error: {
        code: PrerequisiteCode.ADAPTER_INVALID,
        message: `Invalid storage backend: ${backend}`,
        details: { backend, valid: ['FILE', 'SQLITE'] }
      }
    };
  }

  if (!storePath) {
    return {
      ok: false,
      error: {
        code: PrerequisiteCode.ADAPTER_MISSING,
        message: 'MATHISON_STORE_PATH environment variable not set',
        details: { backend }
      }
    };
  }

  return { ok: true, error: null };
}

/**
 * Validate all prerequisites in deterministic order
 * Returns all errors (fail-closed: any error = boot failure)
 */
export async function validateAllPrerequisites(configPath: string = './config/governance.json'): Promise<PrerequisiteValidationResult> {
  const errors: PrerequisiteError[] = [];
  const warnings: string[] = [];

  // 1. Validate config
  const { config, error: configError } = await validateConfig(configPath);
  if (configError) {
    errors.push(configError);
    // Cannot continue without config
    return { ok: false, errors, warnings };
  }

  // 2. Validate treaty
  const { treaty, error: treatyError } = await validateTreaty(configPath);
  if (treatyError) {
    errors.push(treatyError);
  }

  // 3. Validate genome
  const { genome, genomeId, error: genomeError } = await validateGenome();
  if (genomeError) {
    errors.push(genomeError);
  }

  // 4. Validate adapter
  const { ok: adapterOk, error: adapterError } = await validateAdapter();
  if (adapterError) {
    errors.push(adapterError);
  }

  // 5. Check for warnings (non-fatal but worth noting)
  const isProduction = process.env.MATHISON_ENV === 'production';
  if (isProduction && process.env.MATHISON_VERIFY_MANIFEST !== 'true') {
    warnings.push('Production mode but MATHISON_VERIFY_MANIFEST not enabled');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Load all prerequisites (only call after validateAllPrerequisites succeeds)
 */
export async function loadPrerequisites(configPath: string = './config/governance.json'): Promise<ValidatedPrerequisites> {
  const configResult = await validateConfig(configPath);
  if (configResult.error || !configResult.config) {
    throw new Error(`Config validation failed: ${configResult.error?.message}`);
  }

  const treatyResult = await validateTreaty(configPath);
  if (treatyResult.error || !treatyResult.treaty) {
    throw new Error(`Treaty validation failed: ${treatyResult.error?.message}`);
  }

  const genomeResult = await validateGenome();
  if (genomeResult.error || !genomeResult.genome || !genomeResult.genomeId) {
    throw new Error(`Genome validation failed: ${genomeResult.error?.message}`);
  }

  return {
    treaty: treatyResult.treaty,
    genome: genomeResult.genome,
    genomeId: genomeResult.genomeId,
    config: configResult.config
  };
}
