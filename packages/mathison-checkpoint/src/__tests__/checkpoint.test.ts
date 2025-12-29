/**
 * Tests for CheckpointEngine
 * Unit test: resume continues after simulated crash
 */

import CheckpointEngine, { JobStatus } from '../index';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('CheckpointEngine - Resume', () => {
  let engine: CheckpointEngine;
  const testCheckpointDir = path.join(__dirname, '.test-checkpoints');

  beforeEach(async () => {
    engine = new CheckpointEngine(testCheckpointDir);
    await engine.initialize();
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testCheckpointDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  test('should create checkpoint and resume from last completed stage', async () => {
    const jobId = 'test-job-001';
    const inputs = { inputPath: 'test.md', outputDir: 'dist' };

    // Simulate job execution
    const checkpoint = await engine.createCheckpoint(jobId, 'test_job', inputs);
    expect(checkpoint.status).toBe(JobStatus.PENDING);
    expect(checkpoint.completed_stages).toHaveLength(0);

    // Complete stage 1
    await engine.updateStage(jobId, 'STAGE_1', { data: 'stage1_output' }, true);

    // Complete stage 2
    await engine.updateStage(jobId, 'STAGE_2', { data: 'stage2_output' }, true);

    // Simulate crash during stage 3
    await engine.updateStage(jobId, 'STAGE_3', {}, false);
    await engine.markResumableFailure(jobId, 'Simulated crash during STAGE_3');

    // Verify checkpoint state
    const loadedCheckpoint = await engine.loadCheckpoint(jobId);
    expect(loadedCheckpoint).not.toBeNull();
    expect(loadedCheckpoint!.status).toBe(JobStatus.RESUMABLE_FAILURE);
    expect(loadedCheckpoint!.current_stage).toBe('STAGE_3');
    expect(loadedCheckpoint!.completed_stages).toEqual(['STAGE_1', 'STAGE_2']);

    // Resume: complete stage 3
    await engine.updateStage(jobId, 'STAGE_3', { data: 'stage3_output' }, true);

    // Complete stage 4
    await engine.updateStage(jobId, 'STAGE_4', { data: 'stage4_output' }, true);

    // Mark as completed
    await engine.markCompleted(jobId);

    // Verify final state
    const finalCheckpoint = await engine.loadCheckpoint(jobId);
    expect(finalCheckpoint!.status).toBe(JobStatus.COMPLETED);
    expect(finalCheckpoint!.completed_stages).toEqual(['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4']);
  });

  test('should support idempotent writes with hash checking', async () => {
    const testFile = path.join(testCheckpointDir, 'test-output.txt');
    const content = 'Test content for hash verification';

    // Write file
    await fs.writeFile(testFile, content, 'utf-8');

    // Calculate hash
    const hash = engine.hashContent(content);

    // Verify hash matches
    const matches = await engine.checkFileHash(testFile, hash);
    expect(matches).toBe(true);

    // Verify hash doesn't match different content
    const wrongHash = engine.hashContent('Different content');
    const wrongMatch = await engine.checkFileHash(testFile, wrongHash);
    expect(wrongMatch).toBe(false);
  });

  test('should list all checkpoints sorted by update time', async () => {
    // Create multiple jobs
    await engine.createCheckpoint('job-1', 'type-a', { test: 1 });
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay

    await engine.createCheckpoint('job-2', 'type-b', { test: 2 });
    await new Promise(resolve => setTimeout(resolve, 10));

    await engine.createCheckpoint('job-3', 'type-a', { test: 3 });

    // Update job-1 to make it most recent
    await engine.updateStage('job-1', 'STAGE_1', {}, true);

    const checkpoints = await engine.listCheckpoints();
    expect(checkpoints).toHaveLength(3);

    // Should be sorted by updated_at descending (most recent first)
    expect(checkpoints[0].job_id).toBe('job-1');
  });

  test('should fail gracefully when loading non-existent checkpoint', async () => {
    const checkpoint = await engine.loadCheckpoint('non-existent-job');
    expect(checkpoint).toBeNull();
  });
});
