/**
 * P2-B Rotation Tests (FILE Backend)
 *
 * Tests that file rotation works correctly:
 * - rotation happens at configured size
 * - readByJob spans rotated files
 * - latest() returns correct receipt
 * - append-only: earlier files not modified
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileReceiptStore } from '../file-store';

describe('FILE Backend Rotation', () => {
  const testDir = path.join(__dirname, '../../../.test-rotation');
  let receiptStore: FileReceiptStore;
  let eventLogPath: string;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    eventLogPath = path.join(testDir, 'eventlog');

    // Configure tiny max size to force rotation (1KB)
    receiptStore = new FileReceiptStore({
      eventLogPath,
      maxLogSizeBytes: 1024 // 1KB - forces rotation quickly
    });

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

  it('should rotate to new file when size limit reached', async () => {
    const jobId = 'rotation-test-001';

    // Append enough receipts to force rotation (each receipt ~200 bytes)
    for (let i = 0; i < 10; i++) {
      await receiptStore.append({
        job_id: jobId,
        stage: `STAGE_${i}`,
        action: 'TEST_ACTION',
        timestamp: Date.now(),
        notes: 'A'.repeat(100), // Pad to make larger
        policy_id: 'test-policy',
        inputs_hash: 'hash-' + i,
        outputs_hash: 'hash-' + i
      });
    }

    // Check that multiple segment files exist
    const files = await fs.readdir(testDir);
    const segmentFiles = files.filter(f => f.startsWith('eventlog-') && f.endsWith('.jsonl'));

    expect(segmentFiles.length).toBeGreaterThan(1);
  });

  it('should read all receipts across rotated files', async () => {
    const jobId = 'rotation-test-002';

    // Append many receipts to force multiple rotations
    const receiptCount = 20;
    for (let i = 0; i < receiptCount; i++) {
      await receiptStore.append({
        job_id: jobId,
        stage: `STAGE_${i}`,
        action: 'TEST_ACTION',
        timestamp: Date.now(),
        notes: 'B'.repeat(100)
      });
    }

    // Query should return all receipts across all segments
    const receipts = await receiptStore.queryByJobId(jobId);

    expect(receipts.length).toBe(receiptCount);

    // Verify order is preserved
    for (let i = 0; i < receiptCount; i++) {
      expect(receipts[i].stage).toBe(`STAGE_${i}`);
    }
  });

  it('should return correct latest receipt after rotation', async () => {
    const jobId = 'rotation-test-003';

    // Append receipts to force rotation
    for (let i = 0; i < 15; i++) {
      await receiptStore.append({
        job_id: jobId,
        stage: `STAGE_${i}`,
        action: i === 14 ? 'FINAL_ACTION' : 'TEST_ACTION',
        timestamp: Date.now(),
        notes: 'C'.repeat(100)
      });
    }

    // latest() should return the most recent receipt
    const latest = await receiptStore.latest(jobId);

    expect(latest).not.toBeNull();
    expect(latest!.stage).toBe('STAGE_14');
    expect(latest!.action).toBe('FINAL_ACTION');
  });

  it('should not modify earlier rotated files (append-only)', async () => {
    const jobId = 'rotation-test-004';

    // Append receipts to create first segment
    for (let i = 0; i < 8; i++) {
      await receiptStore.append({
        job_id: jobId,
        stage: `STAGE_${i}`,
        action: 'TEST_ACTION',
        timestamp: Date.now(),
        notes: 'D'.repeat(100)
      });
    }

    // Get the first segment file stats
    const files1 = await fs.readdir(testDir);
    const firstSegment = files1.find(f => f === 'eventlog-0001.jsonl');
    expect(firstSegment).toBeDefined();

    const firstSegmentPath = path.join(testDir, firstSegment!);
    const statsBefore = await fs.stat(firstSegmentPath);

    // Append more receipts to rotate to second segment
    for (let i = 8; i < 16; i++) {
      await receiptStore.append({
        job_id: jobId,
        stage: `STAGE_${i}`,
        action: 'TEST_ACTION',
        timestamp: Date.now(),
        notes: 'E'.repeat(100)
      });
    }

    // First segment should not be modified (append-only)
    const statsAfter = await fs.stat(firstSegmentPath);

    expect(statsAfter.mtime.getTime()).toBe(statsBefore.mtime.getTime());
    expect(statsAfter.size).toBe(statsBefore.size);
  });

  it('should handle queries across multiple rotated segments', async () => {
    const job1 = 'rotation-test-005-a';
    const job2 = 'rotation-test-005-b';

    // Interleave receipts from two jobs across rotations
    for (let i = 0; i < 12; i++) {
      await receiptStore.append({
        job_id: i % 2 === 0 ? job1 : job2,
        stage: `STAGE_${i}`,
        action: 'TEST_ACTION',
        timestamp: Date.now(),
        notes: 'F'.repeat(100)
      });
    }

    // Query should correctly filter by job_id across segments
    const receipts1 = await receiptStore.queryByJobId(job1);
    const receipts2 = await receiptStore.queryByJobId(job2);

    expect(receipts1.length).toBe(6);
    expect(receipts2.length).toBe(6);

    // Verify all receipts belong to correct job
    expect(receipts1.every(r => r.job_id === job1)).toBe(true);
    expect(receipts2.every(r => r.job_id === job2)).toBe(true);
  });

  it('should handle empty job query across rotated files', async () => {
    const jobId = 'rotation-test-006';

    // Create rotation with unrelated receipts
    for (let i = 0; i < 15; i++) {
      await receiptStore.append({
        job_id: 'other-job',
        stage: `STAGE_${i}`,
        action: 'TEST_ACTION',
        timestamp: Date.now(),
        notes: 'G'.repeat(100)
      });
    }

    // Query for non-existent job should return empty array
    const receipts = await receiptStore.queryByJobId(jobId);

    expect(receipts).toEqual([]);
  });
});
