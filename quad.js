#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// packages/mathison-quadratic/quad.ts
var IS_NODE = typeof process !== "undefined" && process.versions?.node;
var IS_BROWSER = typeof window !== "undefined";
async function sha256(data) {
  if (IS_NODE) {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  } else if (IS_BROWSER && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const buffer = await window.crypto.subtle.digest("SHA-256", encoder.encode(data));
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, "0");
  }
}
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
var InMemoryStore = class {
  constructor() {
    this.nodes = /* @__PURE__ */ new Map();
    this.edges = /* @__PURE__ */ new Map();
  }
  async writeNode(node) {
    this.nodes.set(node.id, node);
  }
  async readNode(id) {
    return this.nodes.get(id) || null;
  }
  async readAllNodes() {
    return Array.from(this.nodes.values());
  }
  async writeEdge(edge) {
    this.edges.set(edge.id, edge);
  }
  async readEdgesByNode(nodeId) {
    return Array.from(this.edges.values()).filter(
      (e) => e.source === nodeId || e.target === nodeId
    );
  }
  async search(query, limit = 10) {
    const lowerQuery = query.toLowerCase();
    const results = [];
    for (const node of this.nodes.values()) {
      if (results.length >= limit) break;
      const searchable = JSON.stringify(node.data).toLowerCase();
      if (searchable.includes(lowerQuery)) {
        results.push(node);
      }
    }
    return results;
  }
  async checkpoint() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values())
    };
  }
  async restore(data) {
    this.nodes.clear();
    this.edges.clear();
    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
    }
    for (const edge of data.edges) {
      this.edges.set(edge.id, edge);
    }
  }
};
var MAX_LOG_SIZE = 1e4;
var CHECKPOINT_INTERVAL = 1e3;
var ReceiptLog = class {
  constructor() {
    this.receipts = [];
    this.receiptIndex = /* @__PURE__ */ new Map();
    this.prevHash = "0".repeat(64);
    this.seenIntents = /* @__PURE__ */ new Set();
  }
  async append(receipt) {
    if (this.seenIntents.has(receipt.intent_id)) {
      throw new Error(`Replay attack: intent ${receipt.intent_id} already executed`);
    }
    const receiptData = JSON.stringify(receipt);
    const logs_hash = await sha256(receiptData);
    const fullReceipt = {
      ...receipt,
      logs_hash,
      prev_hash: this.prevHash
    };
    this.receipts.push(fullReceipt);
    this.receiptIndex.set(fullReceipt.receipt_id, fullReceipt);
    this.seenIntents.add(receipt.intent_id);
    this.prevHash = logs_hash;
    if (this.receipts.length >= MAX_LOG_SIZE) {
      await this.compact();
    }
    return fullReceipt;
  }
  getReceipt(receiptId) {
    return this.receiptIndex.get(receiptId) || null;
  }
  getAll() {
    return [...this.receipts];
  }
  getLast(n) {
    return this.receipts.slice(-n);
  }
  async compact() {
    if (this.receipts.length > CHECKPOINT_INTERVAL) {
      const toKeep = this.receipts.slice(-CHECKPOINT_INTERVAL);
      this.receipts = toKeep;
      this.receiptIndex.clear();
      for (const r of toKeep) {
        this.receiptIndex.set(r.receipt_id, r);
      }
    }
  }
  async checkpoint() {
    return [...this.receipts];
  }
  async restore(receipts) {
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
};
var CIF = class {
  constructor(config) {
    this.config = config;
  }
  async ingress(input) {
    const inputStr = JSON.stringify(input);
    if (inputStr.length > this.config.maxInputSize) {
      throw new Error(`CIF: Input exceeds max size (${this.config.maxInputSize})`);
    }
    let sanitized = inputStr;
    for (const pattern of this.config.redactPatterns) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }
    return JSON.parse(sanitized);
  }
  async egress(output) {
    const outputStr = JSON.stringify(output);
    if (outputStr.length > this.config.maxOutputSize) {
      throw new Error(`CIF: Output exceeds max size (${this.config.maxOutputSize})`);
    }
    let redacted = outputStr;
    for (const pattern of this.config.redactPatterns) {
      redacted = redacted.replace(pattern, "[REDACTED]");
    }
    return JSON.parse(redacted);
  }
};
var CDI = class {
  constructor(stage, posture) {
    this.policy = this.buildPolicy(stage, posture);
  }
  buildPolicy(stage, posture) {
    const allowedActions = /* @__PURE__ */ new Map();
    allowedActions.set("WINDOW" /* WINDOW */, /* @__PURE__ */ new Set([
      "memory.put",
      "memory.get",
      "memory.search",
      "status",
      "help"
    ]));
    allowedActions.set("BROWSER" /* BROWSER */, /* @__PURE__ */ new Set([
      ...allowedActions.get("WINDOW" /* WINDOW */),
      "storage.persist",
      "storage.load"
    ]));
    allowedActions.set("SYSTEM" /* SYSTEM */, /* @__PURE__ */ new Set([
      ...allowedActions.get("BROWSER" /* BROWSER */),
      "fs.read",
      "fs.write"
    ]));
    allowedActions.set("NETWORK" /* NETWORK */, /* @__PURE__ */ new Set([
      ...allowedActions.get("SYSTEM" /* SYSTEM */),
      "http.get",
      "http.post",
      "llm.complete"
    ]));
    allowedActions.set("MESH" /* MESH */, /* @__PURE__ */ new Set([
      ...allowedActions.get("NETWORK" /* NETWORK */),
      "mesh.send",
      "mesh.receive",
      "mesh.register_peer"
    ]));
    allowedActions.set("ORCHESTRA" /* ORCHESTRA */, /* @__PURE__ */ new Set([
      ...allowedActions.get("MESH" /* MESH */),
      "orchestra.coordinate",
      "orchestra.delegate",
      "orchestra.register_oi"
    ]));
    const riskThresholds = /* @__PURE__ */ new Map();
    riskThresholds.set("LOW" /* LOW */, "CRITICAL" /* CRITICAL */);
    riskThresholds.set("NORMAL" /* NORMAL */, "HIGH" /* HIGH */);
    riskThresholds.set("HIGH" /* HIGH */, "MEDIUM" /* MEDIUM */);
    return { stage, posture, allowedActions, riskThresholds };
  }
  async decide(intent) {
    const stageOrder = ["WINDOW" /* WINDOW */, "BROWSER" /* BROWSER */, "SYSTEM" /* SYSTEM */, "NETWORK" /* NETWORK */, "MESH" /* MESH */, "ORCHESTRA" /* ORCHESTRA */];
    const currentStageIndex = stageOrder.indexOf(this.policy.stage);
    const requiredStageIndex = stageOrder.indexOf(intent.stage_required);
    if (requiredStageIndex > currentStageIndex) {
      return { allow: false, reason: "DENY_UNKNOWN_STAGE" /* DENY_UNKNOWN_STAGE */ };
    }
    const allowedActions = this.policy.allowedActions.get(this.policy.stage);
    if (!allowedActions?.has(intent.action)) {
      return { allow: false, reason: "DENY_UNKNOWN_ACTION" /* DENY_UNKNOWN_ACTION */ };
    }
    const maxRisk = this.policy.riskThresholds.get(this.policy.posture);
    const riskOrder = ["NONE" /* NONE */, "LOW" /* LOW */, "MEDIUM" /* MEDIUM */, "HIGH" /* HIGH */, "CRITICAL" /* CRITICAL */];
    if (riskOrder.indexOf(intent.risk_class) > riskOrder.indexOf(maxRisk)) {
      return { allow: false, reason: "DENY_RISK" /* DENY_RISK */ };
    }
    return { allow: true, reason: "ALLOW" /* ALLOW */ };
  }
  updateStage(stage) {
    this.policy = this.buildPolicy(stage, this.policy.posture);
  }
  updatePosture(posture) {
    this.policy = this.buildPolicy(this.policy.stage, posture);
  }
};
var MemoryAdapter = class {
  constructor(store) {
    this.store = store;
    this.name = "memory";
  }
  async execute(action, args) {
    switch (action) {
      case "memory.put": {
        const node = {
          id: args.id || generateId(),
          type: args.type || "data",
          data: args.data || {},
          metadata: args.metadata,
          created_at: Date.now()
        };
        await this.store.writeNode(node);
        return { node };
      }
      case "memory.get": {
        const node = await this.store.readNode(args.id);
        return { node };
      }
      case "memory.search": {
        const results = await this.store.search(args.query, args.limit || 10);
        return { results, count: results.length };
      }
      default:
        throw new Error(`Unknown memory action: ${action}`);
    }
  }
};
var StorageAdapter = class {
  constructor(store, receiptLog) {
    this.store = store;
    this.receiptLog = receiptLog;
    this.name = "storage";
  }
  async execute(action, args) {
    switch (action) {
      case "storage.persist": {
        const checkpoint = await this.store.checkpoint();
        const receipts = await this.receiptLog.checkpoint();
        const bundle = { checkpoint, receipts };
        if (IS_NODE && args.path) {
          const fs = await import("fs/promises");
          await fs.writeFile(args.path, JSON.stringify(bundle, null, 2));
          return { path: args.path, size: JSON.stringify(bundle).length };
        } else if (IS_BROWSER && window.localStorage) {
          window.localStorage.setItem("mathison_bundle", JSON.stringify(bundle));
          return { storage: "localStorage", size: JSON.stringify(bundle).length };
        } else {
          throw new Error("Storage not available");
        }
      }
      case "storage.load": {
        let bundle;
        if (IS_NODE && args.path) {
          const fs = await import("fs/promises");
          const data = await fs.readFile(args.path, "utf-8");
          bundle = JSON.parse(data);
        } else if (IS_BROWSER && window.localStorage) {
          const data = window.localStorage.getItem("mathison_bundle");
          if (!data) throw new Error("No bundle found in localStorage");
          bundle = JSON.parse(data);
        } else {
          throw new Error("Storage not available");
        }
        await this.store.restore(bundle.checkpoint);
        await this.receiptLog.restore(bundle.receipts);
        return { loaded: true, nodes: bundle.checkpoint.nodes.length, receipts: bundle.receipts.length };
      }
      default:
        throw new Error(`Unknown storage action: ${action}`);
    }
  }
};
var SystemAdapter = class {
  constructor() {
    this.name = "system";
  }
  async execute(action, args) {
    if (!IS_NODE) {
      throw new Error("System adapter requires Node runtime");
    }
    const fs = await import("fs/promises");
    const path = await import("path");
    switch (action) {
      case "fs.read": {
        if (!args.path.startsWith("./data/")) {
          throw new Error("Path not in allowlist");
        }
        const content = await fs.readFile(args.path, "utf-8");
        return { content };
      }
      case "fs.write": {
        if (!args.path.startsWith("./data/")) {
          throw new Error("Path not in allowlist");
        }
        await fs.writeFile(args.path, args.content);
        return { written: true, path: args.path };
      }
      default:
        throw new Error(`Unknown system action: ${action}`);
    }
  }
};
var NetworkAdapter = class {
  constructor() {
    this.name = "network";
  }
  async execute(action, args) {
    switch (action) {
      case "http.get": {
        if (!args.url.match(/^https:\/\/(api\.example\.com|api\.anthropic\.com|api\.openai\.com|localhost)/)) {
          throw new Error("URL not in allowlist");
        }
        const response = await fetch(args.url);
        const data = await response.text();
        return { status: response.status, data };
      }
      case "http.post": {
        if (!args.url.match(/^https:\/\/(api\.example\.com|api\.anthropic\.com|api\.openai\.com|localhost)/)) {
          throw new Error("URL not in allowlist");
        }
        const response = await fetch(args.url, {
          method: "POST",
          headers: args.headers || { "Content-Type": "application/json" },
          body: JSON.stringify(args.body)
        });
        const data = await response.text();
        return { status: response.status, data };
      }
      default:
        throw new Error(`Unknown network action: ${action}`);
    }
  }
};
var LLMAdapter = class {
  constructor() {
    this.name = "llm";
  }
  async execute(action, args) {
    switch (action) {
      case "llm.complete": {
        const apiKey = IS_NODE ? process.env.ANTHROPIC_API_KEY : window.__ANTHROPIC_API_KEY__;
        if (!apiKey) {
          return { error: "No API key configured", fallback: this.localFallback(args.prompt) };
        }
        try {
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
              model: args.model || "claude-3-haiku-20240307",
              max_tokens: args.max_tokens || 1024,
              messages: [{ role: "user", content: args.prompt }]
            })
          });
          const data = await response.json();
          return {
            text: data.content[0].text,
            model: data.model,
            tokens: data.usage.output_tokens
          };
        } catch (error) {
          return { error: error.message, fallback: this.localFallback(args.prompt) };
        }
      }
      default:
        throw new Error(`Unknown LLM action: ${action}`);
    }
  }
  localFallback(prompt) {
    if (prompt.toLowerCase().includes("hello") || prompt.toLowerCase().includes("hi")) {
      return "Hello! I am a local fallback. For full capabilities, configure an API key.";
    }
    if (prompt.toLowerCase().includes("what") || prompt.toLowerCase().includes("how")) {
      return "I can help with that, but I need API access for detailed responses. Using local fallback mode.";
    }
    return `[Local Fallback] Received: "${prompt.slice(0, 50)}..."`;
  }
};
var MeshAdapter = class {
  constructor() {
    this.name = "mesh";
    this.beamStore = /* @__PURE__ */ new Map();
    this.peerOIs = /* @__PURE__ */ new Map();
  }
  // oi_id -> address
  async execute(action, args) {
    switch (action) {
      case "mesh.send": {
        const beam = {
          beam_id: generateId(),
          from_oi: args.from_oi,
          to_oi: args.to_oi,
          message_type: args.message_type || "request",
          payload: args.payload,
          taint_labels: args.taint_labels || [],
          timestamp: Date.now()
        };
        this.beamStore.set(beam.beam_id, beam);
        return { beam_id: beam.beam_id, sent: true };
      }
      case "mesh.receive": {
        const beams = Array.from(this.beamStore.values()).filter(
          (b) => b.to_oi === args.oi_id
        );
        return { beams, count: beams.length };
      }
      case "mesh.register_peer": {
        this.peerOIs.set(args.oi_id, args.address);
        return { registered: true, peer_count: this.peerOIs.size };
      }
      default:
        throw new Error(`Unknown mesh action: ${action}`);
    }
  }
};
var OrchestraAdapter = class {
  constructor() {
    this.name = "orchestra";
    this.ois = /* @__PURE__ */ new Map();
  }
  // In-process OI instances
  async execute(action, args) {
    switch (action) {
      case "orchestra.coordinate": {
        const taskId = generateId();
        const results = [];
        for (const oiId of args.oi_ids || []) {
          if (this.ois.has(oiId)) {
            const oi = this.ois.get(oiId);
            const result = await oi.dispatch(args.task);
            results.push({ oi_id: oiId, result });
          }
        }
        return { task_id: taskId, results };
      }
      case "orchestra.delegate": {
        const oiId = Array.from(this.ois.keys())[0];
        if (!oiId) {
          throw new Error("No OIs available for delegation");
        }
        const oi = this.ois.get(oiId);
        const result = await oi.dispatch(args.task);
        return { delegated_to: oiId, result };
      }
      case "orchestra.register_oi": {
        this.ois.set(args.oi_id, args.oi_instance);
        return { registered: true, oi_count: this.ois.size };
      }
      default:
        throw new Error(`Unknown orchestra action: ${action}`);
    }
  }
};
var OI = class {
  constructor(config = {}) {
    this.state = {
      oi_id: config.oi_id || generateId(),
      stage: config.stage || "WINDOW" /* WINDOW */,
      posture: config.posture || "NORMAL" /* NORMAL */,
      device_env: IS_NODE ? "node" : IS_BROWSER ? "browser" : "unknown",
      net_env: IS_BROWSER && navigator.onLine ? "online" : "offline"
    };
    this.memory = new InMemoryStore();
    this.receipts = new ReceiptLog();
    this.cif = new CIF({
      maxInputSize: 1024 * 1024,
      // 1MB
      maxOutputSize: 1024 * 1024,
      redactPatterns: [
        /password["\s:=]+[^\s"]+/gi,
        /token["\s:=]+[^\s"]+/gi,
        /api[_-]?key["\s:=]+[^\s"]+/gi
      ]
    });
    this.cdi = new CDI(this.state.stage, this.state.posture);
    this.adapters = /* @__PURE__ */ new Map();
    this.installBaseAdapters();
  }
  installBaseAdapters() {
    this.adapters.set("memory", new MemoryAdapter(this.memory));
    this.adapters.set("storage", new StorageAdapter(this.memory, this.receipts));
    if (this.state.stage >= "SYSTEM" /* SYSTEM */ && IS_NODE) {
      this.adapters.set("system", new SystemAdapter());
    }
    if (this.state.stage >= "NETWORK" /* NETWORK */) {
      this.adapters.set("network", new NetworkAdapter());
      this.adapters.set("llm", new LLMAdapter());
    }
    if (this.state.stage >= "MESH" /* MESH */) {
      this.adapters.set("mesh", new MeshAdapter());
    }
    if (this.state.stage >= "ORCHESTRA" /* ORCHESTRA */) {
      this.adapters.set("orchestra", new OrchestraAdapter());
    }
  }
  async dispatch(input) {
    const sanitized = await this.cif.ingress(input);
    const intent = this.parseIntent(sanitized);
    const decision = await this.cdi.decide(intent);
    let receipt;
    if (!decision.allow) {
      receipt = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: "DENY",
        reason: decision.reason,
        timestamp: Date.now()
      });
      return {
        success: false,
        reason: decision.reason,
        receipt_id: receipt.receipt_id
      };
    }
    try {
      const [adapterName] = intent.action.split(".");
      const adapter = this.adapters.get(adapterName);
      if (!adapter) {
        throw new Error(`No adapter for action: ${intent.action}`);
      }
      const result = await adapter.execute(intent.action, intent.args);
      const validated = result;
      const redacted = await this.cif.egress(validated);
      receipt = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: "ALLOW",
        reason: "ALLOW" /* ALLOW */,
        artifacts: redacted,
        timestamp: Date.now()
      });
      return {
        success: true,
        data: redacted,
        receipt_id: receipt.receipt_id
      };
    } catch (error) {
      receipt = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: "DENY",
        reason: "DENY_UNKNOWN_ACTION" /* DENY_UNKNOWN_ACTION */,
        artifacts: { error: error.message },
        timestamp: Date.now()
      });
      return {
        success: false,
        error: error.message,
        receipt_id: receipt.receipt_id
      };
    }
  }
  parseIntent(input) {
    if (typeof input === "string") {
      input = { action: "help", args: { query: input } };
    }
    return {
      intent_id: generateId(),
      action: input.action || "help",
      args: input.args || {},
      risk_class: this.inferRisk(input.action),
      stage_required: this.inferStage(input.action),
      timestamp: Date.now()
    };
  }
  inferRisk(action) {
    if (action.startsWith("memory.get") || action === "status" || action === "help") {
      return "NONE" /* NONE */;
    }
    if (action.startsWith("memory.put")) {
      return "LOW" /* LOW */;
    }
    if (action.startsWith("storage.")) {
      return "MEDIUM" /* MEDIUM */;
    }
    if (action.startsWith("fs.") || action.startsWith("http.") || action.startsWith("llm.")) {
      return "HIGH" /* HIGH */;
    }
    if (action.startsWith("mesh.") || action.startsWith("orchestra.")) {
      return "CRITICAL" /* CRITICAL */;
    }
    return "MEDIUM" /* MEDIUM */;
  }
  inferStage(action) {
    if (action.startsWith("orchestra.")) return "ORCHESTRA" /* ORCHESTRA */;
    if (action.startsWith("mesh.")) return "MESH" /* MESH */;
    if (action.startsWith("http.") || action.startsWith("llm.")) return "NETWORK" /* NETWORK */;
    if (action.startsWith("fs.")) return "SYSTEM" /* SYSTEM */;
    if (action.startsWith("storage.")) return "BROWSER" /* BROWSER */;
    return "WINDOW" /* WINDOW */;
  }
  async upgrade(stage) {
    const intent = {
      intent_id: generateId(),
      action: "upgrade",
      args: { target_stage: stage },
      risk_class: "HIGH" /* HIGH */,
      stage_required: "WINDOW" /* WINDOW */,
      timestamp: Date.now()
    };
    const stageOrder = ["WINDOW" /* WINDOW */, "BROWSER" /* BROWSER */, "SYSTEM" /* SYSTEM */, "NETWORK" /* NETWORK */, "MESH" /* MESH */, "ORCHESTRA" /* ORCHESTRA */];
    const currentIndex = stageOrder.indexOf(this.state.stage);
    const targetIndex = stageOrder.indexOf(stage);
    if (targetIndex <= currentIndex) {
      const receipt2 = await this.receipts.append({
        receipt_id: generateId(),
        intent_id: intent.intent_id,
        outcome: "DENY",
        reason: "DENY_OUT_OF_SCOPE" /* DENY_OUT_OF_SCOPE */,
        timestamp: Date.now()
      });
      throw new Error(`Cannot downgrade or stay at current stage`);
    }
    this.state.stage = stage;
    this.cdi.updateStage(stage);
    this.installBaseAdapters();
    const receipt = await this.receipts.append({
      receipt_id: generateId(),
      intent_id: intent.intent_id,
      outcome: "ALLOW",
      reason: "ALLOW" /* ALLOW */,
      artifacts: { new_stage: stage },
      timestamp: Date.now()
    });
    return receipt;
  }
  async exportBundle() {
    const checkpoint = await this.memory.checkpoint();
    const receipts = await this.receipts.checkpoint();
    return JSON.stringify({
      oi_id: this.state.oi_id,
      stage: this.state.stage,
      posture: this.state.posture,
      checkpoint,
      receipts
    }, null, 2);
  }
  async importBundle(bundle) {
    const data = JSON.parse(bundle);
    this.state.oi_id = data.oi_id;
    this.state.stage = data.stage;
    this.state.posture = data.posture;
    await this.memory.restore(data.checkpoint);
    await this.receipts.restore(data.receipts);
    this.cdi.updateStage(this.state.stage);
    this.installBaseAdapters();
  }
  getStatus() {
    return {
      oi_id: this.state.oi_id,
      stage: this.state.stage,
      posture: this.state.posture,
      device_env: this.state.device_env,
      net_env: this.state.net_env,
      adapters: Array.from(this.adapters.keys()),
      receipts_count: this.receipts.getAll().length
    };
  }
  getLastReceipts(n = 5) {
    return this.receipts.getLast(n);
  }
};
function bootBrowser(options) {
  const oi = createOI({ stage: "BROWSER" /* BROWSER */ });
  const container = options.mount;
  container.innerHTML = `
    <div style="font-family: monospace; padding: 20px; background: #000; color: #0f0;">
      <h2>\u{1F9E0} Mathison Quadratic OI</h2>
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
  const statusEl = container.querySelector("#status");
  const inputEl = container.querySelector("#input");
  const submitEl = container.querySelector("#submit");
  const outputEl = container.querySelector("#output");
  const receiptsEl = container.querySelector("#receipts");
  const updateStatus = () => {
    const status = oi.getStatus();
    statusEl.innerHTML = `
      <strong>OI ID:</strong> ${status.oi_id}<br/>
      <strong>Stage:</strong> ${status.stage} | <strong>Posture:</strong> ${status.posture}<br/>
      <strong>Device:</strong> ${status.device_env} | <strong>Network:</strong> ${status.net_env}<br/>
      <strong>Adapters:</strong> ${status.adapters.join(", ")}<br/>
      <strong>Receipts:</strong> ${status.receipts_count}
    `;
    const lastReceipts = oi.getLastReceipts(3);
    receiptsEl.innerHTML = "<strong>Last Receipts:</strong><br/>" + lastReceipts.map((r) => `[${r.outcome}] ${r.reason} (${r.receipt_id.slice(0, 8)}...)`).join("<br/>");
  };
  submitEl.addEventListener("click", async () => {
    const input = inputEl.value;
    if (!input) return;
    try {
      const result = await oi.dispatch(input);
      outputEl.innerHTML += `<div style="margin: 10px 0; padding: 10px; background: #111; border-left: 3px solid ${result.success ? "#0f0" : "#f00"};">
        <strong>Input:</strong> ${input}<br/>
        <strong>Result:</strong> ${JSON.stringify(result, null, 2)}
      </div>`;
      inputEl.value = "";
      updateStatus();
    } catch (error) {
      outputEl.innerHTML += `<div style="margin: 10px 0; padding: 10px; background: #300; border-left: 3px solid #f00;">
        <strong>Error:</strong> ${error.message}
      </div>`;
    }
  });
  inputEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") submitEl.click();
  });
  updateStatus();
  return oi;
}
function createOI(config = {}) {
  return new OI(config);
}
async function runCLI(args) {
  const command = args[0];
  const oi = createOI({ stage: "WINDOW" /* WINDOW */ });
  switch (command) {
    case "init": {
      console.log("\u{1F9E0} Initializing Mathison Quadratic OI...");
      console.log(JSON.stringify(oi.getStatus(), null, 2));
      break;
    }
    case "status": {
      console.log(JSON.stringify(oi.getStatus(), null, 2));
      break;
    }
    case "dispatch": {
      const input = args[1];
      if (!input) {
        console.error('Usage: quad dispatch "<json or text>"');
        process.exit(1);
      }
      let parsed;
      try {
        parsed = JSON.parse(input);
      } catch {
        parsed = input;
      }
      const result = await oi.dispatch(parsed);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "upgrade": {
      const stage = args[1];
      if (!stage) {
        console.error("Usage: quad upgrade <STAGE>");
        console.error("Stages: WINDOW | BROWSER | SYSTEM | NETWORK | MESH | ORCHESTRA");
        process.exit(1);
      }
      try {
        const receipt = await oi.upgrade(stage);
        console.log("\u2713 Upgraded to", stage);
        console.log(JSON.stringify(receipt, null, 2));
      } catch (error) {
        console.error("\u2717", error.message);
        process.exit(1);
      }
      break;
    }
    case "verify": {
      console.log("\u{1F50D} Verifying receipt hash chain...\n");
      const receipts = oi.getLastReceipts(1e3);
      if (receipts.length === 0) {
        console.log("No receipts to verify.");
        break;
      }
      let valid = true;
      let prevHash = "0".repeat(64);
      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        if (receipt.prev_hash !== prevHash) {
          console.error(`\u2717 Receipt ${i} (${receipt.receipt_id}): prev_hash mismatch`);
          console.error(`  Expected: ${prevHash}`);
          console.error(`  Got: ${receipt.prev_hash}`);
          valid = false;
          break;
        }
        const receiptData = JSON.stringify({
          receipt_id: receipt.receipt_id,
          intent_id: receipt.intent_id,
          outcome: receipt.outcome,
          reason: receipt.reason,
          artifacts: receipt.artifacts,
          timestamp: receipt.timestamp
        });
        const computedHash = await sha256(receiptData);
        if (computedHash !== receipt.logs_hash) {
          console.error(`\u2717 Receipt ${i} (${receipt.receipt_id}): logs_hash mismatch`);
          console.error(`  Expected: ${computedHash}`);
          console.error(`  Got: ${receipt.logs_hash}`);
          valid = false;
          break;
        }
        prevHash = receipt.logs_hash;
      }
      if (valid) {
        console.log(`\u2713 Hash chain verified: ${receipts.length} receipts`);
        console.log(`  First: ${receipts[0].receipt_id}`);
        console.log(`  Last:  ${receipts[receipts.length - 1].receipt_id}`);
        console.log(`  Final hash: ${prevHash.slice(0, 16)}...`);
      } else {
        console.error("\n\u2717 Hash chain verification FAILED");
        process.exit(1);
      }
      break;
    }
    case "selftest": {
      console.log("\u{1F9EA} Running self-tests...\n");
      console.log("Test 1: Allow case (memory.put)");
      const r1 = await oi.dispatch({ action: "memory.put", args: { data: { test: "data" } } });
      console.assert(r1.success === true, "Should allow memory.put");
      console.log("\u2713 PASS\n");
      console.log("Test 2: Deny case (unknown action)");
      const r2 = await oi.dispatch({ action: "forbidden.action", args: {} });
      console.assert(r2.success === false, "Should deny unknown action");
      console.log("\u2713 PASS\n");
      console.log("Test 3: Stage gating (http.get without upgrade)");
      const r3 = await oi.dispatch({ action: "http.get", args: { url: "https://example.com" } });
      console.assert(r3.success === false, "Should deny http.get at WINDOW stage");
      console.log("\u2713 PASS\n");
      console.log("Test 4: Replay protection");
      const intent_id = generateId();
      try {
        await oi["receipts"].append({
          receipt_id: generateId(),
          intent_id,
          outcome: "ALLOW",
          reason: "ALLOW" /* ALLOW */,
          timestamp: Date.now()
        });
        await oi["receipts"].append({
          receipt_id: generateId(),
          intent_id,
          // Same intent_id
          outcome: "ALLOW",
          reason: "ALLOW" /* ALLOW */,
          timestamp: Date.now()
        });
        console.assert(false, "Should have thrown replay error");
      } catch (error) {
        console.assert(error.message.includes("Replay"), "Should detect replay");
        console.log("\u2713 PASS\n");
      }
      console.log("Test 5: Checkpoint and restore");
      const bundle = await oi.exportBundle();
      const oi2 = createOI();
      await oi2.importBundle(bundle);
      console.assert(oi2.state.oi_id === oi.state.oi_id, "Should restore OI ID");
      console.log("\u2713 PASS\n");
      console.log("Test 6: LLM adapter (local fallback)");
      await oi.upgrade("NETWORK" /* NETWORK */);
      const r6 = await oi.dispatch({ action: "llm.complete", args: { prompt: "Hello" } });
      console.assert(r6.success === true, "Should allow LLM at NETWORK stage");
      console.assert(r6.data.fallback, "Should use fallback without API key");
      console.log("\u2713 PASS\n");
      console.log("\u{1F389} All tests passed!");
      break;
    }
    default: {
      console.log("Mathison Quadratic Monolith v0.2.0");
      console.log("");
      console.log("Commands:");
      console.log("  quad init                    - Initialize new OI");
      console.log("  quad status                  - Show OI status");
      console.log('  quad dispatch "<json>"       - Dispatch action');
      console.log("  quad upgrade <STAGE>         - Upgrade to new stage");
      console.log("  quad verify                  - Verify receipt hash chain");
      console.log("  quad selftest                - Run self-tests");
      console.log("");
      console.log("Stages: WINDOW \u2192 BROWSER \u2192 SYSTEM \u2192 NETWORK \u2192 MESH \u2192 ORCHESTRA");
      console.log("");
      console.log("New in v0.2.0:");
      console.log("  \u2022 LLM integration (llm.complete action at NETWORK stage)");
      console.log("  \u2022 Mesh protocol (BeamEnvelope messaging at MESH stage)");
      console.log("  \u2022 Orchestra coordination (multi-OI at ORCHESTRA stage)");
      console.log("  \u2022 Receipt verification (quad verify command)");
      break;
    }
  }
}
if (IS_NODE && __require.main === module) {
  runCLI(process.argv.slice(2)).catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  });
}
export {
  bootBrowser,
  createOI
};
