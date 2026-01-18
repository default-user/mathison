# @mathison/artifacts

Blob storage with content addressing for Mathison v2.

## Purpose

WHY: Separating large blobs from structured data keeps the database fast and allows flexible storage backends.

Responsibilities:
- Store large binary objects
- Track artifact metadata in Postgres
- Content-address artifacts by hash

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```typescript
import { putArtifact, getArtifactMetadata, listArtifactsByThread } from '@mathison/artifacts';

// Store artifact
const metadata = await putArtifact(
  'ns-1',
  'thread-123',
  Buffer.from('file contents')
);

// Get metadata
const meta = await getArtifactMetadata(metadata.artifact_id);

// List by thread
const artifacts = await listArtifactsByThread('thread-123');
```

## How to Run

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck
```

## WHY

**Why separate blob storage?**
Large blobs bloat database backups, filesystem/S3 is cheaper and faster for blob storage.

**Why content addressing?**
Hash-based addressing prevents duplication and enables integrity verification.

**Why metadata in Postgres?**
Enables queries and joins with threads/events, single source of truth for artifact registry.

## See Also

- [Architecture](../../docs/ARCHITECTURE.md)
