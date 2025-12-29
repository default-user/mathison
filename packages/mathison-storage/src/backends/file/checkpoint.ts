import * as fs from 'fs/promises';
import * as path from 'path';
import { CheckpointStore, JobCheckpoint } from '../../checkpoint_store';

export class FileCheckpointStore implements CheckpointStore {
  private rootDir: string;
  private checkpointsDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.checkpointsDir = path.join(rootDir, 'checkpoints');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.checkpointsDir, { recursive: true });
  }

  async create(cp: JobCheckpoint): Promise<void> {
    const filePath = this.getCheckpointPath(cp.job_id);

    // Ensure doesn't already exist
    try {
      await fs.access(filePath);
      throw new Error(`Checkpoint already exists for job_id: ${cp.job_id}`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    await fs.writeFile(filePath, JSON.stringify(cp, null, 2), 'utf-8');
  }

  async load(jobId: string): Promise<JobCheckpoint | null> {
    const filePath = this.getCheckpointPath(jobId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(cp: JobCheckpoint): Promise<void> {
    const filePath = this.getCheckpointPath(cp.job_id);
    await fs.writeFile(filePath, JSON.stringify(cp, null, 2), 'utf-8');
  }

  async list(opts?: { limit?: number }): Promise<JobCheckpoint[]> {
    const files = await fs.readdir(this.checkpointsDir);
    const checkpoints: JobCheckpoint[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.checkpointsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      checkpoints.push(JSON.parse(content));

      if (opts?.limit && checkpoints.length >= opts.limit) {
        break;
      }
    }

    return checkpoints;
  }

  private getCheckpointPath(jobId: string): string {
    return path.join(this.checkpointsDir, `${jobId}.json`);
  }
}
