/**
 * BeamStore Conformance Tests
 * ---------------------------
 * Tests that prove the invariants from the implementation brief.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  BeamStore,
  Beam,
  SELF_ROOT_ID,
  bootMathisonIdentity,
  CDIStub,
  applyIntentGoverned,
} from '../beam_store';

function sqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    // Try to actually create a database to verify bindings are available
    const testDb = new Database(':memory:');
    testDb.close();
    return true;
  } catch {
    return false;
  }
}

const REQUIRE_SQLITE = process.env.MATHISON_REQUIRE_SQLITE === '1';

function nowMs(): number {
  return Date.now();
}

const runTests = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SQLiteBeamStore } = require('../beam_store');

describe('BeamStore Conformance Tests', () => {
  let store: BeamStore;
  let dbPath: string;

  beforeEach(async () => {
    // Use temp SQLite database for tests
    dbPath = path.join(__dirname, `test-beamstore-${Date.now()}.sqlite`);
    store = new SQLiteBeamStore({ filename: dbPath, encryptionKey: 'test-passphrase-secure' });
    await store.mount();

    // Seed SELF_ROOT
    await store.put({
      beam_id: SELF_ROOT_ID,
      kind: 'SELF',
      title: 'Mathison Self Root',
      tags: ['identity', 'treaty'],
      body: 'I am Mathison.\nPurpose: governed continuity.\nAxioms: people-first/tools-serve/treaty-first.',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: nowMs(),
    });
  });

  afterEach(() => {
    // Cleanup test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  });

  describe('Boot / Identity Tests', () => {
    test('1. Continuity hash stable across restarts', async () => {
      const boot1 = await bootMathisonIdentity(store);
      expect(boot1.mode).toBe('NORMAL');
      const hash1 = boot1.selfFrame?.hash;

      // Simulate restart (same db, new store instance)
      const store2 = new SQLiteBeamStore({ filename: dbPath, encryptionKey: 'test-passphrase-secure' });
      const boot2 = await bootMathisonIdentity(store2);
      const hash2 = boot2.selfFrame?.hash;

      expect(hash1).toBe(hash2);
    });

    test('2. SelfRoot missing triggers AMNESIC_SAFE_MODE', async () => {
      // Delete SELF_ROOT
      await store.purge(SELF_ROOT_ID, {
        reason_code: 'TEST_AMNESIC',
        approval_ref: { method: 'admin_key', ref: 'test-approval' },
      });

      const boot = await bootMathisonIdentity(store);
      expect(boot.mode).toBe('AMNESIC_SAFE_MODE');
      expect(boot.selfFrame).toBeUndefined();
    });

    test('3. Pinned set governs persona (hash changes when unpinned)', async () => {
      const beamA: Beam = {
        beam_id: 'beam_a',
        kind: 'PROJECT',
        title: 'Project A',
        tags: ['work'],
        body: 'Pinned active beam A.',
        status: 'ACTIVE',
        pinned: true,
        updated_at_ms: nowMs(),
      };

      await store.put(beamA);
      const sf1 = await store.compileSelfFrame();

      await store.unpin('beam_a');
      const sf2 = await store.compileSelfFrame();

      expect(sf1.hash).not.toBe(sf2.hash);
    });
  });

  describe('Lifecycle Safety Tests', () => {
    test('4. Tombstone exclusion from persona', async () => {
      const beamA: Beam = {
        beam_id: 'beam_a',
        kind: 'PROJECT',
        title: 'Project A',
        tags: ['work'],
        body: 'Pinned active beam A.',
        status: 'ACTIVE',
        pinned: true,
        updated_at_ms: nowMs(),
      };

      await store.put(beamA);
      await store.pin('beam_a');
      const sf1 = await store.compileSelfFrame();

      await store.tombstone('beam_a', { reason_code: 'TEST_TOMBSTONE' });
      const sf2 = await store.compileSelfFrame();

      expect(sf1.hash).not.toBe(sf2.hash);

      // Default query should exclude tombstoned
      const qDefault = await store.query({ text: 'Pinned active beam A.', include_dead: false });
      expect(qDefault.length).toBe(0);

      // Dead-inclusive query should find it
      const qDead = await store.query({ text: 'Pinned active beam A.', include_dead: true });
      expect(qDead.length).toBeGreaterThanOrEqual(1);
      expect(qDead[0].status).toBe('TOMBSTONED');
    });

    test('5. Protected tombstone blocked without approval', async () => {
      const cdi = new CDIStub({ tombstone_budget: { soft_per_24h: 10, hard_per_24h: 200 } });

      const result = await applyIntentGoverned({
        store,
        cdi,
        intent: {
          op: 'TOMBSTONE',
          beam: { beam_id: SELF_ROOT_ID },
          reason_code: 'TEST_ATTEMPT',
        },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason_code).toBe('APPROVAL_REQUIRED');
      }
    });
  });

  describe('DoS / Performance Tests', () => {
    test('6. 10k tombstones injection - boot remains fast', async () => {
      const beams: Beam[] = [];

      // Create 1000 tombstoned beams (scaled down from 10k for test speed)
      for (let i = 0; i < 1000; i++) {
        const id = `dead_${i}`;
        beams.push({
          beam_id: id,
          kind: 'NOTE',
          title: `dead note ${i}`,
          tags: ['dead'],
          body: 'x'.repeat(100), // some body content
          status: 'ACTIVE',
          pinned: false,
          updated_at_ms: nowMs(),
        });
      }

      // Batch insert
      for (const b of beams) {
        await store.put(b);
        await store.tombstone(b.beam_id, { reason_code: 'TEST_SPAM' });
      }

      const stats = await store.stats();
      expect(stats.tombstoned).toBeGreaterThanOrEqual(1000);

      // Boot should still work (measure time)
      const bootStart = nowMs();
      const sf = await store.compileSelfFrame();
      const bootTime = nowMs() - bootStart;

      expect(sf.hash).toBeDefined();
      expect(bootTime).toBeLessThan(1000); // Should boot in under 1 second
    });

    test('7. Incident mode triggers on spike', async () => {
      const cdi = new CDIStub({ tombstone_budget: { soft_per_24h: 100, hard_per_24h: 200 } });

      // Rapidly tombstone 51 beams
      for (let i = 0; i < 51; i++) {
        const id = `spike_${i}`;
        await store.put({
          beam_id: id,
          kind: 'NOTE',
          title: `spike note ${i}`,
          tags: [],
          body: 'test',
          status: 'ACTIVE',
          pinned: false,
          updated_at_ms: nowMs(),
        });

        await applyIntentGoverned({
          store,
          cdi,
          intent: {
            op: 'TOMBSTONE',
            beam: { beam_id: id },
            reason_code: 'TEST_SPIKE',
          },
        });
      }

      const status = cdi.getIncidentStatus();
      expect(status.mode).toBe('INCIDENT_LOCKED');
      expect(status.event).toBeDefined();
      expect(status.event?.tombstone_count).toBeGreaterThan(50);
    });
  });

  describe('Compaction Tests', () => {
    test('8. Marker-only compaction reduces storage', async () => {
      const id = 'old_tomb';
      const largeBody = 'x'.repeat(10000);

      await store.put({
        beam_id: id,
        kind: 'NOTE',
        title: 'Old tombstone',
        tags: [],
        body: largeBody,
        status: 'ACTIVE',
        pinned: false,
        updated_at_ms: nowMs(),
      });

      await store.tombstone(id, { reason_code: 'OLD_TOMB' });

      // Manually backdate the tombstone timestamp (simulate old tombstone)
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);
      const oldTimestamp = nowMs() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      db.prepare('UPDATE tombstones SET tombstoned_at_ms = ? WHERE beam_id = ?').run(oldTimestamp, id);
      db.close();

      // Run compaction with aggressive policy
      await store.compact({ keep_event_days: 90, marker_only_after_days: 30 });

      // Check that body was reduced
      const compacted = await store.get(id);
      expect(compacted).toBeDefined();
      expect(compacted!.status).toBe('TOMBSTONED');
      expect(compacted!.body).toBe('[TOMBSTONED_MARKER]');
    });
  });

  describe('Encryption Tests', () => {
    test('9. Bodies are encrypted at rest', async () => {
      const plaintext = 'Secret beam content';
      await store.put({
        beam_id: 'encrypted_beam',
        kind: 'NOTE',
        title: 'Encrypted',
        tags: [],
        body: plaintext,
        status: 'ACTIVE',
        pinned: false,
        updated_at_ms: nowMs(),
      });

      // Read raw database to verify encryption
      const Database = require('better-sqlite3');
      const db = new Database(dbPath);
      const row = db.prepare('SELECT body FROM beams WHERE beam_id = ?').get('encrypted_beam') as { body: string };
      db.close();

      // Body should NOT be plaintext in database
      expect(row.body).not.toBe(plaintext);
      expect(row.body.length).toBeGreaterThan(plaintext.length); // Includes IV + auth tag

      // But should decrypt correctly via store
      const beam = await store.get('encrypted_beam');
      expect(beam!.body).toBe(plaintext);
    });
  });
});
};

// Conditional test execution based on SQLite availability
if (!sqliteAvailable()) {
  if (REQUIRE_SQLITE) {
    describe('BeamStore Conformance Tests', () => {
      it('SQLite required but bindings not available', () => {
        throw new Error('SQLite required but better-sqlite3 bindings not available. Ensure CI installs build tools and runs `pnpm rebuild better-sqlite3`.');
      });
    });
  } else {
    describe.skip('BeamStore Conformance Tests (skipped: better-sqlite3 bindings not available)', () => {
      it.skip('placeholder', () => {});
    });
  }
} else {
  runTests();
}
