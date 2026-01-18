import * as fs from 'fs/promises';
import * as path from 'path';
import { ReceiptStore, Receipt } from '../../receipt_store';
import { chainReceipt, validateReceiptChain, GENESIS_HASH, computeReceiptHash } from '../../receipt-chain';

const DEFAULT_MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface FileReceiptStoreOptions {
  maxLogSizeBytes?: number;
}

export class FileReceiptStore implements ReceiptStore {
  private rootDir: string;
  private receiptsDir: string;
  private maxLogSizeBytes: number;
  private currentLogNumber: number = 1;

  // P0.3: Chain state tracking
  private lastReceiptHash: string = GENESIS_HASH;
  private nextSequenceNumber: number = 0;
  private chainInitialized: boolean = false;

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

    // P0.3: Initialize chain state from existing receipts
    await this.initializeChainState();
  }

  /**
   * P0.3: Initialize chain state by reading the last receipt
   */
  private async initializeChainState(): Promise<void> {
    const receipts = await this.readAll({ limit: 1, offset: -1 }); // Read last receipt

    if (receipts.length > 0) {
      const lastReceipt = receipts[0];
      this.lastReceiptHash = computeReceiptHash(lastReceipt);
      this.nextSequenceNumber = (lastReceipt.sequence_number ?? -1) + 1;
    } else {
      // No receipts yet - start from genesis
      this.lastReceiptHash = GENESIS_HASH;
      this.nextSequenceNumber = 0;
    }

    this.chainInitialized = true;
  }

  async append(r: Receipt): Promise<void> {
    // P0.3: Add chain fields before appending
    const chainedReceipt = chainReceipt(r, this.lastReceiptHash, this.nextSequenceNumber);

    const currentLogPath = this.getCurrentLogPath();
    const line = JSON.stringify(chainedReceipt) + '\n';

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

    // P0.3: Update chain state after successful append
    this.lastReceiptHash = computeReceiptHash(chainedReceipt);
    this.nextSequenceNumber++;
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

  /**
   * P0.3: Read all receipts in sequence order
   */
  async readAll(opts?: { limit?: number; offset?: number }): Promise<Receipt[]> {
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
          receipts.push(receipt);
        } catch (err) {
          // Skip malformed lines
          console.warn(`Skipping malformed receipt line in ${logFile}:`, line);
        }
      }
    }

    // Apply offset and limit
    let result = receipts;

    if (opts?.offset !== undefined) {
      if (opts.offset < 0) {
        // Negative offset means "from end"
        result = receipts.slice(opts.offset);
      } else {
        result = receipts.slice(opts.offset);
      }
    }

    if (opts?.limit !== undefined && opts.limit > 0) {
      result = result.slice(0, opts.limit);
    }

    return result;
  }

  /**
   * P0.3: Validate entire receipt chain
   */
  async validateChain(): Promise<{ valid: boolean; errors: string[]; lastSequence: number }> {
    const receipts = await this.readAll();
    return validateReceiptChain(receipts);
  }
}
