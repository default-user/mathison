/**
 * Mid-Stage Crash and Resume Tests
 * Verifies job can resume after crash without duplicating work
 *
 * SPEC REQUIREMENT (Architecture v0.2 - P1):
 * - Crash+resume must be idempotent (same inputs → same outputs)
 * - No duplicate outputs on resume
 * - Resume from last completed stage, not mid-stage
 */

import { TiritiAuditJob } from '../tiriti_audit_job';
import CheckpointEngine, { JobStatus } from 'mathison-checkpoint';
import EventLog from 'mathison-receipts';
import * as fs from 'fs';
import * as path from 'path';

describe('Mid-Stage Crash and Resume', () => {
  const testCheckpointDir = '.mathison-test-crash/checkpoints';
  const testEventLogPath = '.mathison-test-crash/eventlog.jsonl';
  const testOutputDir = '.mathison-test-crash/output';
  const testInputPath = '.mathison-test-crash/test-treaty.md';

  let checkpointEngine: CheckpointEngine;
  let eventLog: EventLog;

  beforeEach(async () => {
    // Clean test directories
    if (fs.existsSync('.mathison-test-crash')) {
      fs.rmSync('.mathison-test-crash', { recursive: true, force: true });
    }
    fs.mkdirSync(testCheckpointDir, { recursive: true });
    fs.mkdirSync(testOutputDir, { recursive: true });

    // Create test input file
    const testContent = `# Tiriti o te Kai

version: "1.0"

## 1) People First; Tools Serve

AI systems serve human agency.

## 2) Consent and Stop Always Win

Consent and stop always win.
`;
    fs.writeFileSync(testInputPath, testContent);

    // Initialize engines
    checkpointEngine = new CheckpointEngine(testCheckpointDir);
    eventLog = new EventLog(testEventLogPath);
    await checkpointEngine.initialize();
    await eventLog.initialize();
  });

  afterEach(async () => {
    // Clean up test directories
    if (fs.existsSync('.mathison-test-crash')) {
      fs.rmSync('.mathison-test-crash', { recursive: true, force: true });
    }
  });

  describe('Crash Recovery', () => {
    it('should resume from last completed stage after mid-stage crash', async () => {
      const jobId = 'crash-test-1';

      // First run: complete LOAD, crash during NORMALIZE
      const job1 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);

      let normalizeCallCount = 0;
      const originalNormalize = (job1 as any).stageNormalize.bind(job1);
      (job1 as any).stageNormalize = async (checkpoint: any) => {
        normalizeCallCount++;
        if (normalizeCallCount === 1) {
          // Crash mid-stage (before returning)
          throw new Error('Simulated crash during NORMALIZE');
        }
        return originalNormalize(checkpoint);
      };

      const inputs = {
        inputPath: testInputPath,
        outputDir: testOutputDir
      };

      // First run should fail
      await expect(job1.run(inputs)).rejects.toThrow(/Simulated crash/);

      // Verify checkpoint exists with RESUMABLE_FAILURE
      let checkpoint = await checkpointEngine.loadCheckpoint(jobId);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.status).toBe(JobStatus.RESUMABLE_FAILURE);
      expect(checkpoint!.completed_stages).toContain('LOAD');
      expect(checkpoint!.completed_stages).not.toContain('NORMALIZE');

      // Second run: should resume from NORMALIZE (not LOAD)
      const job2 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);
      (job2 as any).stageNormalize = originalNormalize; // Remove crash

      // This will fail at GOVERNANCE_CHECK (policy missing), but proves resume works
      await expect(job2.run(inputs)).rejects.toThrow();

      // Verify LOAD was NOT re-executed (check event log)
      const events = await eventLog.readByJob(jobId);
      const resumeEvents = events.filter((e: any) => e.action === 'RESUME');
      expect(resumeEvents.length).toBeGreaterThan(0);

      // Count STAGE_START events - LOAD should only have 1 (from first run)
      const loadStarts = events.filter((e: any) =>
        e.stage === 'LOAD' && e.action === 'STAGE_START'
      );
      expect(loadStarts.length).toBe(1); // Only ran once

      // NORMALIZE should have 2 STAGE_START events (crash + resume)
      const normalizeStarts = events.filter((e: any) =>
        e.stage === 'NORMALIZE' && e.action === 'STAGE_START'
      );
      expect(normalizeStarts.length).toBe(2); // Ran twice (crash + success)

      // Verify final checkpoint has both stages completed
      checkpoint = await checkpointEngine.loadCheckpoint(jobId);
      expect(checkpoint!.completed_stages).toContain('LOAD');
      expect(checkpoint!.completed_stages).toContain('NORMALIZE');
    });

    it('should not duplicate outputs on resume', async () => {
      const jobId = 'no-duplicate-test';

      // Create a mock policy file so we can get to RENDER stage
      const policyPath = path.join(testOutputDir, 'test-policy.json');
      fs.writeFileSync(policyPath, JSON.stringify({
        version: '1.0',
        invariants: []
      }));

      const mockValidator = {
        loadPolicy: async () => {},
        validate: async () => ({
          decision: 'ALLOW',
          passed: [],
          failed: [],
          policy_id: 'test-policy',
          reasons: []
        })
      };

      // First run: complete LOAD, NORMALIZE, GOVERNANCE_CHECK, crash during RENDER
      const job1 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);
      (job1 as any).validator = mockValidator;

      const originalRender = (job1 as any).stageRender.bind(job1);
      (job1 as any).stageRender = async (checkpoint: any, inputs: any) => {
        // Partially write one file, then crash
        const partialPath = path.join(inputs.outputDir, 'partial-output.txt');
        fs.writeFileSync(partialPath, 'Partial output before crash');
        throw new Error('Simulated crash during RENDER');
      };

      const inputs = {
        inputPath: testInputPath,
        outputDir: testOutputDir,
        policyPath
      };

      // First run should fail
      await expect(job1.run(inputs)).rejects.toThrow(/Simulated crash/);

      // Verify partial output exists
      const partialPath = path.join(testOutputDir, 'partial-output.txt');
      expect(fs.existsSync(partialPath)).toBe(true);

      // Record checkpoint state
      const checkpointBefore = await checkpointEngine.loadCheckpoint(jobId);
      expect(checkpointBefore!.completed_stages).toContain('GOVERNANCE_CHECK');
      expect(checkpointBefore!.completed_stages).not.toContain('RENDER');

      // Second run: should resume from RENDER
      const job2 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);
      (job2 as any).validator = mockValidator;

      // Should complete successfully
      await job2.run(inputs);

      // Verify output files were created
      const publicPath = path.join(testOutputDir, 'tiriti.public.md');
      const compactPath = path.join(testOutputDir, 'tiriti.compact.md');
      const digestPath = path.join(testOutputDir, 'tiriti.digest.json');

      expect(fs.existsSync(publicPath)).toBe(true);
      expect(fs.existsSync(compactPath)).toBe(true);
      expect(fs.existsSync(digestPath)).toBe(true);

      // Verify RENDER stage completed exactly once (on resume)
      const events = await eventLog.readByJob(jobId);
      const renderCompletes = events.filter((e: any) =>
        e.stage === 'RENDER' && e.action === 'STAGE_COMPLETE'
      );
      expect(renderCompletes.length).toBe(1); // Only completed once (on resume)

      // Verify idempotency is maintained
      const checkpointAfter = await checkpointEngine.loadCheckpoint(jobId);
      expect(checkpointAfter!.status).toBe(JobStatus.COMPLETED);
    });

    it('should preserve stage outputs across resume', async () => {
      const jobId = 'preserve-outputs-test';

      // First run: complete LOAD, crash during NORMALIZE
      const job1 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);

      const originalNormalize = (job1 as any).stageNormalize.bind(job1);
      (job1 as any).stageNormalize = async () => {
        throw new Error('Simulated crash');
      };

      const inputs = {
        inputPath: testInputPath,
        outputDir: testOutputDir
      };

      await expect(job1.run(inputs)).rejects.toThrow(/Simulated crash/);

      // Verify LOAD outputs are saved
      const checkpoint1 = await checkpointEngine.loadCheckpoint(jobId);
      expect(checkpoint1!.stage_outputs.LOAD).toBeDefined();
      const loadOutputs = checkpoint1!.stage_outputs.LOAD as any;
      expect(loadOutputs.rawContent).toBeDefined();
      expect(loadOutputs.contentHash).toBeDefined();

      // Second run: complete NORMALIZE
      const job2 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);
      (job2 as any).stageNormalize = originalNormalize; // Remove crash

      await expect(job2.run(inputs)).rejects.toThrow(); // Will fail at GOVERNANCE_CHECK

      // Verify both LOAD and NORMALIZE outputs are preserved
      const checkpoint2 = await checkpointEngine.loadCheckpoint(jobId);
      expect(checkpoint2!.stage_outputs.LOAD).toEqual(loadOutputs);
      expect(checkpoint2!.stage_outputs.NORMALIZE).toBeDefined();
      const normalizeOutputs = checkpoint2!.stage_outputs.NORMALIZE as any;
      expect(normalizeOutputs.normalizedContent).toBeDefined();
    });
  });

  describe('Idempotency on Resume', () => {
    it('should produce same output hashes on resume as initial run', async () => {
      const jobId1 = 'idempotent-full';
      const jobId2 = 'idempotent-resume';

      // Mock policy for both runs
      const policyPath = path.join(testOutputDir, 'test-policy.json');
      fs.writeFileSync(policyPath, JSON.stringify({
        version: '1.0',
        invariants: []
      }));

      const mockValidator = {
        loadPolicy: async () => {},
        validate: async () => ({
          decision: 'ALLOW',
          passed: [],
          failed: [],
          policy_id: 'test-policy',
          reasons: []
        })
      };

      const inputs = {
        inputPath: testInputPath,
        outputDir: testOutputDir,
        policyPath
      };

      // Full run without crash
      const job1 = new TiritiAuditJob(jobId1, checkpointEngine, eventLog);
      (job1 as any).validator = mockValidator;

      // Should complete successfully
      await job1.run(inputs);

      const checkpoint1 = await checkpointEngine.loadCheckpoint(jobId1);
      const renderOutputs1 = checkpoint1!.stage_outputs.RENDER as any;

      // Clean outputs for second run
      fs.rmSync(testOutputDir, { recursive: true, force: true });
      fs.mkdirSync(testOutputDir, { recursive: true });
      fs.writeFileSync(policyPath, JSON.stringify({ version: '1.0', invariants: [] }));

      // Run with crash and resume
      const job2 = new TiritiAuditJob(jobId2, checkpointEngine, eventLog);
      (job2 as any).validator = mockValidator;

      let renderCalled = false;
      const originalRender = (job2 as any).stageRender.bind(job2);
      (job2 as any).stageRender = async (checkpoint: any, inputs: any) => {
        if (!renderCalled) {
          renderCalled = true;
          throw new Error('Crash before render');
        }
        return originalRender(checkpoint, inputs);
      };

      // First attempt: crash
      await expect(job2.run(inputs)).rejects.toThrow(/Crash before render/);

      // Resume
      const job3 = new TiritiAuditJob(jobId2, checkpointEngine, eventLog);
      (job3 as any).validator = mockValidator;
      (job3 as any).stageRender = originalRender;

      await job3.run(inputs); // Should complete successfully

      const checkpoint2 = await checkpointEngine.loadCheckpoint(jobId2);
      const renderOutputs2 = checkpoint2!.stage_outputs.RENDER as any;

      // Compare output hashes - should be identical
      expect(renderOutputs2.publicHash).toBe(renderOutputs1.publicHash);
      expect(renderOutputs2.compactHash).toBe(renderOutputs1.compactHash);
      expect(renderOutputs2.digestHash).toBe(renderOutputs1.digestHash);
    });
  });

  describe('Stage Skipping on Resume', () => {
    it('should skip completed stages when resuming', async () => {
      const jobId = 'skip-completed-test';

      // First run: complete LOAD and NORMALIZE
      const job1 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);

      const originalGovernance = (job1 as any).stageGovernanceCheck.bind(job1);
      (job1 as any).stageGovernanceCheck = async () => {
        throw new Error('Crash at governance');
      };

      const inputs = {
        inputPath: testInputPath,
        outputDir: testOutputDir
      };

      await expect(job1.run(inputs)).rejects.toThrow(/Crash at governance/);

      // Verify LOAD and NORMALIZE completed
      const checkpoint1 = await checkpointEngine.loadCheckpoint(jobId);
      expect(checkpoint1!.completed_stages).toEqual(['LOAD', 'NORMALIZE']);

      // Track which stages run on resume
      const stagesRun: string[] = [];

      const job2 = new TiritiAuditJob(jobId, checkpointEngine, eventLog);

      // Intercept all stage methods
      const originalLoad = (job2 as any).stageLoad.bind(job2);
      const originalNormalize = (job2 as any).stageNormalize.bind(job2);

      (job2 as any).stageLoad = async (inputs: any) => {
        stagesRun.push('LOAD');
        return originalLoad(inputs);
      };

      (job2 as any).stageNormalize = async (checkpoint: any) => {
        stagesRun.push('NORMALIZE');
        return originalNormalize(checkpoint);
      };

      (job2 as any).stageGovernanceCheck = async (checkpoint: any, inputs: any) => {
        stagesRun.push('GOVERNANCE_CHECK');
        return originalGovernance(checkpoint, inputs);
      };

      // Resume (will still fail at governance)
      await expect(job2.run(inputs)).rejects.toThrow();

      // Verify LOAD and NORMALIZE were NOT re-run, only GOVERNANCE_CHECK
      expect(stagesRun).toEqual(['GOVERNANCE_CHECK']);
    });
  });
});
