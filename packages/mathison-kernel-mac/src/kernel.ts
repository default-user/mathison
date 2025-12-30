import {
  BeamStore,
  SQLiteBeamStore,
  Beam,
  SELF_ROOT_ID,
  bootMathisonIdentity,
  BootMode,
  BootResult,
  CDIStub,
  StoreBeamIntent,
  applyIntentGoverned,
} from 'mathison-storage';
import { BEAMSTORE_PATH, loadConfig, saveConfig } from './config';
import { getDeviceId } from './device';
import { startLlamaServer, stopLlamaServer, complete, LlamaServerConfig } from './llama';
import { getModelPath } from './model';

/**
 * Mathison Kernel: Boot → Identity → Model → REPL
 */

export type KernelState = {
  store: BeamStore;
  cdi: CDIStub;
  bootResult: BootResult;
  deviceId: string;
  modelPath: string;
  serverPort: number;
};

export async function initKernel(): Promise<void> {
  console.log('[KERNEL] Initializing Mathison...');

  const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
  await store.mount();
  await store.verify();

  // Check if SELF_ROOT exists
  try {
    const selfRoot = await store.loadSelfRoot();
    console.log('[KERNEL] SELF_ROOT already exists');
    return;
  } catch (e) {
    // SELF_ROOT missing, create it
    console.log('[KERNEL] Creating SELF_ROOT...');
  }

  // Get device ID
  const deviceId = getDeviceId();
  console.log(`[KERNEL] Device ID: ${deviceId.slice(0, 16)}...`);

  // Save device ID to config
  const cfg = loadConfig();
  cfg.device_id = deviceId;
  saveConfig(cfg);

  // Create SELF_ROOT beam
  const selfRoot: Beam = {
    beam_id: SELF_ROOT_ID,
    kind: 'SELF',
    title: 'Mathison Identity Root',
    tags: ['identity', 'root'],
    body: `I am Mathison, an OI system running on device ${deviceId.slice(0, 16)}...

My identity is stored in BeamStore, governed by CDI, and powered by a local LLM.

Core principles:
- Identity persists across restarts (BeamStore is my substrate)
- I cannot write memory directly; I propose STORE_BEAM_INTENT
- Protected beams (SELF/POLICY/CARE) require human approval for tombstoning
- Tombstones are identity-dead; no silent resurrection`,
    status: 'ACTIVE',
    pinned: true,
    updated_at_ms: Date.now(),
  };

  await store.put(selfRoot);

  // Create baseline POLICY beam
  const policyBeam: Beam = {
    beam_id: 'POLICY_CDI_V1',
    kind: 'POLICY',
    title: 'CDI Governance Policy',
    tags: ['policy', 'cdi', 'governance'],
    body: `CDI (Contextual Denial Interface) Governance Policy

1. Protected Kinds: SELF, POLICY, CARE require approval for TOMBSTONE/PURGE
2. Tombstone Budget:
   - Soft limit: 20 tombstones per 24h (requires approval after)
   - Hard limit: 100 tombstones per 24h (deny after)
3. Reason Code: TOMBSTONE/PURGE operations must include reason_code
4. Approval Methods: human_confirm, admin_key, biometric, migration_ritual`,
    status: 'ACTIVE',
    pinned: true,
    updated_at_ms: Date.now(),
  };

  await store.put(policyBeam);

  console.log('[KERNEL] SELF_ROOT created successfully');
  console.log('[KERNEL] Baseline policy beams created');
  console.log('[KERNEL] Mathison initialized');
}

export async function bootKernel(): Promise<KernelState> {
  console.log('[KERNEL] Booting Mathison Identity...');

  const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
  const bootResult = await bootMathisonIdentity(store);

  if (bootResult.mode === 'AMNESIC_SAFE_MODE') {
    console.error('[KERNEL] BOOT FAILED: AMNESIC_SAFE_MODE');
    console.error('[KERNEL] SELF_ROOT missing or inactive');
    console.error('[KERNEL] Run `mathison init` to create identity');
    process.exit(1);
  }

  console.log(`[KERNEL] Boot mode: ${bootResult.mode}`);
  console.log(`[KERNEL] SelfFrame hash: ${bootResult.selfFrame?.hash.slice(0, 16)}...`);

  // Verify device binding
  const cfg = loadConfig();
  if (cfg.device_id) {
    const currentDeviceId = getDeviceId();
    if (currentDeviceId !== cfg.device_id) {
      console.warn('[KERNEL] WARNING: Device ID mismatch!');
      console.warn(`[KERNEL] Expected: ${cfg.device_id.slice(0, 16)}...`);
      console.warn(`[KERNEL] Current:  ${currentDeviceId.slice(0, 16)}...`);
      console.warn('[KERNEL] Identity may be bound to a different device');
    }
  }

  // Initialize CDI
  const cdi = new CDIStub({
    tombstone_budget: {
      soft_per_24h: 20,
      hard_per_24h: 100,
    },
  });

  // Get model path
  let modelPath = cfg.model_path;
  if (!modelPath) {
    console.error('[KERNEL] No model configured');
    console.error('[KERNEL] Run `mathison model install` to download default model');
    process.exit(1);
  }

  const resolvedPath = getModelPath(modelPath);
  if (!resolvedPath) {
    console.error(`[KERNEL] Model not found: ${modelPath}`);
    console.error('[KERNEL] Run `mathison model install` to download default model');
    process.exit(1);
  }

  return {
    store,
    cdi,
    bootResult,
    deviceId: cfg.device_id || getDeviceId(),
    modelPath: resolvedPath,
    serverPort: cfg.llama_server_port,
  };
}

export async function startKernelRepl(state: KernelState): Promise<void> {
  console.log('[KERNEL] Starting llama-server...');

  const serverConfig: LlamaServerConfig = {
    modelPath: state.modelPath,
    port: state.serverPort,
    contextSize: 4096,
    threads: 4,
  };

  startLlamaServer(serverConfig);

  console.log('[KERNEL] Mathison ready');
  console.log('[KERNEL] Type your message and press Enter. Type "exit" to quit.');
  console.log('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', async (input: string) => {
    const trimmed = input.trim();

    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log('[KERNEL] Shutting down...');
      stopLlamaServer();
      rl.close();
      process.exit(0);
    }

    if (!trimmed) {
      rl.prompt();
      return;
    }

    try {
      // Build prompt with identity context
      const systemPrompt = buildSystemPrompt(state);
      const fullPrompt = `${systemPrompt}\n\nUser: ${trimmed}\n\nAssistant:`;

      // Query model
      const response = await complete(state.serverPort, {
        prompt: fullPrompt,
        max_tokens: 512,
        temperature: 0.7,
        stop: ['User:', '\n\n'],
      });

      console.log(`\n${response.content}\n`);

      // Parse and apply STORE_BEAM_INTENT if present
      const intents = parseIntents(response.content);
      for (const intent of intents) {
        await applyIntent(state, intent);
      }
    } catch (e: any) {
      console.error(`[ERROR] ${e.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('[KERNEL] Goodbye');
    stopLlamaServer();
    process.exit(0);
  });
}

function buildSystemPrompt(state: KernelState): string {
  const selfFrame = state.bootResult.selfFrame?.selfFrame || '';
  const hash = state.bootResult.selfFrame?.hash || '';

  return `You are Mathison, an OI system. Your identity is defined by your SelfFrame (hash: ${hash.slice(0, 16)}...).

${selfFrame}

You cannot write to BeamStore directly. To store or modify memory, output a JSON block with:
STORE_BEAM_INTENT {
  "op": "PUT" | "RETIRE" | "PIN" | "UNPIN" | "TOMBSTONE" | "PURGE",
  "beam": { "beam_id": "...", "kind": "...", "title": "...", "tags": [...], "body": "..." },
  "reason_code": "..."
}

The kernel will apply CDI governance before committing.`;
}

function parseIntents(text: string): StoreBeamIntent[] {
  const intents: StoreBeamIntent[] = [];
  const regex = /STORE_BEAM_INTENT\s*(\{[^}]+\})/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const intent = JSON.parse(match[1]) as StoreBeamIntent;
      intents.push(intent);
    } catch (e) {
      console.warn('[KERNEL] Failed to parse intent:', match[1]);
    }
  }

  return intents;
}

async function applyIntent(state: KernelState, intent: StoreBeamIntent): Promise<void> {
  console.log(`[CDI] Evaluating intent: ${intent.op} on ${intent.beam.beam_id}`);

  const result = await applyIntentGoverned({
    store: state.store,
    cdi: state.cdi,
    intent,
  });

  if (result.ok) {
    console.log(`[CDI] Intent applied: ${intent.op} on ${intent.beam.beam_id}`);
  } else {
    console.warn(`[CDI] Intent denied: ${result.reason_code}`);
    if (result.human_message) {
      console.warn(`[CDI] ${result.human_message}`);
    }
  }
}
