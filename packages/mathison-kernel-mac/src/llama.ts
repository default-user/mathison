import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { LLAMA_DIR } from './config';

/**
 * llama.cpp integration: build, run server, query
 */

export const LLAMA_CPP_REPO = 'https://github.com/ggerganov/llama.cpp.git';
export const LLAMA_CPP_COMMIT = 'b3837'; // Pin to a stable commit (adjust as needed)

export function isLlamaCppBuilt(): boolean {
  const serverBin = path.join(LLAMA_DIR, 'llama-server');
  return fs.existsSync(serverBin);
}

export function buildLlamaCpp(): void {
  console.log('[LLAMA] Building llama.cpp...');

  if (!fs.existsSync(LLAMA_DIR)) {
    fs.mkdirSync(LLAMA_DIR, { recursive: true });
  }

  const repoDir = path.join(LLAMA_DIR, 'repo');

  // Clone if not exists
  if (!fs.existsSync(repoDir)) {
    console.log('[LLAMA] Cloning llama.cpp repository...');
    execSync(`git clone ${LLAMA_CPP_REPO} ${repoDir}`, { stdio: 'inherit' });
  }

  // Build llama-server
  console.log('[LLAMA] Compiling llama-server...');
  execSync('make llama-server', { cwd: repoDir, stdio: 'inherit' });

  // Copy binary to LLAMA_DIR
  const serverBin = path.join(repoDir, 'llama-server');
  const destBin = path.join(LLAMA_DIR, 'llama-server');
  fs.copyFileSync(serverBin, destBin);
  fs.chmodSync(destBin, 0o755);

  console.log('[LLAMA] llama-server built successfully');
}

export type LlamaServerConfig = {
  modelPath: string;
  port: number;
  contextSize?: number;
  threads?: number;
};

let serverProcess: ChildProcess | null = null;

export function startLlamaServer(config: LlamaServerConfig): ChildProcess {
  if (serverProcess) {
    console.log('[LLAMA] Server already running');
    return serverProcess;
  }

  const serverBin = path.join(LLAMA_DIR, 'llama-server');
  if (!fs.existsSync(serverBin)) {
    throw new Error('llama-server not built. Run build-llama.sh first.');
  }

  const args = [
    '-m', config.modelPath,
    '--port', config.port.toString(),
    '--ctx-size', (config.contextSize ?? 4096).toString(),
    '--threads', (config.threads ?? 4).toString(),
    '--log-disable', // Disable verbose logging
  ];

  console.log(`[LLAMA] Starting llama-server on port ${config.port}...`);
  serverProcess = spawn(serverBin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[LLAMA] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[LLAMA] ${data.toString().trim()}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[LLAMA] Server exited with code ${code}`);
    serverProcess = null;
  });

  // Wait for server to be ready
  console.log('[LLAMA] Waiting for server to start...');
  waitForServer(config.port, 30000);

  return serverProcess;
}

export function stopLlamaServer(): void {
  if (serverProcess) {
    console.log('[LLAMA] Stopping server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

function waitForServer(port: number, timeout: number): void {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      execSync(`curl -s http://localhost:${port}/health > /dev/null 2>&1`, { timeout: 1000 });
      console.log('[LLAMA] Server ready');
      return;
    } catch (e) {
      // Not ready yet
    }
  }
  throw new Error('llama-server failed to start within timeout');
}

export type CompletionRequest = {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
};

export type CompletionResponse = {
  content: string;
  stop_reason: string;
};

export async function complete(
  port: number,
  req: CompletionRequest
): Promise<CompletionResponse> {
  const response = await fetch(`http://localhost:${port}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: req.prompt,
      n_predict: req.max_tokens ?? 512,
      temperature: req.temperature ?? 0.7,
      stop: req.stop ?? [],
    }),
  });

  if (!response.ok) {
    throw new Error(`llama-server error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  return {
    content: data.content,
    stop_reason: data.stop ? 'stop' : 'length',
  };
}
