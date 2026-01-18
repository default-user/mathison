import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Mathison Kernel Configuration
 * Paths follow macOS conventions: ~/Library/Application Support/Mathison
 */

export const MATHISON_HOME = path.join(os.homedir(), 'Library', 'Application Support', 'Mathison');
export const MODELS_DIR = path.join(MATHISON_HOME, 'models');
export const BEAMSTORE_DIR = path.join(MATHISON_HOME, 'beamstore');
export const BEAMSTORE_PATH = path.join(BEAMSTORE_DIR, 'beamstore.sqlite');
export const LLAMA_DIR = path.join(MATHISON_HOME, 'llama.cpp');
export const CONFIG_PATH = path.join(MATHISON_HOME, 'config.json');

export type MathisonConfig = {
  model_path?: string;
  llama_server_port: number;
  device_id?: string;
};

export const DEFAULT_CONFIG: MathisonConfig = {
  llama_server_port: 8080,
};

export function ensureDirs(): void {
  const dirs = [MATHISON_HOME, MODELS_DIR, BEAMSTORE_DIR, LLAMA_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function loadConfig(): MathisonConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch (e) {
    console.warn('[CONFIG] Failed to load config, using defaults:', e);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: MathisonConfig): void {
  ensureDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}
