# Governance Package TODO

## Critical

- [ ] Implement loadAuthorityConfig with strict validation
- [ ] Implement getCurrentPrincipal
- [ ] Implement CIF validation with schema support
- [ ] Implement CDI pre-action checks (currently allow-all stub)
- [ ] Implement CDI post-action checks
- [ ] Add unit tests for authority config loading
- [ ] Add unit tests for CIF validation
- [ ] Add unit tests for CDI decision logic

## High Priority

- [ ] Add capability token generation and verification
- [ ] Implement delegation scope checking
- [ ] Add policy rule engine
- [ ] Implement CDI egress redaction
- [ ] Add structured error types for governance failures

## Medium Priority

- [ ] Support multiple authority config sources (file, env, remote)
- [ ] Add governance decision logging
- [ ] Implement time-limited capability tokens
- [ ] Add policy rule hot-reload without restart

## Low Priority

- [ ] Admin role support
- [ ] Multi-principal support
- [ ] Policy versioning and rollback

## Blockers

- None
