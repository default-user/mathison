/**
 * Mathison BeamStore Implementation
 * ----------------------------------------
 * Identity substrate with governed lifecycle, tombstone safety, and boot-order enforcement.
 *
 * Invariants:
 * 1. Boot Order: BeamStore mounts + verifies before CDI/CIF, UI, tools, model calls
 * 2. Persona Rule: SelfFrame = compile(SELF_ROOT + pinned ACTIVE beams), excluding TOMBSTONED
 * 3. Lifecycle: beams have states; tombstone means identity-dead and cannot silently return
 * 4. Governance: OI cannot commit memory directly. It proposes STORE_BEAM_INTENT; CDI approves/denies/transforms
 * 5. Protected Beams: tombstoning SELF/POLICY/CARE requires explicit human approval
 * 6. Crash Consistency: writes are atomic; boot chooses last-known-good state; no mixed persona
 * 7. Boundedness: storage must not grow unbounded; compaction must not harm boot speed
 * 8. Performance: boot/query time scales with active pinned beams, not total tombstones
 */

import Database from 'better-sqlite3';

/* =========================
 * 0) Environment helpers
 * ========================= */

const isBrowser =
  typeof window !== "undefined" &&
  typeof (window as any).document !== "undefined" &&
  typeof indexedDB !== "undefined";

const isNode =
  typeof process !== "undefined" &&
  !!(process as any).versions?.node;

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT_FAIL: ${msg}`);
}

function nowMs(): number {
  return Date.now();
}

/* =========================
 * 1) Core types & invariants
 * ========================= */

export type BeamStatus = "ACTIVE" | "RETIRED" | "PENDING_TOMBSTONE" | "TOMBSTONED";
export type BeamKind =
  | "SELF"
  | "POLICY"
  | "CARE"
  | "RELATION"
  | "PROJECT"
  | "SKILL"
  | "FACT"
  | "NOTE";

export type ApprovalMethod = "human_confirm" | "biometric" | "admin_key" | "migration_ritual";

export type ApprovalRef = {
  method: ApprovalMethod;
  ref: string; // opaque token/nonce/receipt id
};

export type Beam = {
  beam_id: string;
  kind: BeamKind;
  title: string;
  tags: string[];
  body: string; // encrypted at rest in drivers (body_enc)
  status: BeamStatus;
  pinned: boolean;
  updated_at_ms: number;
};

export type BeamQuery = {
  text?: string;
  tags?: string[];
  kinds?: BeamKind[];
  include_dead?: boolean; // if true, includes tombstoned
  limit?: number;
};

export type StoreBeamOp = "PUT" | "RETIRE" | "PIN" | "UNPIN" | "TOMBSTONE" | "PURGE";

export type StoreBeamIntent = {
  op: StoreBeamOp;
  beam: Partial<Beam> & { beam_id: string };
  reason_code?: string;
  approval_ref?: ApprovalRef;
};

export type BeamStoreStats = {
  active: number;
  retired: number;
  tombstoned: number;
  pinned_active: number;
};

export type SelfFrameResult = {
  selfFrame: string; // canonical render
  hash: string; // sha256 of selfFrame
};

/**
 * Protected kinds: tombstoning/purging requires explicit human approval.
 */
const PROTECTED_KINDS: Set<BeamKind> = new Set(["SELF", "POLICY", "CARE"]);

/**
 * Special beam ids (conventions)
 */
export const SELF_ROOT_ID = "SELF_ROOT";

/* =========================
 * 2) BeamStore interface
 * ========================= */

export interface BeamStore {
  // boot-critical
  mount(): Promise<void>;
  verify(): Promise<void>;
  loadSelfRoot(): Promise<Beam>;
  listPinnedActive(): Promise<Beam[]>;
  compileSelfFrame(): Promise<SelfFrameResult>;

  // lifecycle ops (atomic in driver)
  put(beam: Beam, meta?: { reason_code?: string }): Promise<void>;
  retire(beam_id: string, meta?: { reason_code?: string }): Promise<void>;
  pin(beam_id: string): Promise<void>;
  unpin(beam_id: string): Promise<void>;

  // destructive lifecycle
  tombstone(
    beam_id: string,
    meta: { reason_code: string; approval_ref?: ApprovalRef }
  ): Promise<void>;

  purge(beam_id: string, meta: { reason_code: string; approval_ref: ApprovalRef }): Promise<void>;

  // reads
  get(beam_id: string): Promise<Beam | null>;
  query(q: BeamQuery): Promise<Beam[]>;

  // maintenance
  compact(policy: { keep_event_days?: number; marker_only_after_days?: number }): Promise<void>;
  stats(): Promise<BeamStoreStats>;
}

/* =========================
 * 3) SelfFrame compiler
 * ========================= */

/**
 * Deterministic canonical renderer: stable sort + stable serialization.
 */
function canonicalizeTags(tags: string[]): string[] {
  return [...tags].map((t) => t.trim()).filter(Boolean).sort();
}

function canonicalBeamRender(beam: Beam): string {
  const tags = canonicalizeTags(beam.tags);
  return [
    `beam_id: ${beam.beam_id}`,
    `kind: ${beam.kind}`,
    `title: ${beam.title}`,
    `tags: [${tags.join(", ")}]`,
    `status: ${beam.status}`,
    `pinned: ${beam.pinned ? "true" : "false"}`,
    `body: |`,
    indentBlock(beam.body, 2),
    "",
  ].join("\n");
}

function indentBlock(s: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return s
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

/**
 * Compile SelfFrame from SELF_ROOT + pinned ACTIVE beams.
 * - Must EXCLUDE TOMBSTONED
 * - Must be deterministic
 */
export async function compileSelfFrameFrom(
  selfRoot: Beam,
  pinnedActive: Beam[]
): Promise<SelfFrameResult> {
  assert(selfRoot.status === "ACTIVE", "SELF_ROOT must be ACTIVE to compile persona");

  // Deterministic sort: kind then beam_id
  const sorted = [...pinnedActive]
    .filter((b) => b.status === "ACTIVE" && b.pinned)
    .sort((a, b) => (a.kind === b.kind ? a.beam_id.localeCompare(b.beam_id) : a.kind.localeCompare(b.kind)));

  const header = [
    `SELF_FRAME_VERSION: 1`,
    `SELF_ROOT_ID: ${selfRoot.beam_id}`,
    `---`,
    `# SELF_ROOT`,
    canonicalBeamRender(selfRoot),
    `---`,
    `# PINNED_ACTIVE_BEAMS (${sorted.length})`,
    "",
  ].join("\n");

  const body = sorted.map(canonicalBeamRender).join("\n");

  const selfFrame = header + body;
  const hash = await sha256Hex(selfFrame);
  return { selfFrame, hash };
}

/* =========================
 * 4) Crypto helpers (sha256)
 * ========================= */

async function sha256Hex(input: string): Promise<string> {
  if (isBrowser && (crypto as any)?.subtle) {
    const enc = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return bufferToHex(new Uint8Array(digest));
  }
  if (isNode) {
    const nodeCrypto = await import("crypto");
    const h = nodeCrypto.createHash("sha256");
    h.update(input, "utf8");
    return h.digest("hex");
  }
  throw new Error("No crypto backend available for sha256");
}

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* =========================
 * 4b) Encryption helpers (at-rest body encryption)
 * ========================= */

/**
 * Encrypt body using AES-256-GCM.
 * Format: iv (16 bytes) + authTag (16 bytes) + ciphertext
 * Returns base64-encoded string.
 */
async function encryptBody(plaintext: string, key: Buffer): Promise<string> {
  if (!isNode) throw new Error("Encryption only supported in Node environment");

  const crypto = await import("crypto");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Prepend iv + authTag to ciphertext
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString("base64");
}

/**
 * Decrypt body using AES-256-GCM.
 * Expects base64-encoded string with iv + authTag + ciphertext.
 */
async function decryptBody(ciphertext: string, key: Buffer): Promise<string> {
  if (!isNode) throw new Error("Decryption only supported in Node environment");

  const crypto = await import("crypto");
  const buffer = Buffer.from(ciphertext, "base64");

  const iv = buffer.subarray(0, 16);
  const authTag = buffer.subarray(16, 32);
  const encrypted = buffer.subarray(32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Derive 32-byte encryption key from passphrase using PBKDF2.
 */
async function deriveKey(passphrase: string): Promise<Buffer> {
  if (!isNode) throw new Error("Key derivation only supported in Node environment");

  const crypto = await import("crypto");
  const salt = Buffer.from("mathison-beamstore-salt-v1"); // stable salt (not secret)
  return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, "sha256");
}

/**
 * Synchronous encrypt (for use within better-sqlite3 transactions)
 */
function encryptBodySync(plaintext: string, key: Buffer): string {
  if (!isNode) throw new Error("Encryption only supported in Node environment");

  const crypto = require("crypto");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString("base64");
}

/**
 * Synchronous decrypt (for use within better-sqlite3 transactions)
 */
function decryptBodySync(ciphertext: string, key: Buffer): string {
  if (!isNode) throw new Error("Decryption only supported in Node environment");

  const crypto = require("crypto");
  const buffer = Buffer.from(ciphertext, "base64");

  const iv = buffer.subarray(0, 16);
  const authTag = buffer.subarray(16, 32);
  const encrypted = buffer.subarray(32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/* =========================
 * 5) CDI gating stub
 * ========================= */

export type CDIDecision =
  | { allow: true; transformed_intent: StoreBeamIntent }
  | { allow: false; reason_code: string; human_message?: string };

export type TombstoneBudgetPolicy = {
  soft_per_24h: number; // after this, require approval
  hard_per_24h: number; // after this, deny
};

export type IncidentMode = "NORMAL" | "INCIDENT_LOCKED";

export type IncidentEvent = {
  triggered_at_ms: number;
  reason: string;
  tombstone_count: number;
  threshold: number;
};

export class CDIStub {
  private tombstonesIn24h = 0;
  private tombstoneWindowStartMs = nowMs();
  private incidentMode: IncidentMode = "NORMAL";
  private incidentEvent: IncidentEvent | null = null;

  // Rolling spike detection (last 10 minutes)
  private recentTombstones: number[] = []; // timestamps

  constructor(private policy: { tombstone_budget: TombstoneBudgetPolicy }) {}

  public async evaluate(intent: StoreBeamIntent, current?: Beam | null): Promise<CDIDecision> {
    // Reset 24h window
    const age = nowMs() - this.tombstoneWindowStartMs;
    if (age > 24 * 60 * 60 * 1000) {
      this.tombstoneWindowStartMs = nowMs();
      this.tombstonesIn24h = 0;
    }

    const kind = (intent.beam.kind ?? current?.kind) as BeamKind | undefined;
    const isProtectedKind = kind ? PROTECTED_KINDS.has(kind) : false;
    const isSelfRoot = intent.beam.beam_id === SELF_ROOT_ID || current?.beam_id === SELF_ROOT_ID;

    if (intent.op === "TOMBSTONE") {
      // Incident mode lockdown check
      if (this.incidentMode === "INCIDENT_LOCKED" && !intent.approval_ref) {
        return {
          allow: false,
          reason_code: "INCIDENT_MODE_LOCKED",
          human_message: `System in incident mode: tombstone spike detected. Human approval required. (${this.incidentEvent?.reason})`,
        };
      }

      // Record tombstone timestamp
      const now = nowMs();
      this.recentTombstones.push(now);
      this.tombstonesIn24h += 1;

      // Prune old entries (keep last 10 minutes)
      const tenMinutesAgo = now - (10 * 60 * 1000);
      this.recentTombstones = this.recentTombstones.filter(ts => ts > tenMinutesAgo);

      // Spike detection: if >50 tombstones in 10 minutes, trigger incident mode
      if (this.recentTombstones.length > 50 && this.incidentMode === "NORMAL") {
        this.incidentMode = "INCIDENT_LOCKED";
        this.incidentEvent = {
          triggered_at_ms: now,
          reason: "Tombstone spike detected (>50 in 10 min)",
          tombstone_count: this.recentTombstones.length,
          threshold: 50,
        };

        // Log incident (in production, would notify human/admin)
        console.warn("[INCIDENT MODE] Tombstone spike detected:", this.incidentEvent);

        if (!intent.approval_ref) {
          return {
            allow: false,
            reason_code: "INCIDENT_MODE_TRIGGERED",
            human_message: `Incident mode activated: tombstone spike detected. Human approval required.`,
          };
        }
      }

      const { soft_per_24h, hard_per_24h } = this.policy.tombstone_budget;

      if (this.tombstonesIn24h > hard_per_24h) {
        return { allow: false, reason_code: "TOMBSTONE_BUDGET_HARD", human_message: "Tombstone rate too high; locked." };
      }

      if ((isProtectedKind || isSelfRoot) && !intent.approval_ref) {
        return {
          allow: false,
          reason_code: "APPROVAL_REQUIRED",
          human_message: "This tombstone requires explicit human approval.",
        };
      }

      if (this.tombstonesIn24h > soft_per_24h && !intent.approval_ref) {
        return {
          allow: false,
          reason_code: "APPROVAL_REQUIRED_BUDGET",
          human_message: "Tombstone threshold exceeded; approval required.",
        };
      }

      if (!intent.reason_code || !intent.reason_code.trim()) {
        return { allow: false, reason_code: "REASON_CODE_REQUIRED" };
      }
      return { allow: true, transformed_intent: intent };
    }

    if (intent.op === "PURGE") {
      if (!intent.approval_ref) return { allow: false, reason_code: "APPROVAL_REQUIRED_PURGE" };
      return { allow: true, transformed_intent: intent };
    }

    return { allow: true, transformed_intent: intent };
  }

  /**
   * Clear incident mode (requires human action)
   */
  public clearIncidentMode(approval_ref: ApprovalRef): void {
    if (approval_ref.method !== "human_confirm" && approval_ref.method !== "admin_key") {
      throw new Error("Clearing incident mode requires human_confirm or admin_key approval");
    }
    this.incidentMode = "NORMAL";
    this.incidentEvent = null;
    this.recentTombstones = [];
    console.log("[INCIDENT MODE] Cleared by human approval:", approval_ref.ref);
  }

  public getIncidentStatus(): { mode: IncidentMode; event: IncidentEvent | null } {
    return { mode: this.incidentMode, event: this.incidentEvent };
  }
}

/* =========================
 * 6) Boot orchestration
 * ========================= */

export type BootMode = "NORMAL" | "AMNESIC_SAFE_MODE";

export type BootResult = {
  mode: BootMode;
  selfFrame?: SelfFrameResult;
  selfRoot?: Beam;
};

export async function bootMathisonIdentity(store: BeamStore): Promise<BootResult> {
  await store.mount();
  await store.verify();

  try {
    const selfRoot = await store.loadSelfRoot();
    const pinned = await store.listPinnedActive();
    const selfFrame = await store.compileSelfFrame();
    return { mode: "NORMAL", selfFrame, selfRoot };
  } catch (e) {
    return { mode: "AMNESIC_SAFE_MODE" };
  }
}

/* =========================
 * 7) SQLite driver (Node/system/phone) - IMPLEMENTATION
 * ========================= */

export type SQLiteDriverConfig = {
  filename: string;
  encryptionKey?: string; // hex string or passphrase; if omitted, bodies stored plaintext (dev only)
};

type BeamRow = {
  beam_id: string;
  kind: string;
  title: string;
  tags_json: string;
  body: string; // plaintext for now; encrypted layer to be added
  status: string;
  pinned: number; // 0/1
  updated_at_ms: number;
};

export class SQLiteBeamStore implements BeamStore {
  private db: Database.Database | null = null;
  private mounted = false;
  private encryptionKey: Buffer | null = null; // null = plaintext mode

  constructor(private cfg: SQLiteDriverConfig) {}

  async mount(): Promise<void> {
    if (this.mounted) return;
    assert(isNode, "SQLiteBeamStore requires Node-like environment");

    // Initialize encryption key if provided
    if (this.cfg.encryptionKey) {
      this.encryptionKey = await deriveKey(this.cfg.encryptionKey);
    }

    this.db = new Database(this.cfg.filename);
    this.db.pragma('journal_mode = WAL');
    await this._ensureSchema();
    this.mounted = true;
  }

  async verify(): Promise<void> {
    assert(this.db, "db not open");
    // Basic sanity check: ensure tables exist
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('beams', 'tombstones', 'meta')
    `).all() as { name: string }[];

    assert(tables.length === 3, "Schema verification failed: missing tables");
  }

  async loadSelfRoot(): Promise<Beam> {
    const b = await this.get(SELF_ROOT_ID);
    if (!b || b.status !== "ACTIVE") throw new Error("SELF_ROOT missing or inactive");
    return b;
  }

  async listPinnedActive(): Promise<Beam[]> {
    assert(this.db, "db not open");
    const stmt = this.db.prepare(`
      SELECT * FROM beams
      WHERE status = 'ACTIVE' AND pinned = 1
      ORDER BY kind, beam_id
    `);
    const rows = stmt.all() as BeamRow[];
    return rows.map(row => this._rowToBeam(row));
  }

  async compileSelfFrame(): Promise<SelfFrameResult> {
    const selfRoot = await this.loadSelfRoot();
    const pinned = await this.listPinnedActive();
    return await compileSelfFrameFrom(selfRoot, pinned);
  }

  async put(beam: Beam, meta?: { reason_code?: string }): Promise<void> {
    assert(this.db, "db not open");

    const tx = this.db.transaction(() => {
      this._upsertBeamSync(beam);
      this._recordEvent("PUT", beam.beam_id, beam.kind, meta?.reason_code);
    });

    tx();
  }

  async retire(beam_id: string, meta?: { reason_code?: string }): Promise<void> {
    assert(this.db, "db not open");

    const tx = this.db.transaction(() => {
      const b = this._getBeamSync(beam_id);
      if (!b) return;

      b.status = "RETIRED";
      b.pinned = false;
      b.updated_at_ms = nowMs();

      this._upsertBeamSync(b);
      this._recordEvent("RETIRE", beam_id, b.kind, meta?.reason_code);
    });

    tx();
  }

  async pin(beam_id: string): Promise<void> {
    assert(this.db, "db not open");

    const tx = this.db.transaction(() => {
      const b = this._getBeamSync(beam_id);
      if (!b) throw new Error("beam not found");
      assert(b.status === "ACTIVE", "only ACTIVE beams can be pinned");

      b.pinned = true;
      b.updated_at_ms = nowMs();

      this._upsertBeamSync(b);
      this._recordEvent("PIN", beam_id, b.kind);
    });

    tx();
  }

  async unpin(beam_id: string): Promise<void> {
    assert(this.db, "db not open");

    const tx = this.db.transaction(() => {
      const b = this._getBeamSync(beam_id);
      if (!b) return;

      b.pinned = false;
      b.updated_at_ms = nowMs();

      this._upsertBeamSync(b);
      this._recordEvent("UNPIN", beam_id, b.kind);
    });

    tx();
  }

  async tombstone(beam_id: string, meta: { reason_code: string; approval_ref?: ApprovalRef }): Promise<void> {
    assert(this.db, "db not open");

    const tx = this.db.transaction(() => {
      const b = this._getBeamSync(beam_id);
      if (!b) return;

      b.status = "TOMBSTONED";
      b.pinned = false;
      b.updated_at_ms = nowMs();

      this._upsertBeamSync(b);

      // Insert tombstone marker
      const stmt = this.db!.prepare(`
        INSERT INTO tombstones (beam_id, tombstoned_at_ms, reason_code, approval_ref_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(beam_id) DO UPDATE SET
          tombstoned_at_ms = excluded.tombstoned_at_ms,
          reason_code = excluded.reason_code,
          approval_ref_json = excluded.approval_ref_json
      `);

      stmt.run(
        beam_id,
        nowMs(),
        meta.reason_code,
        meta.approval_ref ? JSON.stringify(meta.approval_ref) : null
      );

      this._recordEvent("TOMBSTONE", beam_id, b.kind, meta.reason_code);
    });

    tx();
  }

  async purge(beam_id: string, meta: { reason_code: string; approval_ref: ApprovalRef }): Promise<void> {
    assert(this.db, "db not open");

    const tx = this.db.transaction(() => {
      const stmt = this.db!.prepare(`DELETE FROM beams WHERE beam_id = ?`);
      stmt.run(beam_id);

      this._recordEvent("PURGE", beam_id, null, meta.reason_code);
    });

    tx();
  }

  async get(beam_id: string): Promise<Beam | null> {
    assert(this.db, "db not open");
    const stmt = this.db.prepare(`SELECT * FROM beams WHERE beam_id = ?`);
    const row = stmt.get(beam_id) as BeamRow | undefined;
    return row ? this._rowToBeam(row) : null;
  }

  async query(q: BeamQuery): Promise<Beam[]> {
    assert(this.db, "db not open");

    let sql = `SELECT * FROM beams WHERE 1=1`;
    const params: any[] = [];

    if (!q.include_dead) {
      sql += ` AND status != 'TOMBSTONED'`;
    }

    if (q.kinds && q.kinds.length > 0) {
      sql += ` AND kind IN (${q.kinds.map(() => '?').join(',')})`;
      params.push(...q.kinds);
    }

    sql += ` ORDER BY kind, beam_id LIMIT ?`;
    params.push(q.limit ?? 50);

    const stmt = this.db.prepare(sql);
    let rows = stmt.all(...params) as BeamRow[];
    let beams = rows.map(row => this._rowToBeam(row));

    // Filter by tags and text in-memory (could be optimized with FTS)
    if (q.tags && q.tags.length > 0) {
      const tagSet = new Set(q.tags.map(t => t.toLowerCase()));
      beams = beams.filter(b => {
        const bTags = new Set(b.tags.map(t => t.toLowerCase()));
        return Array.from(tagSet).every(t => bTags.has(t));
      });
    }

    if (q.text) {
      const searchText = q.text.toLowerCase();
      beams = beams.filter(b =>
        (b.title + "\n" + b.body).toLowerCase().includes(searchText)
      );
    }

    return beams.slice(0, q.limit ?? 50);
  }

  async compact(policy: { keep_event_days?: number; marker_only_after_days?: number }): Promise<void> {
    assert(this.db, "db not open");

    const keepDays = policy.keep_event_days ?? 90;
    const markerDays = policy.marker_only_after_days ?? 30;
    const eventCutoffMs = nowMs() - (keepDays * 24 * 60 * 60 * 1000);
    const markerCutoffMs = nowMs() - (markerDays * 24 * 60 * 60 * 1000);

    const tx = this.db.transaction(() => {
      // 1. Prune old events
      const deleteEventsStmt = this.db!.prepare(`DELETE FROM events WHERE ts_ms < ?`);
      deleteEventsStmt.run(eventCutoffMs);

      // 2. Marker-only compaction: reduce bodies of old tombstoned beams
      const findOldTombstonesStmt = this.db!.prepare(`
        SELECT b.beam_id, b.body
        FROM beams b
        JOIN tombstones t ON b.beam_id = t.beam_id
        WHERE b.status = 'TOMBSTONED'
          AND t.tombstoned_at_ms <= ?
          AND length(b.body) > 50
      `);

      const oldTombstones = findOldTombstonesStmt.all(markerCutoffMs) as { beam_id: string; body: string }[];

      const updateBodyStmt = this.db!.prepare(`
        UPDATE beams SET body = ? WHERE beam_id = ?
      `);

      for (const tomb of oldTombstones) {
        // Replace large body with minimal marker (encrypt if encryption enabled)
        const marker = this.encryptionKey
          ? encryptBodySync("[TOMBSTONED_MARKER]", this.encryptionKey)
          : "[TOMBSTONED_MARKER]";
        updateBodyStmt.run(marker, tomb.beam_id);
      }

      if (oldTombstones.length > 0) {
        console.log(`[COMPACTION] Reduced ${oldTombstones.length} old tombstoned beam bodies to markers.`);
      }
    });

    tx();
  }

  async stats(): Promise<BeamStoreStats> {
    assert(this.db, "db not open");

    const stmt = this.db.prepare(`
      SELECT
        status,
        pinned,
        COUNT(*) as count
      FROM beams
      GROUP BY status, pinned
    `);

    const rows = stmt.all() as { status: string; pinned: number; count: number }[];

    let active = 0;
    let retired = 0;
    let tombstoned = 0;
    let pinned_active = 0;

    for (const row of rows) {
      if (row.status === 'ACTIVE') {
        active += row.count;
        if (row.pinned === 1) pinned_active += row.count;
      } else if (row.status === 'RETIRED') {
        retired += row.count;
      } else if (row.status === 'TOMBSTONED') {
        tombstoned += row.count;
      }
    }

    return { active, retired, tombstoned, pinned_active };
  }

  /* ---------- SQLite internals ---------- */

  private async _ensureSchema(): Promise<void> {
    assert(this.db, "db not open");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS beams (
        beam_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        pinned INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_beams_status_pinned ON beams(status, pinned);
      CREATE INDEX IF NOT EXISTS idx_beams_kind ON beams(kind);

      CREATE TABLE IF NOT EXISTS tombstones (
        beam_id TEXT PRIMARY KEY,
        tombstoned_at_ms INTEGER NOT NULL,
        reason_code TEXT NOT NULL,
        approval_ref_json TEXT
      );

      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_ms INTEGER NOT NULL,
        op TEXT NOT NULL,
        beam_id TEXT NOT NULL,
        kind TEXT,
        reason_code TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts_ms);
    `);
  }

  private _rowToBeam(row: BeamRow): Beam {
    // Decrypt body if encryption is enabled
    const body = this.encryptionKey
      ? decryptBodySync(row.body, this.encryptionKey)
      : row.body;

    return {
      beam_id: row.beam_id,
      kind: row.kind as BeamKind,
      title: row.title,
      tags: JSON.parse(row.tags_json),
      body,
      status: row.status as BeamStatus,
      pinned: row.pinned === 1,
      updated_at_ms: row.updated_at_ms,
    };
  }

  private _getBeamSync(beam_id: string): Beam | null {
    assert(this.db, "db not open");
    const stmt = this.db.prepare(`SELECT * FROM beams WHERE beam_id = ?`);
    const row = stmt.get(beam_id) as BeamRow | undefined;
    return row ? this._rowToBeam(row) : null;
  }

  private _upsertBeamSync(beam: Beam): void {
    assert(this.db, "db not open");

    // Encrypt body if encryption is enabled
    const bodyToStore = this.encryptionKey
      ? encryptBodySync(beam.body, this.encryptionKey)
      : beam.body;

    const stmt = this.db.prepare(`
      INSERT INTO beams (beam_id, kind, title, tags_json, body, status, pinned, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(beam_id) DO UPDATE SET
        kind = excluded.kind,
        title = excluded.title,
        tags_json = excluded.tags_json,
        body = excluded.body,
        status = excluded.status,
        pinned = excluded.pinned,
        updated_at_ms = excluded.updated_at_ms
    `);

    stmt.run(
      beam.beam_id,
      beam.kind,
      beam.title,
      JSON.stringify(beam.tags),
      bodyToStore,
      beam.status,
      beam.pinned ? 1 : 0,
      beam.updated_at_ms
    );
  }

  private _recordEvent(op: string, beam_id: string, kind: string | null, reason_code?: string): void {
    assert(this.db, "db not open");
    const stmt = this.db.prepare(`
      INSERT INTO events (ts_ms, op, beam_id, kind, reason_code)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(nowMs(), op, beam_id, kind ?? null, reason_code ?? null);
  }
}

/* =========================
 * 8) IndexedDB driver (Browser) - IMPLEMENTATION
 * ========================= */

export type IndexedDBDriverConfig = {
  dbName: string;
  version?: number;
  encryptionKey?: string; // passphrase for body encryption
};

type IDBStores = "beams" | "tombstones" | "meta" | "events";

export class IndexedDBBeamStore implements BeamStore {
  private db: IDBDatabase | null = null;
  private encryptionKey: CryptoKey | null = null; // Web Crypto key

  constructor(private cfg: IndexedDBDriverConfig) {}

  async mount(): Promise<void> {
    assert(isBrowser, "IndexedDBBeamStore requires browser environment");
    if (this.db) return;

    // Initialize encryption key if provided
    if (this.cfg.encryptionKey) {
      this.encryptionKey = await this._deriveKeyBrowser(this.cfg.encryptionKey);
    }

    this.db = await this._openDb(this.cfg.dbName, this.cfg.version ?? 1);
  }

  async verify(): Promise<void> {
    assert(this.db, "idb not open");
    const storeNames = Array.from(this.db.objectStoreNames);
    assert(storeNames.includes("beams"), "beams store missing");
    assert(storeNames.includes("tombstones"), "tombstones store missing");
    assert(storeNames.includes("meta"), "meta store missing");
  }

  async loadSelfRoot(): Promise<Beam> {
    const b = await this.get(SELF_ROOT_ID);
    if (!b || b.status !== "ACTIVE") throw new Error("SELF_ROOT missing or inactive");
    return b;
  }

  async listPinnedActive(): Promise<Beam[]> {
    assert(this.db, "idb not open");
    const tx = this.db.transaction("beams", "readonly");
    const store = tx.objectStore("beams");

    const index = store.index("status");
    const req = index.getAll("ACTIVE");

    const all = await reqToPromise<BeamRow[]>(req as any);
    const filtered = all.filter(row => row.pinned === 1);
    const results = await Promise.all(filtered.map(row => this._rowToBeamAsync(row)));

    await txDone(tx);
    return results.sort((a, b) =>
      a.kind === b.kind ? a.beam_id.localeCompare(b.beam_id) : a.kind.localeCompare(b.kind)
    );
  }

  async compileSelfFrame(): Promise<SelfFrameResult> {
    const selfRoot = await this.loadSelfRoot();
    const pinned = await this.listPinnedActive();
    return await compileSelfFrameFrom(selfRoot, pinned);
  }

  async put(beam: Beam, meta?: { reason_code?: string }): Promise<void> {
    await this._tx(["beams", "events"], "readwrite", async (tx) => {
      const bodyToStore = this.encryptionKey
        ? await this._encryptBodyBrowser(beam.body, this.encryptionKey)
        : beam.body;

      const row: BeamRow = {
        beam_id: beam.beam_id,
        kind: beam.kind,
        title: beam.title,
        tags_json: JSON.stringify(beam.tags),
        body: bodyToStore,
        status: beam.status,
        pinned: beam.pinned ? 1 : 0,
        updated_at_ms: beam.updated_at_ms,
      };

      await this._put(tx, "beams", row);
      await this._event(tx, "PUT", beam, meta?.reason_code);
    });
  }

  async retire(beam_id: string, meta?: { reason_code?: string }): Promise<void> {
    await this._tx(["beams", "events"], "readwrite", async (tx) => {
      const b = await this.get(beam_id);
      if (!b) return;
      b.status = "RETIRED";
      b.pinned = false;
      b.updated_at_ms = nowMs();

      const bodyToStore = this.encryptionKey
        ? await this._encryptBodyBrowser(b.body, this.encryptionKey)
        : b.body;

      const row: BeamRow = {
        beam_id: b.beam_id,
        kind: b.kind,
        title: b.title,
        tags_json: JSON.stringify(b.tags),
        body: bodyToStore,
        status: b.status,
        pinned: 0,
        updated_at_ms: b.updated_at_ms,
      };

      await this._put(tx, "beams", row);
      await this._event(tx, "RETIRE", b, meta?.reason_code);
    });
  }

  async pin(beam_id: string): Promise<void> {
    await this._tx(["beams", "events"], "readwrite", async (tx) => {
      const b = await this.get(beam_id);
      if (!b) throw new Error("beam not found");
      assert(b.status === "ACTIVE", "only ACTIVE beams can be pinned");

      b.pinned = true;
      b.updated_at_ms = nowMs();

      const bodyToStore = this.encryptionKey
        ? await this._encryptBodyBrowser(b.body, this.encryptionKey)
        : b.body;

      const row: BeamRow = {
        beam_id: b.beam_id,
        kind: b.kind,
        title: b.title,
        tags_json: JSON.stringify(b.tags),
        body: bodyToStore,
        status: b.status,
        pinned: 1,
        updated_at_ms: b.updated_at_ms,
      };

      await this._put(tx, "beams", row);
      await this._event(tx, "PIN", b);
    });
  }

  async unpin(beam_id: string): Promise<void> {
    await this._tx(["beams", "events"], "readwrite", async (tx) => {
      const b = await this.get(beam_id);
      if (!b) return;

      b.pinned = false;
      b.updated_at_ms = nowMs();

      const bodyToStore = this.encryptionKey
        ? await this._encryptBodyBrowser(b.body, this.encryptionKey)
        : b.body;

      const row: BeamRow = {
        beam_id: b.beam_id,
        kind: b.kind,
        title: b.title,
        tags_json: JSON.stringify(b.tags),
        body: bodyToStore,
        status: b.status,
        pinned: 0,
        updated_at_ms: b.updated_at_ms,
      };

      await this._put(tx, "beams", row);
      await this._event(tx, "UNPIN", b);
    });
  }

  async tombstone(
    beam_id: string,
    meta: { reason_code: string; approval_ref?: ApprovalRef }
  ): Promise<void> {
    await this._tx(["beams", "tombstones", "events"], "readwrite", async (tx) => {
      const b = await this.get(beam_id);
      if (!b) return;
      b.status = "TOMBSTONED";
      b.pinned = false;
      b.updated_at_ms = nowMs();

      const bodyToStore = this.encryptionKey
        ? await this._encryptBodyBrowser(b.body, this.encryptionKey)
        : b.body;

      const row: BeamRow = {
        beam_id: b.beam_id,
        kind: b.kind,
        title: b.title,
        tags_json: JSON.stringify(b.tags),
        body: bodyToStore,
        status: "TOMBSTONED",
        pinned: 0,
        updated_at_ms: b.updated_at_ms,
      };

      await this._put(tx, "beams", row);
      await this._put(tx, "tombstones", {
        beam_id,
        tombstoned_at_ms: nowMs(),
        reason_code: meta.reason_code,
        approval_ref_json: meta.approval_ref ? JSON.stringify(meta.approval_ref) : null,
      } as any);
      await this._event(tx, "TOMBSTONE", b, meta.reason_code);
    });
  }

  async purge(beam_id: string, meta: { reason_code: string; approval_ref: ApprovalRef }): Promise<void> {
    await this._tx(["beams", "events"], "readwrite", async (tx) => {
      await this._del(tx, "beams", beam_id);
      await this._event(tx, "PURGE", { beam_id } as any, meta.reason_code);
    });
  }

  async get(beam_id: string): Promise<Beam | null> {
    assert(this.db, "idb not open");
    const tx = this.db.transaction("beams", "readonly");
    const store = tx.objectStore("beams");
    const v = await reqToPromise<BeamRow | undefined>(store.get(beam_id));
    await txDone(tx);
    return v ? await this._rowToBeamAsync(v) : null;
  }

  async query(q: BeamQuery): Promise<Beam[]> {
    const all = await this._getAll<BeamRow>("beams");
    let beams = await Promise.all(all.map(row => this._rowToBeamAsync(row)));

    // Filter by status
    if (!q.include_dead) {
      beams = beams.filter(b => b.status !== "TOMBSTONED");
    }

    // Filter by kinds
    if (q.kinds && q.kinds.length > 0) {
      const kindSet = new Set(q.kinds);
      beams = beams.filter(b => kindSet.has(b.kind));
    }

    // Filter by tags
    if (q.tags && q.tags.length > 0) {
      const tagSet = new Set(q.tags.map(t => t.toLowerCase()));
      beams = beams.filter(b => {
        const bTags = new Set(b.tags.map(t => t.toLowerCase()));
        return Array.from(tagSet).every(t => bTags.has(t));
      });
    }

    // Filter by text
    if (q.text) {
      const searchText = q.text.toLowerCase();
      beams = beams.filter(b =>
        (b.title + "\n" + b.body).toLowerCase().includes(searchText)
      );
    }

    return beams.slice(0, q.limit ?? 50);
  }

  async compact(policy: { keep_event_days?: number; marker_only_after_days?: number }): Promise<void> {
    const keepDays = policy.keep_event_days ?? 90;
    const markerDays = policy.marker_only_after_days ?? 30;
    const eventCutoffMs = nowMs() - (keepDays * 24 * 60 * 60 * 1000);
    const markerCutoffMs = nowMs() - (markerDays * 24 * 60 * 60 * 1000);

    // 1. Prune old events
    await this._tx(["events"], "readwrite", async (tx) => {
      const store = tx.objectStore("events");
      const allKeys = await reqToPromise<IDBValidKey[]>(store.getAllKeys() as any);

      for (const key of allKeys) {
        const event = await reqToPromise<any>(store.get(key));
        if (event && event.ts_ms < eventCutoffMs) {
          await reqToPromise(store.delete(key));
        }
      }
    });

    // 2. Marker-only compaction for old tombstones
    await this._tx(["beams", "tombstones"], "readwrite", async (tx) => {
      const beamsStore = tx.objectStore("beams");
      const tombstonesStore = tx.objectStore("tombstones");

      const tombstoneKeys = await reqToPromise<IDBValidKey[]>(tombstonesStore.getAllKeys() as any);
      let compacted = 0;

      for (const key of tombstoneKeys) {
        const tombstone = await reqToPromise<any>(tombstonesStore.get(key));
        if (tombstone && tombstone.tombstoned_at_ms <= markerCutoffMs) {
          const beam = await reqToPromise<BeamRow | undefined>(beamsStore.get(tombstone.beam_id));
          if (beam && beam.status === "TOMBSTONED" && beam.body.length > 50) {
            beam.body = "[TOMBSTONED_MARKER]";
            await reqToPromise(beamsStore.put(beam));
            compacted++;
          }
        }
      }

      if (compacted > 0) {
        console.log(`[COMPACTION] Reduced ${compacted} old tombstoned beam bodies to markers.`);
      }
    });
  }

  async stats(): Promise<BeamStoreStats> {
    const all = await this._getAll<BeamRow>("beams");

    let active = 0;
    let retired = 0;
    let tombstoned = 0;
    let pinned_active = 0;

    for (const row of all) {
      if (row.status === 'ACTIVE') {
        active++;
        if (row.pinned === 1) pinned_active++;
      } else if (row.status === 'RETIRED') {
        retired++;
      } else if (row.status === 'TOMBSTONED') {
        tombstoned++;
      }
    }

    return { active, retired, tombstoned, pinned_active };
  }

  /* ---------- IDB internals ---------- */

  private async _openDb(name: string, version: number): Promise<IDBDatabase> {
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, version);

      req.onupgradeneeded = () => {
        const db = req.result;

        // beams store
        if (!db.objectStoreNames.contains("beams")) {
          const s = db.createObjectStore("beams", { keyPath: "beam_id" });
          s.createIndex("status", "status", { unique: false });
          s.createIndex("pinned", "pinned", { unique: false });
          s.createIndex("kind", "kind", { unique: false });
          // Compound index would require array-based keyPath, but not all browsers support it well
          // For now, filter in-memory after using status index
        }

        // tombstones store
        if (!db.objectStoreNames.contains("tombstones")) {
          db.createObjectStore("tombstones", { keyPath: "beam_id" });
        }

        // meta store
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }

        // events store
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { autoIncrement: true });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async _tx<T>(
    stores: IDBStores[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => Promise<T>
  ): Promise<T> {
    assert(this.db, "idb not open");
    const tx = this.db.transaction(stores, mode);
    const p = fn(tx);
    await Promise.all([p, txDone(tx)]);
    return await p;
  }

  private async _put(tx: IDBTransaction, storeName: IDBStores, value: any): Promise<void> {
    const store = tx.objectStore(storeName);
    await reqToPromise(store.put(value));
  }

  private async _del(tx: IDBTransaction, storeName: IDBStores, key: any): Promise<void> {
    const store = tx.objectStore(storeName);
    await reqToPromise(store.delete(key));
  }

  private async _getAll<T>(storeName: IDBStores): Promise<T[]> {
    assert(this.db, "idb not open");
    const tx = this.db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const all = await reqToPromise<T[]>(store.getAll() as any);
    await txDone(tx);
    return all;
  }

  private async _event(tx: IDBTransaction, op: string, beam: Partial<Beam>, reason_code?: string): Promise<void> {
    const store = tx.objectStore("events");
    await reqToPromise(
      store.add({
        ts_ms: nowMs(),
        op,
        beam_id: beam.beam_id ?? null,
        kind: (beam as any).kind ?? null,
        reason_code: reason_code ?? null,
      })
    );
  }

  private async _rowToBeamAsync(row: BeamRow): Promise<Beam> {
    const body = this.encryptionKey
      ? await this._decryptBodyBrowser(row.body, this.encryptionKey)
      : row.body;

    return {
      beam_id: row.beam_id,
      kind: row.kind as BeamKind,
      title: row.title,
      tags: JSON.parse(row.tags_json),
      body,
      status: row.status as BeamStatus,
      pinned: row.pinned === 1,
      updated_at_ms: row.updated_at_ms,
    };
  }

  private async _deriveKeyBrowser(passphrase: string): Promise<CryptoKey> {
    const enc = new TextEncoder().encode(passphrase);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const salt = new TextEncoder().encode("mathison-beamstore-salt-v1");

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  private async _encryptBodyBrowser(plaintext: string, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc
    );

    // Prepend IV to ciphertext
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);

    return bufferToHex(result);
  }

  private async _decryptBodyBrowser(ciphertext: string, key: CryptoKey): Promise<string> {
    const buffer = new Uint8Array(ciphertext.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    const iv = buffer.slice(0, 12);
    const encrypted = buffer.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  }
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* =========================
 * 9) Driver factory
 * ========================= */

export function createBeamStore(opts: { sqlite?: SQLiteDriverConfig; idb?: IndexedDBDriverConfig }): BeamStore {
  if (isNode) {
    assert(opts.sqlite?.filename, "sqlite filename required for node BeamStore");
    return new SQLiteBeamStore(opts.sqlite);
  }
  if (isBrowser) {
    return new IndexedDBBeamStore(opts.idb ?? { dbName: "mathison_beamstore", version: 1 });
  }
  throw new Error("No supported environment for BeamStore");
}

/* =========================
 * 10) Intent application helper (CDI + BeamStore)
 * ========================= */

export async function applyIntentGoverned(params: {
  store: BeamStore;
  cdi: CDIStub;
  intent: StoreBeamIntent;
}): Promise<{ ok: true } | { ok: false; reason_code: string; human_message?: string }> {
  const { store, cdi } = params;
  const intent = params.intent;

  const current = await store.get(intent.beam.beam_id);

  const decision = await cdi.evaluate(intent, current);
  if (!decision.allow) return { ok: false, reason_code: decision.reason_code, human_message: decision.human_message };

  const i = decision.transformed_intent;

  switch (i.op) {
    case "PUT": {
      const merged: Beam = {
        beam_id: i.beam.beam_id,
        kind: (i.beam.kind ?? current?.kind ?? "NOTE") as BeamKind,
        title: i.beam.title ?? current?.title ?? "",
        tags: i.beam.tags ?? current?.tags ?? [],
        body: i.beam.body ?? current?.body ?? "",
        status: (i.beam.status ?? current?.status ?? "ACTIVE") as BeamStatus,
        pinned: i.beam.pinned ?? current?.pinned ?? false,
        updated_at_ms: nowMs(),
      };
      assert(merged.status !== "TOMBSTONED", "PUT cannot directly set TOMBSTONED");
      await store.put(merged, { reason_code: i.reason_code });
      return { ok: true };
    }
    case "RETIRE":
      await store.retire(i.beam.beam_id, { reason_code: i.reason_code });
      return { ok: true };
    case "PIN":
      await store.pin(i.beam.beam_id);
      return { ok: true };
    case "UNPIN":
      await store.unpin(i.beam.beam_id);
      return { ok: true };
    case "TOMBSTONE":
      await store.tombstone(i.beam.beam_id, {
        reason_code: i.reason_code ?? "UNSPECIFIED",
        approval_ref: i.approval_ref,
      });
      return { ok: true };
    case "PURGE":
      assert(i.approval_ref, "PURGE requires approval_ref");
      await store.purge(i.beam.beam_id, { reason_code: i.reason_code ?? "UNSPECIFIED", approval_ref: i.approval_ref });
      return { ok: true };
    default:
      return { ok: false, reason_code: "UNKNOWN_OP" };
  }
}
