# Governance Package TODO

## Critical

- [x] Implement loadAuthorityConfig with strict validation
- [x] Implement getCurrentPrincipal
- [x] Implement CIF validation with schema support (validateCIF + zod schemas)
- [x] Implement CDI pre-action checks (checkCDI with cross-namespace denial)
- [ ] Implement CDI post-action checks
- [x] Add unit tests for authority config loading
- [x] Add unit tests for CIF validation
- [x] Add unit tests for CDI decision logic

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
