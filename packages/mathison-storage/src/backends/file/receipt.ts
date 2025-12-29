import * as fs from 'fs/promises';
import * as path from 'path';
import { ReceiptStore, Receipt } from '../../receipt_store';

const DEFAULT_MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface FileReceiptStoreOptions {
  maxLogSizeBytes?: number;
}

export class FileReceiptStore implements ReceiptStore {
  private rootDir: string;
  private receiptsDir: string;
  private maxLogSizeBytes: number;
  private currentLogNumber: number = 1;

  constructor(rootDir: string, opts: FileReceiptStoreOptions = {}) {
    this.rootDir = rootDir;
    this.receiptsDir = path.join(rootDir, 'receipts');
    this.maxLogSizeBytes = opts.maxLogSizeBytes ?? DEFAULT_MAX_LOG_SIZE_BYTES;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.receiptsDir, { recursive: true });

    // Discover current log number
    const files = await fs.readdir(this.receiptsDir);
    const logFiles = files
      .filter(f => f.startsWith('eventlog-') && f.endsWith('.jsonl'))
      .map(f => {
        const match = f.match(/eventlog-(\d+)\.jsonl/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);

    this.currentLogNumber = logFiles.length > 0 ? Math.max(...logFiles) : 1;
  }

  async append(r: Receipt): Promise<void> {
    const currentLogPath = this.getCurrentLogPath();
    const line = JSON.stringify(r) + '\n';

    // Check if rotation needed
    let needsRotation = false;
    try {
      const stats = await fs.stat(currentLogPath);
      if (stats.size + Buffer.byteLength(line) > this.maxLogSizeBytes) {
        needsRotation = true;
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      // File doesn't exist yet, no rotation needed
    }

    if (needsRotation) {
      this.currentLogNumber++;
    }

    const targetLogPath = this.getCurrentLogPath();
    await fs.appendFile(targetLogPath, line, 'utf-8');
  }

  async readByJob(jobId: string, opts?: { limit?: number }): Promise<Receipt[]> {
    const receipts: Receipt[] = [];

    // Read all log files in order
    const files = await fs.readdir(this.receiptsDir);
    const logFiles = files
      .filter(f => f.startsWith('eventlog-') && f.endsWith('.jsonl'))
      .sort(); // Lexicographic sort works for zero-padded numbers

    for (const logFile of logFiles) {
      const logPath = path.join(this.receiptsDir, logFile);
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const receipt = JSON.parse(line);
          if (receipt.job_id === jobId) {
            receipts.push(receipt);

            if (opts?.limit && receipts.length >= opts.limit) {
              return receipts;
            }
          }
        } catch (err) {
          // Skip malformed lines
          console.warn(`Skipping malformed receipt line in ${logFile}:`, line);
        }
      }
    }

    return receipts;
  }

  async latest(jobId: string): Promise<Receipt | null> {
    const receipts = await this.readByJob(jobId);
    return receipts.length > 0 ? receipts[receipts.length - 1] : null;
  }

  private getCurrentLogPath(): string {
    const logFileName = `eventlog-${String(this.currentLogNumber).padStart(4, '0')}.jsonl`;
    return path.join(this.receiptsDir, logFileName);
  }
}
