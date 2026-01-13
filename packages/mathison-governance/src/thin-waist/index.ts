/**
 * Thin Waist v0.1 - Governance Spine Interfaces
 *
 * Single chokepoint architecture for:
 * - Tool invocations (ToolGateway)
 * - Artifact verification (ArtifactVerifier)
 * - Log retention (LogSink + LogEnvelope)
 *
 * INVARIANT: All high-risk operations pass through these interfaces.
 */

export * from './tool-gateway';
export * from './artifact-verifier';
export * from './log-envelope';
