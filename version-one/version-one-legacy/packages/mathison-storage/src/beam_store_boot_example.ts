/**
 * BeamStore Boot Integration Example
 * -----------------------------------
 * Shows how to wire BeamStore into Mathison's boot sequence.
 *
 * CRITICAL: BeamStore must mount + verify BEFORE:
 * - CDI/CIF initialization
 * - UI/API server startup
 * - Model calls
 * - Tool access
 *
 * This ensures identity continuity is the first-class substrate.
 */

import {
  BeamStore,
  createBeamStore,
  bootMathisonIdentity,
  CDIStub,
  applyIntentGoverned,
  SELF_ROOT_ID,
  BootMode,
} from './beam_store';

/**
 * Example: Node/Server boot sequence
 */
export async function bootMathisonServer() {
  console.log('[BOOT] Starting Mathison Server...');

  // PHASE 1: BeamStore (identity substrate)
  console.log('[BOOT] Phase 1: Mounting BeamStore...');
  const store = createBeamStore({
    sqlite: {
      filename: process.env.MATHISON_BEAMSTORE_PATH || './data/mathison_beams.sqlite',
      encryptionKey: process.env.MATHISON_BEAMSTORE_KEY || undefined,
    },
  });

  const bootResult = await bootMathisonIdentity(store);

  if (bootResult.mode === 'AMNESIC_SAFE_MODE') {
    console.error('[BOOT] CRITICAL: SELF_ROOT missing. System in AMNESIC_SAFE_MODE.');
    console.error('[BOOT] Cannot continue without identity. Initialize SELF_ROOT first.');
    process.exit(1);
  }

  console.log(`[BOOT] Identity loaded: SelfFrame hash = ${bootResult.selfFrame?.hash}`);
  console.log(`[BOOT] Pinned beams: ${(await store.listPinnedActive()).length}`);

  // PHASE 2: CDI (governance layer)
  console.log('[BOOT] Phase 2: Initializing CDI...');
  const cdi = new CDIStub({
    tombstone_budget: {
      soft_per_24h: parseInt(process.env.MATHISON_CDI_TOMBSTONE_SOFT || '10', 10),
      hard_per_24h: parseInt(process.env.MATHISON_CDI_TOMBSTONE_HARD || '200', 10),
    },
  });

  // PHASE 3: CIF, API, UI, Tools (can now proceed safely)
  console.log('[BOOT] Phase 3: Starting API/UI/Tools...');
  // ... wire into actual Mathison server initialization here

  console.log('[BOOT] ✓ Mathison Server ready.');

  return { store, cdi, bootResult };
}

/**
 * Example: Browser boot sequence (for quadratic.html or similar)
 */
export async function bootMathisonBrowser() {
  console.log('[BOOT] Starting Mathison Browser Client...');

  // PHASE 1: BeamStore (IndexedDB)
  console.log('[BOOT] Phase 1: Mounting BeamStore (IndexedDB)...');
  const store = createBeamStore({
    idb: {
      dbName: 'mathison_beamstore',
      version: 1,
      encryptionKey: undefined, // Browser: key from user auth or device key
    },
  });

  const bootResult = await bootMathisonIdentity(store);

  if (bootResult.mode === 'AMNESIC_SAFE_MODE') {
    console.warn('[BOOT] SELF_ROOT missing. Initializing new identity...');
    // In browser, might initialize wizard/onboarding
    await initializeSelfRoot(store);
    // Retry boot
    const retryBoot = await bootMathisonIdentity(store);
    if (retryBoot.mode === 'AMNESIC_SAFE_MODE') {
      throw new Error('Failed to initialize identity');
    }
  }

  console.log(`[BOOT] Identity loaded: SelfFrame hash = ${bootResult.selfFrame?.hash}`);

  // PHASE 2: CDI
  const cdi = new CDIStub({
    tombstone_budget: { soft_per_24h: 10, hard_per_24h: 100 },
  });

  // PHASE 3: UI/Inference/Mesh
  console.log('[BOOT] Phase 3: Starting UI...');
  // ... wire into browser UI initialization

  console.log('[BOOT] ✓ Mathison Browser ready.');

  return { store, cdi, bootResult };
}

/**
 * Helper: Initialize SELF_ROOT for new identity
 */
async function initializeSelfRoot(store: BeamStore): Promise<void> {
  await store.put({
    beam_id: SELF_ROOT_ID,
    kind: 'SELF',
    title: 'Mathison Self Root',
    tags: ['identity', 'treaty', 'core'],
    body: `I am Mathison.

Purpose: Governed continuity, people-first AI, treaty-first collaboration.

Core Axioms:
- People first: Human autonomy and consent are non-negotiable.
- Tools serve: AI systems are tools that serve human goals, not autonomous actors.
- Treaty first: Relationships are governed by explicit agreements (treaties).
- Bounded scope: I operate within clearly defined boundaries.
- Transparent limits: I communicate my capabilities and constraints honestly.

This SELF_ROOT is the foundational beam of my identity. It is protected and requires explicit human approval to modify or tombstone.
`,
    status: 'ACTIVE',
    pinned: true,
    updated_at_ms: Date.now(),
  });

  console.log('[BOOT] SELF_ROOT initialized.');
}

/**
 * Example: CLI tool to inspect BeamStore state
 */
export async function inspectBeamStore(dbPath: string) {
  const store = createBeamStore({ sqlite: { filename: dbPath } });
  await store.mount();
  await store.verify();

  const stats = await store.stats();
  const selfFrame = await store.compileSelfFrame();
  const incidentStatus = new CDIStub({ tombstone_budget: { soft_per_24h: 10, hard_per_24h: 200 } }).getIncidentStatus();

  console.log('\n=== BeamStore Inspection ===');
  console.log(`Database: ${dbPath}`);
  console.log(`\nStats:`);
  console.log(`  Active: ${stats.active}`);
  console.log(`  Retired: ${stats.retired}`);
  console.log(`  Tombstoned: ${stats.tombstoned}`);
  console.log(`  Pinned Active: ${stats.pinned_active}`);
  console.log(`\nSelfFrame:`);
  console.log(`  Hash: ${selfFrame.hash}`);
  console.log(`  Length: ${selfFrame.selfFrame.length} chars`);
  console.log(`\nIncident Mode: ${incidentStatus.mode}`);
  if (incidentStatus.event) {
    console.log(`  Event: ${incidentStatus.event.reason}`);
    console.log(`  Count: ${incidentStatus.event.tombstone_count} / ${incidentStatus.event.threshold}`);
  }
  console.log('\n===========================\n');
}

// Example CLI invocation (uncomment to use)
// if (require.main === module) {
//   const dbPath = process.argv[2] || './data/mathison_beams.sqlite';
//   inspectBeamStore(dbPath).catch(console.error);
// }
