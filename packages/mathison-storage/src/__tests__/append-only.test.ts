/**
 * P2-B.5 Append-Only Enforcement (SQLITE Backend)
 *
 * Tests that receipts table is truly append-only:
 * - DB triggers prevent UPDATE
 * - DB triggers prevent DELETE
 * - INSERT is allowed (append operation)
 * - Hash chain verification passes
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SQLiteReceiptStore } from '../sqlite-store';
import Database from 'better-sqlite3';

describe('SQLITE Append-Only Enforcement', () => {
  const testDir = path.join(__dirname, '../../../.test-append-only');
  const dbPath = path.join(testDir, 'append-only-test.db');
  let receiptStore: SQLiteReceiptStore;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    receiptStore = new SQLiteReceiptStore({ dbPath });
    await receiptStore.initialize();
  });

  afterEach(async () => {
    await receiptStore.shutdown();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should allow INSERT operations (append)', async () => {
    const jobId = 'append-test-001';

    await expect(
      receiptStore.append({
        job_id: jobId,
        stage: 'TEST',
        action: 'INSERT_TEST',
        timestamp: Date.now(),
        verdict: 'allow'
      })
    ).resolves.not.toThrow();

    const receipts = await receiptStore.queryByJobId(jobId);
    expect(receipts.length).toBe(1);
  });

  it('should prevent UPDATE operations via trigger', async () => {
    const jobId = 'append-test-002';

    // First, append a receipt
    await receiptStore.append({
      job_id: jobId,
      stage: 'TEST',
      action: 'ORIGINAL',
      timestamp: Date.now(),
      verdict: 'allow'
    });

    // Try to UPDATE directly via raw SQL (should fail)
    const db = new Database(dbPath);

    expect(() => {
      db.prepare('UPDATE receipts SET action = ? WHERE job_id = ?')
        .run('MODIFIED', jobId);
    }).toThrow(/Receipts are append-only: UPDATE not allowed/);

    db.close();

    // Verify original receipt unchanged
    const receipts = await receiptStore.queryByJobId(jobId);
    expect(receipts[0].action).toBe('ORIGINAL');
  });

  it('should prevent DELETE operations via trigger', async () => {
    const jobId = 'append-test-003';

    // First, append a receipt
    await receiptStore.append({
      job_id: jobId,
      stage: 'TEST',
      action: 'DELETE_TEST',
      timestamp: Date.now(),
      verdict: 'allow'
    });

    // Try to DELETE directly via raw SQL (should fail)
    const db = new Database(dbPath);

    expect(() => {
      db.prepare('DELETE FROM receipts WHERE job_id = ?')
        .run(jobId);
    }).toThrow(/Receipts are append-only: DELETE not allowed/);

    db.close();

    // Verify receipt still exists
    const receipts = await receiptStore.queryByJobId(jobId);
    expect(receipts.length).toBe(1);
  });

  it('should prevent UPDATE even on non-content fields', async () => {
    const jobId = 'append-test-004';

    // Append a receipt
    await receiptStore.append({
      job_id: jobId,
      stage: 'TEST',
      action: 'METADATA_TEST',
      timestamp: Date.now(),
      notes: 'original notes',
      verdict: 'allow'
    });

    // Try to update just the notes field (should still fail)
    const db = new Database(dbPath);

    expect(() => {
      db.prepare('UPDATE receipts SET notes = ? WHERE job_id = ?')
        .run('modified notes', jobId);
    }).toThrow(/Receipts are append-only: UPDATE not allowed/);

    db.close();

    // Verify notes unchanged
    const receipts = await receiptStore.queryByJobId(jobId);
    expect(receipts[0].notes).toBe('original notes');
  });

  it('should allow multiple appends (append-only nature)', async () => {
    const jobId = 'append-test-005';

    // Append multiple receipts for same job
    await receiptStore.append({
      job_id: jobId,
      stage: 'STAGE_1',
      action: 'APPEND_1',
      timestamp: Date.now()
    });

    await receiptStore.append({
      job_id: jobId,
      stage: 'STAGE_2',
      action: 'APPEND_2',
      timestamp: Date.now()
    });

    await receiptStore.append({
      job_id: jobId,
      stage: 'STAGE_3',
      action: 'APPEND_3',
      timestamp: Date.now()
    });

    const receipts = await receiptStore.queryByJobId(jobId);

    expect(receipts.length).toBe(3);
    expect(receipts[0].stage).toBe('STAGE_1');
    expect(receipts[1].stage).toBe('STAGE_2');
    expect(receipts[2].stage).toBe('STAGE_3');
  });

  it('should maintain hash chain integrity (append-only proof)', async () => {
    const jobId = 'append-test-006';

    // Append several receipts
    for (let i = 0; i < 5; i++) {
      await receiptStore.append({
        job_id: jobId,
        stage: `STAGE_${i}`,
        action: `ACTION_${i}`,
        timestamp: Date.now(),
        verdict: 'allow'
      });
    }

    // Verify chain integrity (hash chaining proves no modification)
    const integrity = await receiptStore.verifyChainIntegrity();

    expect(integrity.valid).toBe(true);
    expect(integrity.brokenAt).toBeUndefined();
  });

  it('should detect tampering if triggers were bypassed', async () => {
    const jobId = 'append-test-007';

    // Append a receipt
    await receiptStore.append({
      job_id: jobId,
      stage: 'TEST',
      action: 'TAMPER_TEST',
      timestamp: Date.now(),
      verdict: 'allow'
    });

    // Temporarily disable triggers and modify (simulates external tampering)
    const db = new Database(dbPath);

    db.exec('DROP TRIGGER IF EXISTS prevent_receipt_update');

    db.prepare('UPDATE receipts SET action = ? WHERE job_id = ?')
      .run('TAMPERED', jobId);

    db.close();

    // Re-init store (will recreate triggers for future protection)
    await receiptStore.shutdown();
    receiptStore = new SQLiteReceiptStore({ dbPath });
    await receiptStore.initialize();

    // Hash chain verification should detect tampering
    const integrity = await receiptStore.verifyChainIntegrity();

    expect(integrity.valid).toBe(false);
    expect(integrity.brokenAt).toBeDefined();
  });

  it('should enforce append-only across restarts', async () => {
    const jobId = 'append-test-008';

    // First session: append receipt
    await receiptStore.append({
      job_id: jobId,
      stage: 'TEST',
      action: 'RESTART_TEST',
      timestamp: Date.now()
    });

    await receiptStore.shutdown();

    // Second session: re-init and verify triggers still active
    receiptStore = new SQLiteReceiptStore({ dbPath });
    await receiptStore.initialize();

    const db = new Database(dbPath);

    // Triggers should still prevent UPDATE
    expect(() => {
      db.prepare('UPDATE receipts SET action = ? WHERE job_id = ?')
        .run('MODIFIED', jobId);
    }).toThrow(/Receipts are append-only: UPDATE not allowed/);

    db.close();
  });
});
