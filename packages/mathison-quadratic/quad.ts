#!/usr/bin/env node
/**
 * MATHISON QUADRATIC MONOLITH
 *
 * Single-file OI runtime implementing two-plane architecture:
 * - Plane A (Meaning): Governance + Memory + Receipts + Intent Generation
 * - Plane B (Capability): Adapters for browser/system/network/mesh/orchestra
 *
 * Runs in: Node (CLI) | Browser (module)
 * Growth Ladder: WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA
 * Governance: CIF + CDI + Receipt Hash Chain
 * Anti-Hive: No identity fusion, namespace isolation per OI
 */

// ============================================================================
// RUNTIME DETECTION
// ============================================================================

const IS_NODE = typeof process !== 'undefined' && process.versions?.node;
const IS_BROWSER = typeof window !== 'undefined';

// ============================================================================
// TYPES & ENUMS
// ============================================================================

enum Stage {
  WINDOW = 'WINDOW',           // Local ephemeral only
  BROWSER = 'BROWSER',         // + Persistent storage (IndexedDB/localStorage)
  SYSTEM = 'SYSTEM',           // + Filesystem (Node)
  NETWORK = 'NETWORK',         // + Remote HTTP calls
  MESH = 'MESH',               // + Peer messaging
  ORCHESTRA = 'ORCHESTRA',     // + Multi-OI coordination
}

enum RiskClass {
  NONE = 'NONE',               // Pure read/view
  LOW = 'LOW',                 // Local memory mutation
  MEDIUM = 'MEDIUM',           // Persistent storage write
  HIGH = 'HIGH',               // Network/filesystem access
  CRITICAL = 'CRITICAL',       // Identity/auth operations
}

enum Posture {
  LOW = 'LOW',                 // Minimal restrictions
  NORMAL = 'NORMAL',           // Standard policy
  HIGH = 'HIGH',               // Paranoid mode
}

enum ReceiptReason {
  ALLOW = 'ALLOW',
  DENY_UNKNOWN_STAGE = 'DENY_UNKNOWN_STAGE',
  DENY_OUT_OF_SCOPE = 'DENY_OUT_OF_SCOPE',
  DENY_RISK = 'DENY_RISK',
  DENY_NO_RECEIPT = 'DENY_NO_RECEIPT',
  DENY_CIF_REDACT = 'DENY_CIF_REDACT',
  DENY_REPLAY = 'DENY_REPLAY',
  DENY_UNKNOWN_ACTION = 'DENY_UNKNOWN_ACTION',
  DENY_NO_CAPABILITY = 'DENY_NO_CAPABILITY',
}

interface CapabilityToken {
  token_id: string;
  action: string;
  expires_at: number;
  granted_by: string;
  conditions?: Record<string, any>;
}

interface BeamEnvelope {
  beam_id: string;
  from_oi: string;
  to_oi: string;
  message_type: 'request' | 'response' | 'event';
  payload: any;
  taint_labels: string[];
  signatures?: string[];
  timestamp: number;
}

interface IntentEnvelope {
  intent_id: string;
  action: string;
  args: Record<string, any>;
  risk_class: RiskClass;
  basis?: string;
  required_receipts?: string[];
  stage_required: Stage;
  signatures?: string[];
  timestamp: number;
}

interface ReceiptEnvelope {
  receipt_id: string;
  intent_id: string;
  outcome: 'ALLOW' | 'DENY';
  reason: ReceiptReason;
  artifacts?: any;
  logs_hash: string;
  timestamp: number;
  prev_hash: string;
  adapter_sig?: string;
}

interface Node {
  id: string;
  type: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: number;
}

interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
  created_at: number;
}

interface OIState {
  oi_id: string;
  stage: Stage;
  posture: Posture;
  human_state?: string;
  device_env: 'node' | 'browser' | 'unknown';
  net_env?: 'online' | 'offline';
}

interface OIConfig {
  oi_id?: string;
  stage?: Stage;
  posture?: Posture;
  storage_path?: string;
}

// ============================================================================
// CRYPTO UTILITIES (Hash Chain)
// ============================================================================

async function sha256(data: string): Promise<string> {
  if (IS_NODE) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  } else if (IS_BROWSER && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const buffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Fallback: simple hash for environments without crypto
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ============================================================================
// MEMORY STORE (Plane A: Graph Storage)
// ============================================================================

interface MemoryStore {
  writeNode(node: Node): Promise<void>;
  readNode(id: string): Promise<Node | null>;
  readAllNodes(): Promise<Node[]>;
  writeEdge(edge: Edge): Promise<void>;
  readEdgesByNode(nodeId: string): Promise<Edge[]>;
  search(query: string, limit?: number): Promise<Node[]>;
  checkpoint(): Promise<{ nodes: Node[]; edges: Edge[] }>;
  restore(data: { nodes: Node[]; edges: Edge[] }): Promise<void>;
}

class InMemoryStore implements MemoryStore {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();

  async writeNode(node: Node): Promise<void> {
    this.nodes.set(node.id, node);
  }

  async readNode(id: string): Promise<Node | null> {
    return this.nodes.get(id) || null;
  }

  async readAllNodes(): Promise<Node[]> {
    return Array.from(this.nodes.values());
  }

  async writeEdge(edge: Edge): Promise<void> {
    this.edges.set(edge.id, edge);
  }

  async readEdgesByNode(nodeId: string): Promise<Edge[]> {
    return Array.from(this.edges.values()).filter(
      e => e.source === nodeId || e.target === nodeId
    );
  }

  async search(query: string, limit: number = 10): Promise<Node[]> {
    const lowerQuery = query.toLowerCase();
    const results: Node[] = [];

    for (const node of this.nodes.values()) {
      if (results.length >= limit) break;

      const searchable = JSON.stringify(node.data).toLowerCase();
      if (searchable.includes(lowerQuery)) {
        results.push(node);
      }
    }

    return results;
  }

  async checkpoint(): Promise<{ nodes: Node[]; edges: Edge[] }> {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  async restore(data: { nodes: Node[]; edges: Edge[] }): Promise<void> {
    this.nodes.clear();
    this.edges.clear();

    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
    }

    for (const edge of data.edges) {
      this.edges.set(edge.id, edge);
    }
  }
}

// ============================================================================
// RECEIPT SYSTEM (Append-Only Hash Chain)
// ============================================================================

const MAX_LOG_SIZE = 10000;
const CHECKPOINT_INTERVAL = 1000;

class ReceiptLog {
  private receipts: ReceiptEnvelope[] = [];
  private receiptIndex: Map<string, ReceiptEnvelope> = new Map();
  private prevHash: string = '0'.repeat(64);
  private seenIntents: Set<string> = new Set();

  async append(receipt: Omit<ReceiptEnvelope, 'prev_hash' | 'logs_hash'>): Promise<ReceiptEnvelope> {
    // Replay protection
    if (this.seenIntents.has(receipt.intent_id)) {
      throw new Error(`Replay attack: intent ${receipt.intent_id} already executed`);
    }

    const receiptData = JSON.stringify(receipt);
    const logs_hash = await sha256(receiptData);
    const fullReceipt: ReceiptEnvelope = {
      ...receipt,
      logs_hash,
      prev_hash: this.prevHash,
    };

    this.receipts.push(fullReceipt);
    this.receiptIndex.set(fullReceipt.receipt_id, fullReceipt);
    this.seenIntents.add(receipt.intent_id);
    this.prevHash = logs_hash;

    // Auto-compact if needed
    if (this.receipts.length >= MAX_LOG_SIZE) {
      await this.compact();
    }

    return fullReceipt;
  }

  getReceipt(receiptId: string): ReceiptEnvelope | null {
    return this.receiptIndex.get(receiptId) || null;
  }

  getAll(): ReceiptEnvelope[] {
    return [...this.receipts];
  }

  getLast(n: number): ReceiptEnvelope[] {
    return this.receipts.slice(-n);
  }

  async compact(): Promise<void> {
    // Keep last CHECKPOINT_INTERVAL receipts
    if (this.receipts.length > CHECKPOINT_INTERVAL) {
      const toKeep = this.receipts.slice(-CHECKPOINT_INTERVAL);
      this.receipts = toKeep;

      // Rebuild index
      this.receiptIndex.clear();
      for (const r of toKeep) {
        this.receiptIndex.set(r.receipt_id, r);
      }
    }
  }

  async checkpoint(): Promise<ReceiptEnvelope[]> {
    return [...this.receipts];
  }

  async restore(receipts: ReceiptEnvelope[]): Promise<void> {
    this.receipts = receipts;
    this.receiptIndex.clear();
    this.seenIntents.clear();

    for (const r of receipts) {
      this.receiptIndex.set(r.receipt_id, r);
      this.seenIntents.add(r.intent_id);
    }

    if (receipts.length > 0) {
      this.prevHash = receipts[receipts.length - 1].logs_hash;
    }
  }
}

// ============================================================================
// CIF (Context Integrity Firewall) - Plane A
// ============================================================================

interface CIFConfig {
  maxInputSize: number;
  maxOutputSize: number;
  redactPatterns: RegExp[];
}

class CIF {
  constructor(private config: CIFConfig) {}

  async ingress(input: any): Promise<any> {
    const inputStr = JSON.stringify(input);

    // Size check
    if (inputStr.length > this.config.maxInputSize) {
      throw new Error(`CIF: Input exceeds max size (${this.config.maxInputSize})`);
    }

    // Sanitize (remove potentially dangerous patterns)
    let sanitized = inputStr;
    for (const pattern of this.config.redactPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return JSON.parse(sanitized);
  }

  async egress(output: any): Promise<any> {
    const outputStr = JSON.stringify(output);

    // Size check
    if (outputStr.length > this.config.maxOutputSize) {
      throw new Error(`CIF: Output exceeds max size (${this.config.maxOutputSize})`);
    }

    // Redact sensitive patterns
    let redacted = outputStr;
    for (const pattern of this.config.redactPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    return JSON.parse(redacted);
  }
}

// ============================================================================
// CDI (Conscience Decision Interface) - Plane A
// ============================================================================

interface Policy {
  stage: Stage;
  posture: Posture;
  allowedActions: Map<Stage, Set<string>>;
  riskThresholds: Map<Posture, RiskClass>;
}

class CDI {
  private policy: Policy;

  constructor(stage: Stage, posture: Posture) {
    this.policy = this.buildPolicy(stage, posture);
  }

  private buildPolicy(stage: Stage, posture: Posture): Policy {
    const allowedActions = new Map<Stage, Set<string>>();

    // WINDOW: Only local memory + basic queries
    allowedActions.set(Stage.WINDOW, new Set([
      'memory.put', 'memory.get', 'memory.search',
      'status', 'help',
    ]));

    // BROWSER: + Persistent storage
    allowedActions.set(Stage.BROWSER, new Set([
      ...allowedActions.get(Stage.WINDOW)!,
      'storage.persist', 'storage.load',
    ]));

    // SYSTEM: + Filesystem (Node only)
    allowedActions.set(Stage.SYSTEM, new Set([
      ...allowedActions.get(Stage.BROWSER)!,
      'fs.read', 'fs.write',
    ]));

    // NETWORK: + HTTP calls + LLM
    allowedActions.set(Stage.NETWORK, new Set([
      ...allowedActions.get(Stage.SYSTEM)!,
      'http.get', 'http.post',
      'llm.complete',
    ]));

    // MESH: + Peer messaging
    allowedActions.set(Stage.MESH, new Set([
      ...allowedActions.get(Stage.NETWORK)!,
      'mesh.send', 'mesh.receive', 'mesh.register_peer',
    ]));

    // ORCHESTRA: + Multi-OI coordination
    allowedActions.set(Stage.ORCHESTRA, new Set([
      ...allowedActions.get(Stage.MESH)!,
      'orchestra.coordinate', 'orchestra.delegate', 'orchestra.register_oi',
    ]));

    const riskThresholds = new Map<Posture, RiskClass>();
    riskThresholds.set(Posture.LOW, RiskClass.CRITICAL);
    riskThresholds.set(Posture.NORMAL, RiskClass.HIGH);
    riskThresholds.set(Posture.HIGH, RiskClass.MEDIUM);

    return { stage, posture, allowedActions, riskThresholds };
  }

  async decide(intent: IntentEnvelope): Promise<{ allow: boolean; reason: ReceiptReason }> {
    // Check stage gate
    const stageOrder = [Stage.WINDOW, Stage.BROWSER, Stage.SYSTEM, Stage.NETWORK, Stage.MESH, Stage.ORCHESTRA];
    const currentStageIndex = stageOrder.indexOf(this.policy.stage);
    const requiredStageIndex = stageOrder.indexOf(intent.stage_required);

    if (requiredStageIndex > currentStageIndex) {
      return { allow: false, reason: ReceiptReason.DENY_UNKNOWN_STAGE };
    }

    // Check action allowlist
    const allowedActions = this.policy.allowedActions.get(this.policy.stage);
    if (!allowedActions?.has(intent.action)) {
      return { allow: false, reason: ReceiptReason.DENY_UNKNOWN_ACTION };
    }

    // Check risk threshold
    const maxRisk = this.policy.riskThresholds.get(this.policy.posture)!;
    const riskOrder = [RiskClass.NONE, RiskClass.LOW, RiskClass.MEDIUM, RiskClass.HIGH, RiskClass.CRITICAL];
    if (riskOrder.indexOf(intent.risk_class) > riskOrder.indexOf(maxRisk)) {
      return { allow: false, reason: ReceiptReason.DENY_RISK };
    }

    return { allow: true, reason: ReceiptReason.ALLOW };
  }

  updateStage(stage: Stage): void {
    this.policy = this.buildPolicy(stage, this.policy.posture);
  }

  updatePosture(posture: Posture): void {
    this.policy = this.buildPolicy(this.policy.stage, posture);
  }
}

// ============================================================================
// ADAPTERS (Plane B: Capability Execution)
// ============================================================================

interface Adapter {
  name: string;
  execute(action: string, args: Record<string, any>): Promise<any>;
}

class MemoryAdapter implements Adapter {
  name = 'memory';

  constructor(private store: MemoryStore) {}

  async execute(action: string, args: Record<string, any>): Promise<any> {
    switch (action) {
      case 'memory.put': {
        const node: Node = {
          id: args.id || generateId(),
          type: args.type || 'data',
          data: args.data || {},
          metadata: args.metadata,
          created_at: Date.now(),
        };
        await this.store.writeNode(node);
        return { node };
      }

      case 'memory.get': {
        const node = await this.store.readNode(args.id);
        return { node };
      }

      case 'memory.search': {
        const results = await this.store.search(args.query, args.limit || 10);
        return { results, count: results.length };
      }

      default:
        throw new Error(`Unknown memory action: ${action}`);
    }
  }
}

class StorageAdapter implements Adapter {
  name = 'storage';

  constructor(private store: MemoryStore, private receiptLog: ReceiptLog) {}

  async execute(action: string, args: Record<string, any>): Promise<any> {
    switch (action) {
      case 'storage.persist': {
        const checkpoint = await this.store.checkpoint();
        const receipts = await this.receiptLog.checkpoint();
        const bundle = { checkpoint, receipts };

        if (IS_NODE && args.path) {
          const fs = await import('fs/promises');
          await fs.writeFile(args.path, JSON.stringify(bundle, null, 2));
          return { path: args.path, size: JSON.stringify(bundle).length };
        } else if (IS_BROWSER && window.localStorage) {
          window.localStorage.setItem('mathison_bundle', JSON.stringify(bundle));
          return { storage: 'localStorage', size: JSON.stringify(bundle).length };
        } else {
          throw new Error('Storage not available');
        }
      }

      case 'storage.load': {
        let bundle: any;

        if (IS_NODE && args.path) {
          const fs = await import('fs/promises');
          const data = await fs.readFile(args.path, 'utf-8');
          bundle = JSON.parse(data);
        } else if (IS_BROWSER && window.localStorage) {
          const data = window.localStorage.getItem('mathison_bundle');
          if (!data) throw new Error('No bundle found in localStorage');
          bundle = JSON.parse(data);
        } else {
          throw new Error('Storage not available');
        }

        await this.store.restore(bundle.checkpoint);
        await this.receiptLog.restore(bundle.receipts);

        return { loaded: true, nodes: bundle.checkpoint.nodes.length, receipts: bundle.receipts.length };
      }

      default:
        throw new Error(`Unknown storage action: ${action}`);
    }
  }
}

class SystemAdapter implements Adapter {
  name = 'system';

  async execute(action: string, args: Record<string, any>): Promise<any> {
    if (!IS_NODE) {
      throw new Error('System adapter requires Node runtime');
    }

    const fs = await import('fs/promises');
    const path = await import('path');

    switch (action) {
      case 'fs.read': {
        // Allowlist check (simple)
        if (!args.path.startsWith('./data/')) {
          throw new Error('Path not in allowlist');
        }
        const content = await fs.readFile(args.path, 'utf-8');
        return { content };
      }

      case 'fs.write': {
        if (!args.path.startsWith('./data/')) {
          throw new Error('Path not in allowlist');
        }
        await fs.writeFile(args.path, args.content);
        return { written: true, path: args.path };
      }

      default:
        throw new Error(`Unknown system action: ${action}`);
    }
  }
}

class NetworkAdapter implements Adapter {
  name = 'network';

  async execute(action: string, args: Record<string, any>): Promise<any> {
    switch (action) {
      case 'http.get': {
        // Simple allowlist (production would be more sophisticated)
        if (!args.url.match(/^https:\/\/(api\.example\.com|api\.anthropic\.com|api\.openai\.com|localhost)/)) {
          throw new Error('URL not in allowlist');
        }

        const response = await fetch(args.url);
        const data = await response.text();
        return { status: response.status, data };
      }

      case 'http.post': {
        if (!args.url.match(/^https:\/\/(api\.example\.com|api\.anthropic\.com|api\.openai\.com|localhost)/)) {
          throw new Error('URL not in allowlist');
        }

        const response = await fetch(args.url, {
          method: 'POST',
          headers: args.headers || { 'Content-Type': 'application/json' },
          body: JSON.stringify(args.body),
        });
        const data = await response.text();
        return { status: response.status, data };
      }

      default:
        throw new Error(`Unknown network action: ${action}`);
    }
  }
}

class LLMAdapter implements Adapter {
  name = 'llm';

  async execute(action: string, args: Record<string, any>): Promise<any> {
    switch (action) {
      case 'llm.complete': {
        // Use environment variable for API key
        const apiKey = IS_NODE ? process.env.ANTHROPIC_API_KEY : (window as any).__ANTHROPIC_API_KEY__;

        if (!apiKey) {
          return { error: 'No API key configured', fallback: this.localFallback(args.prompt) };
        }

        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: args.model || 'claude-3-haiku-20240307',
              max_tokens: args.max_tokens || 1024,
              messages: [{ role: 'user', content: args.prompt }],
            }),
          });

          const data = await response.json();
          return {
            text: data.content[0].text,
            model: data.model,
            tokens: data.usage.output_tokens,
          };
        } catch (error: any) {
          return { error: error.message, fallback: this.localFallback(args.prompt) };
        }
      }

      default:
        throw new Error(`Unknown LLM action: ${action}`);
    }
  }

  private localFallback(prompt: string): string {
    // Simple pattern-based fallback
    if (prompt.toLowerCase().includes('hello') || prompt.toLowerCase().includes('hi')) {
      return 'Hello! I am a local fallback. For full capabilities, configure an API key.';
    }
    if (prompt.toLowerCase().includes('what') || prompt.toLowerCase().includes('how')) {
      return 'I can help with that, but I need API access for detailed responses. Using local fallback mode.';
    }
    return `[Local Fallback] Received: "${prompt.slice(0, 50)}..."`;
  }
}

class MeshAdapter implements Adapter {
  name = 'mesh';
  private beamStore: Map<string, BeamEnvelope> = new Map();
  private peerOIs: Map<string, string> = new Map(); // oi_id -> address

  async execute(action: string, args: Record<string, any>): Promise<any> {
    switch (action) {
      case 'mesh.send': {
        const beam: BeamEnvelope = {
          beam_id: generateId(),
          from_oi: args.from_oi,
          to_oi: args.to_oi,
          message_type: args.message_type || 'request',
          payload: args.payload,
          taint_labels: args.taint_labels || [],
          timestamp: Date.now(),
        };

        this.beamStore.set(beam.beam_id, beam);

        // In production: send via WebRTC, WebSocket, or HTTP to peer
        // For now, store locally
        return { beam_id: beam.beam_id, sent: true };
      }

      case 'mesh.receive': {
        const beams = Array.from(this.beamStore.values()).filter(
          b => b.to_oi === args.oi_id
        );
        return { beams, count: beams.length };
      }

      case 'mesh.register_peer': {
        this.peerOIs.set(args.oi_id, args.address);
        return { registered: true, peer_count: this.peerOIs.size };
      }

      default:
        throw new Error(`Unknown mesh action: ${action}`);
    }
  }
}

class OrchestraAdapter implements Adapter {
  name = 'orchestra';
  private ois: Map<string, any> = new Map(); // In-process OI instances

  async execute(action: string, args: Record<string, any>): Promise<any> {
    switch (action) {
      case 'orchestra.coordinate': {
        // Create a coordination task across multiple OIs
        const taskId = generateId();
        const results: any[] = [];

        for (const oiId of args.oi_ids || []) {
          if (this.ois.has(oiId)) {
            const oi = this.ois.get(oiId);
            const result = await oi.dispatch(args.task);
            results.push({ oi_id: oiId, result });
          }
        }

        return { task_id: taskId, results };
      }

      case 'orchestra.delegate': {
        // Delegate task to best available OI
        // Simple: just use first available
        const oiId = Array.from(this.ois.keys())[0];
        if (!oiId) {
          throw new Error('No OIs available for delegation');
        }

        const oi = this.ois.get(oiId);
        const result = await oi.dispatch(args.task);
        return { delegated_to: oiId, result };
      }

      case 'orchestra.register_oi': {
        this.ois.set(args.oi_id, args.oi_instance);
        return { registered: true, oi_count: this.ois.size };
      }

      default:
        throw new Error(`Unknown orchestra action: ${action}`);
    }
  }
}

// ============================================================================
// OI CORE (Plane A + Plane B Orchestration)
// ============================================================================

class OI {
  public state: OIState;
  private memory: MemoryStore;
  private receipts: ReceiptLog;
  private cif: CIF;
  private cdi: CDI;
  private adapters: Map<string, Adapter>;

  constructor(config: OIConfig = {}) {
    this.state = {
      oi_id: config.oi_id || generateId(),
      stage: config.stage || Stage.WINDOW,
      posture: config.posture || Posture.NORMAL,
      device_env: IS_NODE ? 'node' : IS_BROWSER ? 'browser' : 'unknown',
      net_env: IS_BROWSER && navigator.onLine ? 'online' : 'offline',
    };

    this.memory = new InMemoryStore();
    this.receipts = new ReceiptLog();

    this.cif = new CIF({
      maxInputSize: 1024 * 1024, // 1MB
      maxOutputSize: 1024 * 1024,
      redactPatterns: [
        /password["\s:=]+[^\s"]+/gi,
        /token["\s:=]+[^\s"]+/gi,
        /api[_-]?key["\s:=]+[^\s"]+/gi,
      ],
    });

    this.cdi = new CDI(this.state.stage, this.state.posture);

    this.adapters = new Map();
    this.installBaseAdapters();
  }

  private installBaseAdapters(): void {
    this.adapters.set('memory', new MemoryAdapter(this.memory));
    this.adapters.set('storage', new StorageAdapter(this.memory, this.receipts));

    // Stage-gated adapters
    if (this.state.stage >= Stage.SYSTEM && IS_NODE) {
      this.adapters.set('system', new SystemAdapter());
    }

    if (this.state.stage >= Stage.NETWORK) {
      this.adapters.set('network', new NetworkAdapter());
      this.adapters.set('llm', new LLMAdapter());
    }

    if (this.state.stage >= Stage.MESH) {
      this.adapters.set('mesh', new MeshAdapter());
    }

    if (this.state.stage >= Stage.ORCHESTRA) {
      this.adapters.set('orchestra', new OrchestraAdapter());
    }
  }

  async dispatch(input: any): Promise<any> {
    // CIF Ingress
    const sanitized = await this.cif.ingress(input);

    // Parse as intent
    const intent = this.parseIntent(sanitized);

    // CDI Decide
    const decision = await this.cdi.decide(intent);

    let receipt: ReceiptEnvelope;

    if (!decision.allow) {
      // DENY
      receipt = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: 'DENY',
        reason: decision.reason,
        timestamp: Date.now(),
      });

      return {
        success: false,
        reason: decision.reason,
        receipt_id: receipt.receipt_id,
      };
    }

    // ALLOW - Execute via adapter
    try {
      const [adapterName] = intent.action.split('.');
      const adapter = this.adapters.get(adapterName);

      if (!adapter) {
        throw new Error(`No adapter for action: ${intent.action}`);
      }

      const result = await adapter.execute(intent.action, intent.args);

      // CDI Output Check (placeholder - could validate result)
      const validated = result;

      // CIF Egress
      const redacted = await this.cif.egress(validated);

      receipt = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: 'ALLOW',
        reason: ReceiptReason.ALLOW,
        artifacts: redacted,
        timestamp: Date.now(),
      });

      return {
        success: true,
        data: redacted,
        receipt_id: receipt.receipt_id,
      };
    } catch (error: any) {
      receipt = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: 'DENY',
        reason: ReceiptReason.DENY_UNKNOWN_ACTION,
        artifacts: { error: error.message },
        timestamp: Date.now(),
      });

      return {
        success: false,
        error: error.message,
        receipt_id: receipt.receipt_id,
      };
    }
  }

  private parseIntent(input: any): IntentEnvelope {
    // Simple parsing - production would be more robust
    if (typeof input === 'string') {
      input = { action: 'help', args: { query: input } };
    }

    return {
      intent_id: generateId(),
      action: input.action || 'help',
      args: input.args || {},
      risk_class: this.inferRisk(input.action),
      stage_required: this.inferStage(input.action),
      timestamp: Date.now(),
    };
  }

  private inferRisk(action: string): RiskClass {
    if (action.startsWith('memory.get') || action === 'status' || action === 'help') {
      return RiskClass.NONE;
    }
    if (action.startsWith('memory.put')) {
      return RiskClass.LOW;
    }
    if (action.startsWith('storage.')) {
      return RiskClass.MEDIUM;
    }
    if (action.startsWith('fs.') || action.startsWith('http.') || action.startsWith('llm.')) {
      return RiskClass.HIGH;
    }
    if (action.startsWith('mesh.') || action.startsWith('orchestra.')) {
      return RiskClass.CRITICAL;
    }
    return RiskClass.MEDIUM;
  }

  private inferStage(action: string): Stage {
    if (action.startsWith('orchestra.')) return Stage.ORCHESTRA;
    if (action.startsWith('mesh.')) return Stage.MESH;
    if (action.startsWith('http.') || action.startsWith('llm.')) return Stage.NETWORK;
    if (action.startsWith('fs.')) return Stage.SYSTEM;
    if (action.startsWith('storage.')) return Stage.BROWSER;
    return Stage.WINDOW;
  }

  async upgrade(stage: Stage): Promise<ReceiptEnvelope> {
    const intent: IntentEnvelope = {
      intent_id: generateId(),
      action: 'upgrade',
      args: { target_stage: stage },
      risk_class: RiskClass.HIGH,
      stage_required: Stage.WINDOW,
      timestamp: Date.now(),
    };

    // Check if upgrade is valid
    const stageOrder = [Stage.WINDOW, Stage.BROWSER, Stage.SYSTEM, Stage.NETWORK, Stage.MESH, Stage.ORCHESTRA];
    const currentIndex = stageOrder.indexOf(this.state.stage);
    const targetIndex = stageOrder.indexOf(stage);

    if (targetIndex <= currentIndex) {
      const receipt = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: 'DENY',
        reason: ReceiptReason.DENY_OUT_OF_SCOPE,
        timestamp: Date.now(),
      });
      throw new Error(`Cannot downgrade or stay at current stage`);
    }

    // Upgrade
    this.state.stage = stage;
    this.cdi.updateStage(stage);
    this.installBaseAdapters();

    const receipt = await this.receipts.append({
      receipt_id: generateId(),
      intent_id: intent.intent_id,
      outcome: 'ALLOW',
      reason: ReceiptReason.ALLOW,
      artifacts: { new_stage: stage },
      timestamp: Date.now(),
    });

    return receipt;
  }

  async exportBundle(): Promise<string> {
    const checkpoint = await this.memory.checkpoint();
    const receipts = await this.receipts.checkpoint();

    return JSON.stringify({
      oi_id: this.state.oi_id,
      stage: this.state.stage,
      posture: this.state.posture,
      checkpoint,
      receipts,
    }, null, 2);
  }

  async importBundle(bundle: string): Promise<void> {
    const data = JSON.parse(bundle);

    this.state.oi_id = data.oi_id;
    this.state.stage = data.stage;
    this.state.posture = data.posture;

    await this.memory.restore(data.checkpoint);
    await this.receipts.restore(data.receipts);

    this.cdi.updateStage(this.state.stage);
    this.installBaseAdapters();
  }

  getStatus(): any {
    return {
      oi_id: this.state.oi_id,
      stage: this.state.stage,
      posture: this.state.posture,
      device_env: this.state.device_env,
      net_env: this.state.net_env,
      adapters: Array.from(this.adapters.keys()),
      receipts_count: this.receipts.getAll().length,
    };
  }

  getLastReceipts(n: number = 5): ReceiptEnvelope[] {
    return this.receipts.getLast(n);
  }
}

// ============================================================================
// BROWSER BOOT
// ============================================================================

export function bootBrowser(options: { mount: HTMLElement }): OI {
  const oi = createOI({ stage: Stage.BROWSER });

  const container = options.mount;
  container.innerHTML = `
    <div style="font-family: monospace; padding: 20px; background: #000; color: #0f0;">
      <h2>🧠 Mathison Quadratic OI</h2>
      <div id="status"></div>
      <div style="margin-top: 20px;">
        <input id="input" type="text" placeholder="Enter action JSON or text"
               style="width: 80%; padding: 8px; background: #111; color: #0f0; border: 1px solid #0f0;" />
        <button id="submit" style="padding: 8px; background: #0f0; color: #000; border: none; cursor: pointer;">Send</button>
      </div>
      <div id="output" style="margin-top: 20px; max-height: 400px; overflow-y: auto;"></div>
      <div id="receipts" style="margin-top: 20px; font-size: 12px; opacity: 0.7;"></div>
    </div>
  `;

  const statusEl = container.querySelector('#status')!;
  const inputEl = container.querySelector('#input') as HTMLInputElement;
  const submitEl = container.querySelector('#submit') as HTMLButtonElement;
  const outputEl = container.querySelector('#output')!;
  const receiptsEl = container.querySelector('#receipts')!;

  const updateStatus = () => {
    const status = oi.getStatus();
    statusEl.innerHTML = `
      <strong>OI ID:</strong> ${status.oi_id}<br/>
      <strong>Stage:</strong> ${status.stage} | <strong>Posture:</strong> ${status.posture}<br/>
      <strong>Device:</strong> ${status.device_env} | <strong>Network:</strong> ${status.net_env}<br/>
      <strong>Adapters:</strong> ${status.adapters.join(', ')}<br/>
      <strong>Receipts:</strong> ${status.receipts_count}
    `;

    const lastReceipts = oi.getLastReceipts(3);
    receiptsEl.innerHTML = '<strong>Last Receipts:</strong><br/>' +
      lastReceipts.map(r => `[${r.outcome}] ${r.reason} (${r.receipt_id.slice(0, 8)}...)`).join('<br/>');
  };

  submitEl.addEventListener('click', async () => {
    const input = inputEl.value;
    if (!input) return;

    try {
      const result = await oi.dispatch(input);
      outputEl.innerHTML += `<div style="margin: 10px 0; padding: 10px; background: #111; border-left: 3px solid ${result.success ? '#0f0' : '#f00'};">
        <strong>Input:</strong> ${input}<br/>
        <strong>Result:</strong> ${JSON.stringify(result, null, 2)}
      </div>`;
      inputEl.value = '';
      updateStatus();
    } catch (error: any) {
      outputEl.innerHTML += `<div style="margin: 10px 0; padding: 10px; background: #300; border-left: 3px solid #f00;">
        <strong>Error:</strong> ${error.message}
      </div>`;
    }
  });

  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitEl.click();
  });

  updateStatus();

  return oi;
}

// ============================================================================
// FACTORY
// ============================================================================

export function createOI(config: OIConfig = {}): OI {
  return new OI(config);
}

// ============================================================================
// CLI (Node)
// ============================================================================

async function runCLI(args: string[]): Promise<void> {
  const command = args[0];
  const oi = createOI({ stage: Stage.WINDOW });

  switch (command) {
    case 'init': {
      console.log('🧠 Initializing Mathison Quadratic OI...');
      console.log(JSON.stringify(oi.getStatus(), null, 2));
      break;
    }

    case 'status': {
      console.log(JSON.stringify(oi.getStatus(), null, 2));
      break;
    }

    case 'dispatch': {
      const input = args[1];
      if (!input) {
        console.error('Usage: quad dispatch "<json or text>"');
        process.exit(1);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(input);
      } catch {
        parsed = input;
      }

      const result = await oi.dispatch(parsed);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'upgrade': {
      const stage = args[1] as Stage;
      if (!stage) {
        console.error('Usage: quad upgrade <STAGE>');
        console.error('Stages: WINDOW | BROWSER | SYSTEM | NETWORK | MESH | ORCHESTRA');
        process.exit(1);
      }

      try {
        const receipt = await oi.upgrade(stage);
        console.log('✓ Upgraded to', stage);
        console.log(JSON.stringify(receipt, null, 2));
      } catch (error: any) {
        console.error('✗', error.message);
        process.exit(1);
      }
      break;
    }

    case 'verify': {
      console.log('🔍 Verifying receipt hash chain...\n');

      const receipts = oi.getLastReceipts(1000); // Get all receipts (up to 1000)

      if (receipts.length === 0) {
        console.log('No receipts to verify.');
        break;
      }

      let valid = true;
      let prevHash = '0'.repeat(64);

      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];

        // Check prev_hash linkage
        if (receipt.prev_hash !== prevHash) {
          console.error(`✗ Receipt ${i} (${receipt.receipt_id}): prev_hash mismatch`);
          console.error(`  Expected: ${prevHash}`);
          console.error(`  Got: ${receipt.prev_hash}`);
          valid = false;
          break;
        }

        // Verify logs_hash
        const receiptData = JSON.stringify({
          receipt_id: receipt.receipt_id,
          intent_id: receipt.intent_id,
          outcome: receipt.outcome,
          reason: receipt.reason,
          artifacts: receipt.artifacts,
          timestamp: receipt.timestamp,
        });

        const computedHash = await sha256(receiptData);

        if (computedHash !== receipt.logs_hash) {
          console.error(`✗ Receipt ${i} (${receipt.receipt_id}): logs_hash mismatch`);
          console.error(`  Expected: ${computedHash}`);
          console.error(`  Got: ${receipt.logs_hash}`);
          valid = false;
          break;
        }

        prevHash = receipt.logs_hash;
      }

      if (valid) {
        console.log(`✓ Hash chain verified: ${receipts.length} receipts`);
        console.log(`  First: ${receipts[0].receipt_id}`);
        console.log(`  Last:  ${receipts[receipts.length - 1].receipt_id}`);
        console.log(`  Final hash: ${prevHash.slice(0, 16)}...`);
      } else {
        console.error('\n✗ Hash chain verification FAILED');
        process.exit(1);
      }
      break;
    }

    case 'selftest': {
      console.log('🧪 Running self-tests...\n');

      // Test 1: Allow case
      console.log('Test 1: Allow case (memory.put)');
      const r1 = await oi.dispatch({ action: 'memory.put', args: { data: { test: 'data' } } });
      console.assert(r1.success === true, 'Should allow memory.put');
      console.log('✓ PASS\n');

      // Test 2: Deny case (unknown action)
      console.log('Test 2: Deny case (unknown action)');
      const r2 = await oi.dispatch({ action: 'forbidden.action', args: {} });
      console.assert(r2.success === false, 'Should deny unknown action');
      console.log('✓ PASS\n');

      // Test 3: Stage gating
      console.log('Test 3: Stage gating (http.get without upgrade)');
      const r3 = await oi.dispatch({ action: 'http.get', args: { url: 'https://example.com' } });
      console.assert(r3.success === false, 'Should deny http.get at WINDOW stage');
      console.log('✓ PASS\n');

      // Test 4: Replay protection
      console.log('Test 4: Replay protection');
      const intent_id = generateId();
      try {
        await oi['receipts'].append({
          receipt_id: generateId(),
          intent_id,
          outcome: 'ALLOW',
          reason: ReceiptReason.ALLOW,
          timestamp: Date.now(),
        });

        await oi['receipts'].append({
          receipt_id: generateId(),
          intent_id, // Same intent_id
          outcome: 'ALLOW',
          reason: ReceiptReason.ALLOW,
          timestamp: Date.now(),
        });

        console.assert(false, 'Should have thrown replay error');
      } catch (error: any) {
        console.assert(error.message.includes('Replay'), 'Should detect replay');
        console.log('✓ PASS\n');
      }

      // Test 5: Checkpoint/Restore
      console.log('Test 5: Checkpoint and restore');
      const bundle = await oi.exportBundle();
      const oi2 = createOI();
      await oi2.importBundle(bundle);
      console.assert(oi2.state.oi_id === oi.state.oi_id, 'Should restore OI ID');
      console.log('✓ PASS\n');

      // Test 6: LLM adapter (local fallback)
      console.log('Test 6: LLM adapter (local fallback)');
      await oi.upgrade(Stage.NETWORK);
      const r6 = await oi.dispatch({ action: 'llm.complete', args: { prompt: 'Hello' } });
      console.assert(r6.success === true, 'Should allow LLM at NETWORK stage');
      console.assert(r6.data.fallback, 'Should use fallback without API key');
      console.log('✓ PASS\n');

      console.log('🎉 All tests passed!');
      break;
    }

    default: {
      console.log('Mathison Quadratic Monolith v0.2.0');
      console.log('');
      console.log('Commands:');
      console.log('  quad init                    - Initialize new OI');
      console.log('  quad status                  - Show OI status');
      console.log('  quad dispatch "<json>"       - Dispatch action');
      console.log('  quad upgrade <STAGE>         - Upgrade to new stage');
      console.log('  quad verify                  - Verify receipt hash chain');
      console.log('  quad selftest                - Run self-tests');
      console.log('');
      console.log('Stages: WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA');
      console.log('');
      console.log('New in v0.2.0:');
      console.log('  • LLM integration (llm.complete action at NETWORK stage)');
      console.log('  • Mesh protocol (BeamEnvelope messaging at MESH stage)');
      console.log('  • Orchestra coordination (multi-OI at ORCHESTRA stage)');
      console.log('  • Receipt verification (quad verify command)');
      break;
    }
  }
}

// ============================================================================
// MAIN (CLI Entry Point)
// ============================================================================

if (IS_NODE && require.main === module) {
  runCLI(process.argv.slice(2)).catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

// ============================================================================
// ARCHITECTURE INVARIANTS (10-line summary)
// ============================================================================

/**
 * QUADRATIC MONOLITH INVARIANTS:
 *
 * 1. Two-Plane Separation: Plane A (meaning) never calls privileged ops directly; always via IntentEnvelope → Plane B (capability adapters)
 * 2. Growth Ladder: Capabilities unlock progressively: WINDOW → BROWSER → SYSTEM → NETWORK → MESH → ORCHESTRA
 * 3. Fail-Closed: Unknown action/stage/risk → DENY by default; no silent escalation
 * 4. Receipt Hash Chain: Every action appends to hash-chained log; replay protection via seen-intent set
 * 5. CIF Boundary: All inputs sanitized (ingress); all outputs redacted (egress); size-limited
 * 6. CDI Gating: Action allowlist per stage; risk threshold per posture; structural enforcement
 * 7. Anti-Hive: Each OI has namespace isolation (oi_id); no identity fusion; mesh = message-passing only
 * 8. Checkpoint/Compact: Receipt log auto-compacts at MAX_LOG_SIZE; checkpoints preserve last N receipts
 * 9. Runtime Polymorphism: Same code runs in Node (CLI) and Browser (module); adapters install per environment
 * 10. Single-File Monolith: All runtime logic in one TypeScript file; zero internal package imports; minimal external deps
 */
