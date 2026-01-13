# Engineering Notes: Thin Waist v0.1 Implementation

**Date:** 2026-01-13
**Goal:** Implement governance-enforcing "thin waist" interfaces to create a single chokepoint architecture.

## Phase 0: Repo Discovery

### Current Architecture

**Entry Points:**
- `packages/mathison-server/src/index.ts` - Main server entry
- `packages/mathison-server/src/grpc/interceptors/cif-interceptor.ts` - CIF ingress/egress
- `packages/mathison-server/src/grpc/interceptors/cdi-interceptor.ts` - CDI action checks
- `packages/mathison-server/src/action-gate/index.ts` - ActionGate for side effects

**Governance (mathison-governance package):**
- `capability-token.ts` - ✅ CapabilityToken already exists (HMAC-signed, TTL, use-limited)
- `action-registry.ts` - ✅ Action registry with risk classification
- `cdi.ts` - ✅ CDI implementation with consent + genome capability ceiling
- `token-ledger.ts` - ✅ Server-side replay protection
- `integrity.ts` - Integrity checks
- `governance-proof.ts` - Governance proofs

**Tools/Adapters:**
- `packages/mathison-oi/src/interpreter.ts` - OI interpreter (deterministic, memory-backed)
- Tools currently invoke through ActionGate.executeSideEffect() but no explicit tool registry

**Signing Infrastructure:**
- `scripts/genome-sign.ts` - Ed25519 signing for genomes
- `scripts/genome-verify.ts` - Genome verification utility
- `packages/mathison-genome/src/` - Genome types, canonicalization, validation, loader

**Logging:**
- `packages/mathison-storage/` - Receipt and checkpoint stores
- `packages/mathison-server/src/action-gate/index.ts` - Creates receipts for side effects
- No retention caps for mobile-safe operation

### What Needs Building

1. **Tool Gateway (NEW)**
   - Explicit tool registry mapping tool_name → handler + required_scopes
   - Single ToolGateway.invoke() chokepoint
   - Resource-level scoping (network, fs, model, etc.)
   - Deny-by-default for unknown tools
   - Integration with CapabilityToken verification

2. **Artifact Verification (ENHANCE)**
   - Systematic verification at startup (not just CLI scripts)
   - ArtifactManifest schema (treaty/policy/adapter)
   - Trust store for signer keys
   - Fail-closed on unsigned/untrusted artifacts

3. **Log Envelope + Retention Caps (ENHANCE)**
   - LogEnvelope v1 schema (lightweight, mobile-safe)
   - Ring buffer with configurable size
   - Max pending-upload bytes cap
   - Drop low-severity on overflow
   - Block high-risk actions if durable logging unavailable

4. **Conformance Suite (NEW)**
   - `tests/conformance/` directory
   - 6+ critical tests proving governance invariants
   - NO_TOOL_BYPASS, CAPABILITY_DENY_BY_DEFAULT, SIGNED_ARTIFACT_REQUIRED, etc.
   - CI integration

## Implementation Strategy

### Minimal Surface Area
- Keep existing CapabilityToken, ActionGate, CDI/CIF intact
- Add ToolGateway as thin layer over ActionGate
- Enhance Receipt with LogEnvelope wrapper + retention policy
- Add artifact verification to server startup

### Locations
- New package: `packages/mathison-governance/src/thin-waist/` for core interfaces
- New: `packages/mathison-governance/src/thin-waist/tool-gateway.ts`
- New: `packages/mathison-governance/src/thin-waist/artifact-verifier.ts`
- New: `packages/mathison-governance/src/thin-waist/log-envelope.ts`
- New: `tests/conformance/` for conformance suite

### Integration Points
1. Server startup: Load and verify genome (already exists, enhance fail-closed behavior)
2. Tool invocations: Route through ToolGateway.invoke() (wire in handlers)
3. Receipts: Wrap with LogEnvelope, apply retention caps
4. CI: Add conformance tests to existing pipeline

## Risk Mitigation
- No breaking changes to public APIs (ActionGate, CDI, CIF remain compatible)
- Fail-closed default everywhere
- Test keys acceptable for dev, env-driven for prod
- Structured deny reasons for debugging

## Success Criteria
- All conformance tests pass
- Single tool invocation path through ToolGateway
- Unsigned artifacts cannot activate
- Log retention caps enforced
- Docs + CI updated
