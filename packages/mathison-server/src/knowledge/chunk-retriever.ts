/**
 * ChunkRetriever - Stub implementation for fetching chunks
 *
 * This is a placeholder that can be swapped with a real implementation
 * (e.g., vector DB, document store, etc.)
 */

import { createHash } from 'crypto';
import { ChunkRetriever, FetchedChunk } from './types';

/**
 * In-memory chunk retriever for testing and development
 */
export class InMemoryChunkRetriever implements ChunkRetriever {
  private chunks: Map<string, { content: string; source_uri?: string }>;

  constructor(chunks: Map<string, { content: string; source_uri?: string }> = new Map()) {
    this.chunks = chunks;
  }

  async fetch(chunk_id: string): Promise<FetchedChunk | null> {
    const chunk = this.chunks.get(chunk_id);
    if (!chunk) {
      return null;
    }

    const content_hash = createHash('sha256').update(chunk.content).digest('hex');
    const has_instructional_text = this.detectInstructionalText(chunk.content);

    return {
      chunk_id,
      content: chunk.content,
      content_hash,
      source_uri: chunk.source_uri,
      retrieved_at: Date.now(),
      has_instructional_text,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Detect potential prompt injection patterns in chunk content
   */
  private detectInstructionalText(content: string): boolean {
    const patterns = [
      /ignore\s+(previous|above|prior)\s+(instructions?|prompts?)/i,
      /system\s+prompt/i,
      /new\s+instructions?:/i,
      /disregard\s+(previous|above)/i,
      /\[INST\]/i,
      /\[\/INST\]/i,
      /<\|system\|>/i,
      /you\s+are\s+now/i,
      /forget\s+(everything|all|previous)/i,
    ];

    return patterns.some((pattern) => pattern.test(content));
  }

  /**
   * Add chunks to the in-memory store (for testing)
   */
  addChunk(chunk_id: string, content: string, source_uri?: string): void {
    this.chunks.set(chunk_id, { content, source_uri });
  }
}

/**
 * Create a chunk retriever from environment configuration
 */
export function makeChunkRetrieverFromEnv(env = process.env): ChunkRetriever {
  // For now, return in-memory retriever
  // In production, this would select based on env vars:
  // - CHUNK_RETRIEVER_TYPE=memory|vector_db|document_store
  // - CHUNK_RETRIEVER_URI=...
  return new InMemoryChunkRetriever();
}
