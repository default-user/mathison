// WHY: Authority config loading with strict validation ensures fail-closed behavior

import * as fs from 'fs';
import { AuthorityConfig, Principal } from './types';

let currentConfig: AuthorityConfig | null = null;

/**
 * WHY: Load and validate authority config at boot, fail if invalid
 */
export function loadAuthorityConfig(path: string): AuthorityConfig {
  if (!fs.existsSync(path)) {
    throw new Error(`Authority config not found at ${path}. System refuses to start.`);
  }

  const raw = fs.readFileSync(path, 'utf-8');
  const config = JSON.parse(raw) as AuthorityConfig;

  // Validate required fields
  if (!config.version) {
    throw new Error('Authority config missing version');
  }
  if (!config.principal || !config.principal.id) {
    throw new Error('Authority config missing principal');
  }
  if (!config.default_permissions) {
    throw new Error('Authority config missing default_permissions');
  }

  currentConfig = config;
  return config;
}

/**
 * WHY: Get current principal, fail if config not loaded
 */
export function getCurrentPrincipal(): Principal {
  if (!currentConfig) {
    throw new Error('Authority config not loaded. Call loadAuthorityConfig first.');
  }
  return currentConfig.principal;
}

/**
 * WHY: Get full authority config
 */
export function getAuthorityConfig(): AuthorityConfig {
  if (!currentConfig) {
    throw new Error('Authority config not loaded.');
  }
  return currentConfig;
}
