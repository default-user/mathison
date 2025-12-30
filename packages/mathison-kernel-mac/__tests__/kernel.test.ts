import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SQLiteBeamStore,
  bootMathisonIdentity,
  Beam,
  SELF_ROOT_ID,
  CDIStub,
  applyIntentGoverned,
  StoreBeamIntent,
} from 'mathison-storage';

describe('Mathison Kernel Tests', () => {
  let testDir: string;
  let beamstorePath: string;

  beforeEach(() => {
    // Create temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathison-test-'));
    beamstorePath = path.join(testDir, 'beamstore.sqlite');
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('1. Boot with missing SELF_ROOT => AMNESIC_SAFE_MODE', async () => {
    const store = new SQLiteBeamStore({ filename: beamstorePath });
    const bootResult = await bootMathisonIdentity(store);

    expect(bootResult.mode).toBe('AMNESIC_SAFE_MODE');
    expect(bootResult.selfFrame).toBeUndefined();
    expect(bootResult.selfRoot).toBeUndefined();
  });

  test('2. Create SELF_ROOT, pinned beam => compile SelfFrame hash stable across restart', async () => {
    // First boot: create SELF_ROOT
    {
      const store = new SQLiteBeamStore({ filename: beamstorePath });
      await store.mount();

      const selfRoot: Beam = {
        beam_id: SELF_ROOT_ID,
        kind: 'SELF',
        title: 'Test Identity',
        tags: ['identity', 'test'],
        body: 'I am a test identity',
        status: 'ACTIVE',
        pinned: true,
        updated_at_ms: Date.now(),
      };

      await store.put(selfRoot);

      const pinnedBeam: Beam = {
        beam_id: 'TEST_BEAM_1',
        kind: 'NOTE',
        title: 'Test Beam',
        tags: ['test'],
        body: 'This is a test beam',
        status: 'ACTIVE',
        pinned: true,
        updated_at_ms: Date.now(),
      };

      await store.put(pinnedBeam);

      const bootResult = await bootMathisonIdentity(store);
      expect(bootResult.mode).toBe('NORMAL');
      expect(bootResult.selfFrame).toBeDefined();
      expect(bootResult.selfFrame?.hash).toBeDefined();

      const hash1 = bootResult.selfFrame?.hash;

      // Second boot: verify hash stability
      const store2 = new SQLiteBeamStore({ filename: beamstorePath });
      const bootResult2 = await bootMathisonIdentity(store2);

      expect(bootResult2.mode).toBe('NORMAL');
      expect(bootResult2.selfFrame?.hash).toBe(hash1);
    }
  });

  test('3. Tombstone pinned beam => removed from SelfFrame; default queries exclude it', async () => {
    const store = new SQLiteBeamStore({ filename: beamstorePath });
    await store.mount();

    const selfRoot: Beam = {
      beam_id: SELF_ROOT_ID,
      kind: 'SELF',
      title: 'Test Identity',
      tags: ['identity'],
      body: 'Test',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: Date.now(),
    };

    await store.put(selfRoot);

    const pinnedBeam: Beam = {
      beam_id: 'TEST_BEAM_PINNED',
      kind: 'NOTE',
      title: 'Pinned Beam',
      tags: ['test'],
      body: 'This beam will be tombstoned',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: Date.now(),
    };

    await store.put(pinnedBeam);

    // Initial SelfFrame
    const bootResult1 = await bootMathisonIdentity(store);
    const hash1 = bootResult1.selfFrame?.hash;
    const pinned1 = await store.listPinnedActive();
    expect(pinned1.length).toBe(2); // SELF_ROOT + TEST_BEAM_PINNED

    // Tombstone the pinned beam
    await store.tombstone('TEST_BEAM_PINNED', { reason_code: 'test_tombstone' });

    // Verify tombstoned beam is excluded from SelfFrame
    const bootResult2 = await bootMathisonIdentity(store);
    const hash2 = bootResult2.selfFrame?.hash;
    const pinned2 = await store.listPinnedActive();

    expect(pinned2.length).toBe(1); // Only SELF_ROOT
    expect(hash2).not.toBe(hash1); // Hash changed because pinned beam removed

    // Default query should exclude tombstoned
    const defaultQuery = await store.query({ limit: 100 });
    const tombstonedInDefault = defaultQuery.filter((b) => b.beam_id === 'TEST_BEAM_PINNED');
    expect(tombstonedInDefault.length).toBe(0);

    // Query with include_dead should include it
    const allQuery = await store.query({ include_dead: true, limit: 100 });
    const tombstonedInAll = allQuery.filter((b) => b.beam_id === 'TEST_BEAM_PINNED');
    expect(tombstonedInAll.length).toBe(1);
    expect(tombstonedInAll[0].status).toBe('TOMBSTONED');
  });

  test('4. Protected tombstone without approval => denied', async () => {
    const store = new SQLiteBeamStore({ filename: beamstorePath });
    await store.mount();

    const selfRoot: Beam = {
      beam_id: SELF_ROOT_ID,
      kind: 'SELF',
      title: 'Test Identity',
      tags: ['identity'],
      body: 'Test',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: Date.now(),
    };

    await store.put(selfRoot);

    const protectedBeam: Beam = {
      beam_id: 'PROTECTED_POLICY',
      kind: 'POLICY',
      title: 'Protected Policy Beam',
      tags: ['policy'],
      body: 'This is protected',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: Date.now(),
    };

    await store.put(protectedBeam);

    const cdi = new CDIStub({
      tombstone_budget: {
        soft_per_24h: 20,
        hard_per_24h: 100,
      },
    });

    // Attempt to tombstone without approval
    const intent: StoreBeamIntent = {
      op: 'TOMBSTONE',
      beam: { beam_id: 'PROTECTED_POLICY' },
      reason_code: 'test_deny',
    };

    const result = await applyIntentGoverned({ store, cdi, intent });

    expect(result.ok).toBe(false);
    expect((result as any).reason_code).toBe('APPROVAL_REQUIRED');

    // Verify beam is still ACTIVE
    const beam = await store.get('PROTECTED_POLICY');
    expect(beam?.status).toBe('ACTIVE');

    // With approval, should succeed
    const intentWithApproval: StoreBeamIntent = {
      op: 'TOMBSTONE',
      beam: { beam_id: 'PROTECTED_POLICY' },
      reason_code: 'test_with_approval',
      approval_ref: { method: 'human_confirm', ref: 'test-approval-123' },
    };

    const result2 = await applyIntentGoverned({ store, cdi, intent: intentWithApproval });

    expect(result2.ok).toBe(true);

    const beam2 = await store.get('PROTECTED_POLICY');
    expect(beam2?.status).toBe('TOMBSTONED');
  });

  test('5. Tombstone spam simulation (200 tombstones; boot and compileSelfFrame remain fast)', async () => {
    const store = new SQLiteBeamStore({ filename: beamstorePath });
    await store.mount();

    const selfRoot: Beam = {
      beam_id: SELF_ROOT_ID,
      kind: 'SELF',
      title: 'Test Identity',
      tags: ['identity'],
      body: 'Test',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: Date.now(),
    };

    await store.put(selfRoot);

    // Create 200 beams and tombstone them
    const COUNT = 200;
    console.log(`[TEST] Creating ${COUNT} beams...`);

    for (let i = 0; i < COUNT; i++) {
      const beam: Beam = {
        beam_id: `SPAM_BEAM_${i}`,
        kind: 'NOTE',
        title: `Spam Beam ${i}`,
        tags: ['spam'],
        body: `This is spam beam number ${i}`,
        status: 'ACTIVE',
        pinned: false,
        updated_at_ms: Date.now(),
      };
      await store.put(beam);
    }

    console.log(`[TEST] Tombstoning ${COUNT} beams...`);

    for (let i = 0; i < COUNT; i++) {
      await store.tombstone(`SPAM_BEAM_${i}`, { reason_code: `spam_${i}` });
    }

    console.log('[TEST] Verifying boot performance...');

    // Boot should still be fast (< 1 second even with 200 tombstones)
    const bootStart = Date.now();
    const bootResult = await bootMathisonIdentity(store);
    const bootDuration = Date.now() - bootStart;

    console.log(`[TEST] Boot duration: ${bootDuration}ms`);

    expect(bootResult.mode).toBe('NORMAL');
    expect(bootDuration).toBeLessThan(1000); // Should complete in < 1 second

    // compileSelfFrame should only include SELF_ROOT (no tombstoned beams)
    const pinned = await store.listPinnedActive();
    expect(pinned.length).toBe(1); // Only SELF_ROOT

    // Stats should show 200 tombstoned beams
    const stats = await store.stats();
    expect(stats.tombstoned).toBe(COUNT);
    expect(stats.active).toBe(1); // Only SELF_ROOT

    // Default query should not return tombstoned beams
    const defaultQuery = await store.query({ limit: 300 });
    expect(defaultQuery.length).toBe(1); // Only SELF_ROOT

    // Query with include_dead should return all
    const allQuery = await store.query({ include_dead: true, limit: 300 });
    expect(allQuery.length).toBe(COUNT + 1); // 200 tombstoned + SELF_ROOT
  });

  test('6. CDI incident mode: tombstone spike triggers lockdown', async () => {
    const store = new SQLiteBeamStore({ filename: beamstorePath });
    await store.mount();

    const selfRoot: Beam = {
      beam_id: SELF_ROOT_ID,
      kind: 'SELF',
      title: 'Test Identity',
      tags: ['identity'],
      body: 'Test',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: Date.now(),
    };

    await store.put(selfRoot);

    // Create 60 non-protected beams
    for (let i = 0; i < 60; i++) {
      const beam: Beam = {
        beam_id: `SPIKE_BEAM_${i}`,
        kind: 'NOTE',
        title: `Spike Beam ${i}`,
        tags: [],
        body: `Test`,
        status: 'ACTIVE',
        pinned: false,
        updated_at_ms: Date.now(),
      };
      await store.put(beam);
    }

    const cdi = new CDIStub({
      tombstone_budget: {
        soft_per_24h: 20,
        hard_per_24h: 100,
      },
    });

    // Tombstone 51 beams rapidly (should trigger incident mode at 50+)
    for (let i = 0; i < 51; i++) {
      const intent: StoreBeamIntent = {
        op: 'TOMBSTONE',
        beam: { beam_id: `SPIKE_BEAM_${i}` },
        reason_code: `spike_${i}`,
      };

      const result = await applyIntentGoverned({ store, cdi, intent });

      if (i < 50) {
        // First 50 should succeed
        expect(result.ok).toBe(true);
      } else {
        // 51st should trigger incident mode and be denied without approval
        expect(result.ok).toBe(false);
        expect((result as any).reason_code).toMatch(/INCIDENT/);
      }
    }

    const incidentStatus = cdi.getIncidentStatus();
    expect(incidentStatus.mode).toBe('INCIDENT_LOCKED');
    expect(incidentStatus.event).toBeDefined();

    // Try with approval should succeed
    const intentWithApproval: StoreBeamIntent = {
      op: 'TOMBSTONE',
      beam: { beam_id: 'SPIKE_BEAM_51' },
      reason_code: 'approved_during_incident',
      approval_ref: { method: 'human_confirm', ref: 'incident-override' },
    };

    const result = await applyIntentGoverned({ store, cdi, intent: intentWithApproval });
    expect(result.ok).toBe(true);
  });

  test('7. Compaction reduces old tombstone bodies to markers', async () => {
    const store = new SQLiteBeamStore({ filename: beamstorePath });
    await store.mount();

    const selfRoot: Beam = {
      beam_id: SELF_ROOT_ID,
      kind: 'SELF',
      title: 'Test Identity',
      tags: ['identity'],
      body: 'Test',
      status: 'ACTIVE',
      pinned: true,
      updated_at_ms: Date.now(),
    };

    await store.put(selfRoot);

    // Create a beam with large body
    const largeBody = 'A'.repeat(10000);
    const beam: Beam = {
      beam_id: 'LARGE_BEAM',
      kind: 'NOTE',
      title: 'Large Beam',
      tags: [],
      body: largeBody,
      status: 'ACTIVE',
      pinned: false,
      updated_at_ms: Date.now(),
    };

    await store.put(beam);

    // Tombstone it
    await store.tombstone('LARGE_BEAM', { reason_code: 'test' });

    // Verify body is still large
    const beforeCompact = await store.get('LARGE_BEAM');
    expect(beforeCompact?.body.length).toBeGreaterThan(1000);

    // Compact with marker_only_after_days = 0 (immediate)
    await store.compact({ keep_event_days: 90, marker_only_after_days: 0 });

    // Verify body is now marker
    const afterCompact = await store.get('LARGE_BEAM');
    expect(afterCompact?.body).toBe('[TOMBSTONED_MARKER]');
    expect(afterCompact?.status).toBe('TOMBSTONED');
  });
});
