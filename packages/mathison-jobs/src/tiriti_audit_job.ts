/**
 * Tiriti Audit Job
 * Stages: LOAD → NORMALIZE → GOVERNANCE_CHECK → RENDER → VERIFY → DONE
 * Checkpoints after each stage for resumability
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import CheckpointEngine, { JobStatus } from 'mathison-checkpoint';
import EventLog from 'mathison-receipts';
import GovernanceValidator from './governance_validator';

export interface TiritiAuditInputs {
  inputPath: string;
  outputDir: string;
  policyPath?: string;
  stageTimeout?: number; // milliseconds, default: 300000 (5min)
}

export interface StageResult {
  success: boolean;
  error?: string;
  outputs?: Record<string, unknown>;
}

export class TiritiAuditJob {
  private checkpointEngine: CheckpointEngine;
  private eventLog: EventLog;
  private validator: GovernanceValidator;
  private jobId: string;
  private stageTimeout: number;

  constructor(jobId: string, checkpointEngine: CheckpointEngine, eventLog: EventLog) {
    this.jobId = jobId;
    this.checkpointEngine = checkpointEngine;
    this.eventLog = eventLog;
    this.validator = new GovernanceValidator();
    this.stageTimeout = 300000; // 5min default
  }

  /**
   * Execute a stage with timeout protection
   * On timeout: checkpoint current state → RESUMABLE_FAILURE
   */
  private async executeWithTimeout<T>(
    stageName: string,
    stageFunc: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        const error = `Stage ${stageName} timed out after ${timeout}ms`;
        console.error(`⏱️  ${error}`);

        try {
          // Checkpoint current state before failing
          await this.checkpointEngine.markResumableFailure(this.jobId, error);
          await this.eventLog.append({
            job_id: this.jobId,
            stage: stageName,
            action: 'STAGE_TIMEOUT',
            notes: error
          });
        } catch (checkpointError) {
          console.error('Failed to checkpoint on timeout:', checkpointError);
        }

        reject(new Error(error));
      }, timeout);

      stageFunc()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
    });
  }

  /**
   * Run the job from start or resume from checkpoint
   */
  async run(inputs: TiritiAuditInputs): Promise<void> {
    await this.checkpointEngine.initialize();
    await this.eventLog.initialize();

    // Configure stage timeout from inputs
    this.stageTimeout = inputs.stageTimeout || this.stageTimeout;

    // Load or create checkpoint
    let checkpoint = await this.checkpointEngine.loadCheckpoint(this.jobId);

    if (checkpoint) {
      console.log(`📋 Resuming job ${this.jobId} from stage: ${checkpoint.current_stage}`);
      await this.eventLog.append({
        job_id: this.jobId,
        stage: checkpoint.current_stage,
        action: 'RESUME',
        notes: `Resuming from checkpoint`
      });
    } else {
      console.log(`🆕 Starting new job ${this.jobId}`);
      checkpoint = await this.checkpointEngine.createCheckpoint(this.jobId, 'tiriti_audit', inputs as unknown as Record<string, unknown>);
      await this.eventLog.append({
        job_id: this.jobId,
        stage: 'INIT',
        action: 'JOB_START',
        notes: `Starting tiriti audit job`
      });
    }

    try {
      // Execute stages in order, skipping completed ones
      const stages = ['LOAD', 'NORMALIZE', 'GOVERNANCE_CHECK', 'RENDER', 'VERIFY', 'DONE'];

      for (const stage of stages) {
        if (checkpoint.completed_stages.includes(stage)) {
          console.log(`✓ Stage ${stage} already completed, skipping`);
          continue;
        }

        console.log(`\n▶ Running stage: ${stage}`);
        await this.eventLog.logStageStart(this.jobId, stage);

        let result: StageResult;

        // Execute stage with timeout protection
        result = await this.executeWithTimeout(
          stage,
          async () => {
            switch (stage) {
              case 'LOAD':
                return await this.stageLoad(inputs);
              case 'NORMALIZE':
                return await this.stageNormalize(checkpoint);
              case 'GOVERNANCE_CHECK':
                return await this.stageGovernanceCheck(checkpoint, inputs);
              case 'RENDER':
                return await this.stageRender(checkpoint, inputs);
              case 'VERIFY':
                return await this.stageVerify(checkpoint, inputs);
              case 'DONE':
                return await this.stageDone();
              default:
                throw new Error(`Unknown stage: ${stage}`);
            }
          },
          this.stageTimeout
        );

        if (!result.success) {
          throw new Error(result.error || `Stage ${stage} failed`);
        }

        // Update checkpoint
        await this.checkpointEngine.updateStage(this.jobId, stage, result.outputs || {}, true);
        await this.eventLog.logStageComplete(this.jobId, stage);

        // Reload checkpoint to get updated stage_outputs
        checkpoint = await this.checkpointEngine.loadCheckpoint(this.jobId);
        if (!checkpoint) {
          throw new Error('Failed to reload checkpoint');
        }

        console.log(`✓ Stage ${stage} completed`);
      }

      // Mark job as completed
      await this.checkpointEngine.markCompleted(this.jobId);
      await this.eventLog.append({
        job_id: this.jobId,
        stage: 'DONE',
        action: 'JOB_COMPLETE',
        notes: 'Job completed successfully'
      });

      console.log(`\n✅ Job ${this.jobId} completed successfully`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Job failed: ${errorMessage}`);

      await this.checkpointEngine.markResumableFailure(this.jobId, errorMessage);
      const currentCheckpoint = await this.checkpointEngine.loadCheckpoint(this.jobId);
      await this.eventLog.logError(this.jobId, currentCheckpoint?.current_stage || 'UNKNOWN', errorMessage);

      throw error;
    }
  }

  /**
   * STAGE: LOAD - Read the input treaty document
   */
  private async stageLoad(inputs: TiritiAuditInputs): Promise<StageResult> {
    try {
      const content = await fs.readFile(inputs.inputPath, 'utf-8');
      const contentHash = this.checkpointEngine.hashContent(content);

      await this.eventLog.append({
        job_id: this.jobId,
        stage: 'LOAD',
        action: 'READ_FILE',
        inputs_hash: contentHash,
        notes: `Loaded ${inputs.inputPath} (${content.length} bytes)`
      });

      return {
        success: true,
        outputs: {
          rawContent: content,
          contentHash,
          fileSize: content.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load ${inputs.inputPath}: ${error}`
      };
    }
  }

  /**
   * STAGE: NORMALIZE - Canonicalize whitespace and formatting
   */
  private async stageNormalize(checkpoint: any): Promise<StageResult> {
    try {
      const rawContent = checkpoint.stage_outputs.LOAD?.rawContent as string;
      if (!rawContent) {
        return { success: false, error: 'No content from LOAD stage' };
      }

      // Normalize whitespace (no semantic edits)
      let normalized = rawContent;

      // Normalize line endings to \n
      normalized = normalized.replace(/\r\n/g, '\n');

      // Trim trailing whitespace from lines
      normalized = normalized.split('\n').map(line => line.trimEnd()).join('\n');

      // Ensure single newline at EOF
      normalized = normalized.trimEnd() + '\n';

      // Remove multiple consecutive blank lines (keep max 2)
      normalized = normalized.replace(/\n{4,}/g, '\n\n\n');

      const normalizedHash = this.checkpointEngine.hashContent(normalized);

      return {
        success: true,
        outputs: {
          normalizedContent: normalized,
          normalizedHash
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Normalization failed: ${error}`
      };
    }
  }

  /**
   * STAGE: GOVERNANCE_CHECK - Validate against invariants
   */
  private async stageGovernanceCheck(checkpoint: any, inputs: TiritiAuditInputs): Promise<StageResult> {
    try {
      const normalizedContent = checkpoint.stage_outputs.NORMALIZE?.normalizedContent as string;
      if (!normalizedContent) {
        return { success: false, error: 'No content from NORMALIZE stage' };
      }

      // Load policy
      const policyPath = inputs.policyPath || 'policies/tiriti_invariants.v1.json';
      await this.validator.loadPolicy(policyPath);

      // Validate
      const validationResult = await this.validator.validate(normalizedContent);

      // Log governance decision
      await this.eventLog.logGovernanceDecision(
        this.jobId,
        'GOVERNANCE_CHECK',
        validationResult.decision,
        validationResult.policy_id,
        validationResult.reasons.join('; ')
      );

      // Fail-closed: DENY means job fails
      if (validationResult.decision === 'DENY') {
        return {
          success: false,
          error: `Governance validation failed:\n${validationResult.reasons.join('\n')}`
        };
      }

      return {
        success: true,
        outputs: {
          validationResult,
          passed: validationResult.passed,
          failed: validationResult.failed
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Governance check failed: ${error}`
      };
    }
  }

  /**
   * STAGE: RENDER - Generate output files
   */
  private async stageRender(checkpoint: any, inputs: TiritiAuditInputs): Promise<StageResult> {
    try {
      const normalizedContent = checkpoint.stage_outputs.NORMALIZE?.normalizedContent as string;
      if (!normalizedContent) {
        return { success: false, error: 'No content from NORMALIZE stage' };
      }

      // Create output directory
      await fs.mkdir(inputs.outputDir, { recursive: true });

      const outputs: Record<string, string> = {};

      // 1. Public version (Substack-ready) - full document
      const publicPath = path.join(inputs.outputDir, 'tiriti.public.md');
      const publicContent = this.renderPublicVersion(normalizedContent);
      outputs.publicPath = publicPath;
      outputs.publicHash = this.checkpointEngine.hashContent(publicContent);

      // Check idempotency
      if (await this.checkpointEngine.checkFileHash(publicPath, outputs.publicHash)) {
        console.log(`  ↻ ${publicPath} already up-to-date`);
      } else {
        await fs.writeFile(publicPath, publicContent, 'utf-8');
        console.log(`  ✓ Wrote ${publicPath}`);
      }

      // 2. Compact version (tight but readable)
      const compactPath = path.join(inputs.outputDir, 'tiriti.compact.md');
      const compactContent = this.renderCompactVersion(normalizedContent);
      outputs.compactPath = compactPath;
      outputs.compactHash = this.checkpointEngine.hashContent(compactContent);

      if (await this.checkpointEngine.checkFileHash(compactPath, outputs.compactHash)) {
        console.log(`  ↻ ${compactPath} already up-to-date`);
      } else {
        await fs.writeFile(compactPath, compactContent, 'utf-8');
        console.log(`  ✓ Wrote ${compactPath}`);
      }

      // 3. Digest (structured summary)
      const digestPath = path.join(inputs.outputDir, 'tiriti.digest.json');
      const digest = this.renderDigest(normalizedContent);
      const digestContent = JSON.stringify(digest, null, 2);
      outputs.digestPath = digestPath;
      outputs.digestHash = this.checkpointEngine.hashContent(digestContent);

      if (await this.checkpointEngine.checkFileHash(digestPath, outputs.digestHash)) {
        console.log(`  ↻ ${digestPath} already up-to-date`);
      } else {
        await fs.writeFile(digestPath, digestContent, 'utf-8');
        console.log(`  ✓ Wrote ${digestPath}`);
      }

      return {
        success: true,
        outputs
      };
    } catch (error) {
      return {
        success: false,
        error: `Render failed: ${error}`
      };
    }
  }

  /**
   * STAGE: VERIFY - Ensure outputs exist and contain required markers
   */
  private async stageVerify(checkpoint: any, inputs: TiritiAuditInputs): Promise<StageResult> {
    try {
      const renderOutputs = checkpoint.stage_outputs.RENDER;
      if (!renderOutputs) {
        return { success: false, error: 'No outputs from RENDER stage' };
      }

      const errors: string[] = [];

      // Verify public file
      const publicPath = renderOutputs.publicPath as string;
      if (!(await this.fileExists(publicPath))) {
        errors.push(`Missing public file: ${publicPath}`);
      } else {
        const content = await fs.readFile(publicPath, 'utf-8');
        if (!content.includes('Tiriti o te Kai')) {
          errors.push(`Public file missing required marker "Tiriti o te Kai"`);
        }
      }

      // Verify compact file
      const compactPath = renderOutputs.compactPath as string;
      if (!(await this.fileExists(compactPath))) {
        errors.push(`Missing compact file: ${compactPath}`);
      }

      // Verify digest file
      const digestPath = renderOutputs.digestPath as string;
      if (!(await this.fileExists(digestPath))) {
        errors.push(`Missing digest file: ${digestPath}`);
      } else {
        const content = await fs.readFile(digestPath, 'utf-8');
        const digest = JSON.parse(content);
        if (!digest.version || !digest.sections) {
          errors.push(`Digest file missing required fields`);
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          error: `Verification failed:\n${errors.join('\n')}`
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Verification failed: ${error}`
      };
    }
  }

  /**
   * STAGE: DONE - Final marker
   */
  private async stageDone(): Promise<StageResult> {
    return { success: true };
  }

  /**
   * Render public version (full document)
   */
  private renderPublicVersion(content: string): string {
    // For now, just return normalized content
    // Future: could add header/footer markers for Substack
    return content;
  }

  /**
   * Render compact version (remove extra whitespace, keep structure)
   */
  private renderCompactVersion(content: string): string {
    // Remove blank lines, keep single newlines between sections
    return content
      .split('\n')
      .map(line => line.trim())
      .filter((line, idx, arr) => {
        // Keep non-empty lines
        if (line.length > 0) return true;
        // Keep single blank line between sections
        if (idx > 0 && arr[idx - 1].startsWith('#')) return true;
        return false;
      })
      .join('\n');
  }

  /**
   * Render structured digest
   */
  private renderDigest(content: string): any {
    const lines = content.split('\n');
    const sections: any[] = [];
    let currentSection: any = null;

    // Extract version from frontmatter
    const versionMatch = content.match(/version: "([^"]+)"/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    for (const line of lines) {
      // Detect sections (## headers)
      if (line.match(/^##\s+\d+\)/)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          heading: line.replace(/^##\s+/, ''),
          content: []
        };
      } else if (currentSection && line.trim()) {
        currentSection.content.push(line);
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return {
      version,
      title: 'Tiriti o te Kai — Governance v' + version,
      sections: sections.map(s => ({
        heading: s.heading,
        lineCount: s.content.length,
        hash: this.checkpointEngine.hashContent(s.content.join('\n'))
      })),
      contentHash: this.checkpointEngine.hashContent(content)
    };
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export default TiritiAuditJob;
