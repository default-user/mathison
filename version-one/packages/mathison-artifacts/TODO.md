# Artifacts Package TODO

## Critical

- [ ] Implement putArtifact with filesystem storage
- [ ] Implement getArtifactMetadata
- [ ] Implement listArtifactsByThread
- [ ] Add content hash verification
- [ ] Add unit tests for artifact storage
- [ ] Add unit tests for hash verification

## High Priority

- [ ] Implement S3-compatible storage adapter
- [ ] Add artifact deletion (with safety checks)
- [ ] Add artifact size limits
- [ ] Implement artifact compression
- [ ] Add proper error handling

## Medium Priority

- [ ] Add artifact access logging
- [ ] Implement artifact encryption at rest
- [ ] Add artifact deduplication by hash
- [ ] Support multipart upload for large files
- [ ] Add artifact retention policies

## Low Priority

- [ ] Add artifact migration between storage backends
- [ ] Implement CDN integration for artifact delivery
- [ ] Add artifact thumbnail generation

## Blockers

- None
