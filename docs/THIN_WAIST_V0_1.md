# Thin Waist v0.1 - Governance Spine

**Status:** Implemented
**Version:** 0.1.0
**Date:** 2026-01-13

## Overview

The Thin Waist architecture provides a **single chokepoint** for all governance-critical operations in Mathison. It enforces capability-based access control, artifact verification, and mobile-safe log retention.

**Core Principle:** Deny-by-default. All high-risk operations must pass through these interfaces.

## Architecture

```
┌─────────────────────────────────────────────┐
│          Application Layer                   │
│  (HTTP handlers, gRPC services, tools)      │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         Thin Waist Interfaces                │
│  ┌──────────────────────────────────────┐   │
│  │ ToolGateway (tool invocations)       │   │
│  │ ArtifactVerifier (treaty/policy)     │   │
│  │ LogSink (mobile-safe logging)        │   │
│  └──────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│      Existing Governance Layer               │
│  (CDI, CIF, CapabilityToken, ActionGate)    │
└──────────────────────────────────────────────┘
```

## Four Interfaces

### 1. CapabilityToken (Existing)

**Purpose:** Cryptographically-signed tokens granting specific capabilities.

**Features:**
- HMAC-signed with boot key
- Time-limited (TTL)
- Use-limited (default: single-use)
- Actor-bound
- Action-scoped

**Usage:**
```typescript
import { mintSingleUseToken, validateToken } from 'mathison-governance';

// Mint token for specific action
const token = mintSingleUseToken(
  'action:read:health',
  'user-123',
  { route: '/api/health', method: 'GET' }
);

// Validate token
const result = validateToken(token, {
  expected_action_id: 'action:read:health',
  expected_actor: 'user-123'
});

if (!result.valid) {
  // Token denied: result.errors
}
```

### 2. ToolGateway

**Purpose:** Single entry point for ALL tool/adapter invocations.

**Invariant:** No tool may execute without passing through this gateway.

**Features:**
- Deny-by-default (unregistered tools rejected)
- Capability token verification
- Resource-level scoping (network, fs, model, etc.)
- Audit logging

**Usage:**
```typescript
import { getToolGateway, ToolDefinition } from 'mathison-governance';

// Register tool during initialization
const gateway = getToolGateway();
gateway.registerTool({
  name: 'filesystem-read',
  description: 'Read files from local filesystem',
  action_id: 'action:fs:read',
  required_scopes: [{ type: 'fs:read', path: '/data' }],
  handler: async (args, context) => {
    // Tool implementation
    return { content: 'file data' };
  }
});

// Invoke tool with capability token
const result = await gateway.invoke(
  'filesystem-read',
  { path: '/data/file.txt' },
  capabilityToken,
  { actor: 'user-123' }
);

if (!result.success) {
  // Tool denied: result.denied_reason
}
```

**Adding a New Tool:**

1. Define tool in your package
2. Register at server startup
3. Map to action_id from ActionRegistry
4. Specify required_scopes
5. Implement handler
6. Route all invocations through gateway.invoke()

### 3. ArtifactVerifier

**Purpose:** Verify signed treaty/policy/adapter/genome artifacts before activation.

**Invariant:** No artifact may be loaded without signature verification.

**Features:**
- Ed25519 signature verification
- Trust store for signer keys
- Content hash verification
- Fail-closed on untrusted artifacts

**Usage:**
```typescript
import { getArtifactVerifier, ArtifactManifest } from 'mathison-governance';

// Initialize with trust store
await initializeArtifactVerifier({ testMode: false });

// Verify artifact
const verifier = getArtifactVerifier();
const result = await verifier.verifyManifest(manifest, contentBytes);

if (!result.verified) {
  // Artifact rejected: result.errors
  throw new Error(`Artifact verification failed: ${result.errors.join('; ')}`);
}
```

**Production Setup:**

Set `MATHISON_TRUST_STORE` environment variable with trusted signer keys:

```json
[
  {
    "key_id": "prod-signer-001",
    "alg": "ed25519",
    "public_key": "base64-encoded-public-key",
    "description": "Production signer",
    "added_at": "2026-01-13T00:00:00Z"
  }
]
```

### 4. LogSink + LogEnvelope

**Purpose:** Mobile-safe logging with deterministic retention caps.

**Invariant:** Log storage never exceeds configured caps.

**Features:**
- Ring buffer with max envelope count
- Max pending bytes cap
- Severity-based retention (drop DEBUG/INFO first)
- Block high-severity if durable logging required
- Chain integrity (each envelope references previous hash)

**Usage:**
```typescript
import { getLogSink, LogSeverity } from 'mathison-governance';

const logSink = getLogSink();

// Append log envelope
const result = logSink.append({
  timestamp: new Date().toISOString(),
  subject_id: 'user-123',
  event_type: 'tool_invocation',
  severity: LogSeverity.INFO,
  summary: 'Tool executed successfully'
});

if (!result.accepted) {
  // Log rejected (caps exceeded for high-severity event)
  console.error(result.denied_reason);
}

// Get statistics
const stats = logSink.getStats();
console.log(`Total envelopes: ${stats.total_envelopes}`);
console.log(`Dropped: ${stats.dropped_count}`);
```

**Retention Policy:**

Default (mobile-safe):
- Max envelopes: 1000
- Max pending bytes: 1 MB
- Drop on overflow: DEBUG, INFO
- Block on overflow: ERROR, CRITICAL

Custom policy:
```typescript
import { initializeLogSink, RetentionPolicy } from 'mathison-governance';

const customPolicy: RetentionPolicy = {
  max_envelopes: 500,
  max_pending_bytes: 512 * 1024, // 512 KB
  drop_on_overflow: [LogSeverity.DEBUG],
  block_on_overflow: [LogSeverity.CRITICAL]
};

initializeLogSink('node-001', customPolicy);
```

## Safe-Mode Behavior

When governance prerequisites are missing or verification fails, the system enters **safe-mode**:

- **Missing trust store (production):** Server refuses to start
- **Missing capability token:** Tool invocation denied
- **Unsigned/untrusted artifact:** Artifact activation refused
- **Log caps exceeded (high-severity):** Operation blocked until logs flushed

**Safe-mode principle:** Fail-closed. No high-risk operation proceeds without governance.

## Integration Points

### Server Startup

```typescript
import {
  initializeTokenKey,
  initializeToolGateway,
  initializeArtifactVerifier,
  initializeLogSink
} from 'mathison-governance';

// 1. Initialize boot key (for token signing)
const bootKey = loadBootKey();
initializeTokenKey(bootKey, 'boot-key-001');

// 2. Initialize artifact verifier
await initializeArtifactVerifier({ testMode: false });

// 3. Initialize tool gateway
const gateway = initializeToolGateway();

// 4. Initialize log sink
const logSink = initializeLogSink('server-001');

// 5. Register tools
registerTools(gateway);

// 6. Verify and load genome
await loadAndVerifyGenome(genomePath);
```

### HTTP/gRPC Handlers

```typescript
import { getToolGateway, mintSingleUseToken } from 'mathison-governance';

async function handleToolRequest(req, res) {
  // 1. CDI: Check action
  const actionResult = await cdi.checkAction({
    actor: req.user.id,
    action: 'tool_invoke',
    action_id: 'action:tool:invoke'
  });

  if (actionResult.verdict !== 'allow') {
    return res.status(403).json({ error: actionResult.reason });
  }

  // 2. Get capability token from CDI
  const token = actionResult.capability_token;

  // 3. Invoke tool through gateway
  const gateway = getToolGateway();
  const result = await gateway.invoke(
    req.body.tool_name,
    req.body.args,
    token,
    { actor: req.user.id }
  );

  if (!result.success) {
    return res.status(403).json({ error: result.denied_reason });
  }

  return res.json(result.data);
}
```

## Testing

See `tests/conformance/thin-waist-conformance.test.ts` for comprehensive tests.

Run conformance tests:
```bash
pnpm test -- conformance
```

## Version History

- **v0.1.0** (2026-01-13): Initial implementation
  - ToolGateway with deny-by-default
  - ArtifactVerifier with Ed25519
  - LogSink with retention caps
  - Conformance test suite

## Future Enhancements

- Fine-grained resource scoping in ToolGateway
- Multi-signature artifact verification
- Remote log upload integration
- Performance monitoring hooks
