// WHY: Types for artifact storage

export interface ArtifactMetadata {
  artifact_id: string;
  namespace_id: string;
  thread_id: string | null;
  content_hash: string;
  storage_uri: string;
  size_bytes: number;
  created_at: Date;
}

export interface ArtifactStore {
  putArtifact(namespace_id: string, thread_id: string | null, data: Buffer): Promise<ArtifactMetadata>;
  getArtifactMetadata(artifact_id: string): Promise<ArtifactMetadata | null>;
  listArtifactsByThread(thread_id: string): Promise<ArtifactMetadata[]>;
  getArtifactData(artifact_id: string): Promise<Buffer | null>;
}
