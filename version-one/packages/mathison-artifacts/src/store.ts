// WHY: Filesystem-based artifact storage with Postgres metadata

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { ArtifactStore, ArtifactMetadata } from './types';

/**
 * WHY: Filesystem storage for local dev, S3 for production (TODO)
 */
export class FilesystemArtifactStore implements ArtifactStore {
  private pool: Pool;
  private storagePath: string;

  constructor(connectionString: string, storagePath: string) {
    this.pool = new Pool({ connectionString });
    this.storagePath = storagePath;
  }

  async putArtifact(namespace_id: string, thread_id: string | null, data: Buffer): Promise<ArtifactMetadata> {
    // Compute content hash
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    
    // Store blob on filesystem
    const filename = `${hash}.bin`;
    const filepath = path.join(this.storagePath, filename);
    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.writeFile(filepath, data);

    // Store metadata in Postgres
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO artifacts_metadata (namespace_id, thread_id, content_hash, storage_uri, size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING artifact_id, namespace_id, thread_id, content_hash, storage_uri, size_bytes, created_at`,
        [namespace_id, thread_id, hash, `file://${filepath}`, data.length]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getArtifactMetadata(artifact_id: string): Promise<ArtifactMetadata | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT artifact_id, namespace_id, thread_id, content_hash, storage_uri, size_bytes, created_at
         FROM artifacts_metadata
         WHERE artifact_id = $1`,
        [artifact_id]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async listArtifactsByThread(thread_id: string): Promise<ArtifactMetadata[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT artifact_id, namespace_id, thread_id, content_hash, storage_uri, size_bytes, created_at
         FROM artifacts_metadata
         WHERE thread_id = $1
         ORDER BY created_at DESC`,
        [thread_id]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getArtifactData(artifact_id: string): Promise<Buffer | null> {
    const metadata = await this.getArtifactMetadata(artifact_id);
    if (!metadata) {
      return null;
    }

    // Extract filepath from storage_uri
    const filepath = metadata.storage_uri.replace('file://', '');
    const data = await fs.readFile(filepath);
    
    // Verify hash
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    if (hash !== metadata.content_hash) {
      throw new Error(`Hash mismatch for artifact ${artifact_id}`);
    }

    return data;
  }
}
