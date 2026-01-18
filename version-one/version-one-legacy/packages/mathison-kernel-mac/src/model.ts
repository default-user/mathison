import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { MODELS_DIR } from './config';

/**
 * Model management: download, install, list GGUF models
 */

export type ModelInfo = {
  name: string;
  path: string;
  size: number;
};

// Default model: Qwen2.5-7B-Instruct Q4_K_M
export const DEFAULT_MODEL = {
  name: 'qwen2.5-7b-instruct-q4_k_m.gguf',
  url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
  size: 4_500_000_000, // ~4.5GB
};

export async function downloadModel(
  url: string,
  dest: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location'));
          return;
        }
        file.close();
        fs.unlinkSync(dest);
        downloadModel(redirectUrl, dest, onProgress).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress) {
          onProgress(downloaded, total);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

export async function installDefaultModel(onProgress?: (downloaded: number, total: number) => void): Promise<string> {
  const modelPath = path.join(MODELS_DIR, DEFAULT_MODEL.name);

  if (fs.existsSync(modelPath)) {
    console.log(`[MODEL] Default model already installed at ${modelPath}`);
    return modelPath;
  }

  console.log(`[MODEL] Downloading ${DEFAULT_MODEL.name}...`);
  console.log(`[MODEL] URL: ${DEFAULT_MODEL.url}`);
  console.log(`[MODEL] Expected size: ~${(DEFAULT_MODEL.size / 1e9).toFixed(1)}GB`);

  await downloadModel(DEFAULT_MODEL.url, modelPath, onProgress);

  console.log(`[MODEL] Download complete: ${modelPath}`);
  return modelPath;
}

export function listModels(): ModelInfo[] {
  if (!fs.existsSync(MODELS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(MODELS_DIR);
  return files
    .filter((f) => f.endsWith('.gguf'))
    .map((f) => {
      const fullPath = path.join(MODELS_DIR, f);
      const stats = fs.statSync(fullPath);
      return {
        name: f,
        path: fullPath,
        size: stats.size,
      };
    });
}

export function getModelPath(nameOrPath: string): string | null {
  // If absolute path, verify it exists
  if (path.isAbsolute(nameOrPath)) {
    return fs.existsSync(nameOrPath) ? nameOrPath : null;
  }

  // Otherwise, look in MODELS_DIR
  const fullPath = path.join(MODELS_DIR, nameOrPath);
  return fs.existsSync(fullPath) ? fullPath : null;
}
