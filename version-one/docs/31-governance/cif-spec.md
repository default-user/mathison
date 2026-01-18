# CIF (Context Integrity Firewall) — Specification v0.1

**Component:** Governance Layer
**Mathison Version:** 1.0.0
**Purpose:** Boundary control for safe ingress/egress of data

## Who This Is For

- **Security engineers** implementing input sanitization and leak prevention
- **Backend developers** integrating CIF into request/response pipelines
- **DevOps engineers** configuring rate limits and protection rules
- **Compliance officers** auditing data flow boundaries
- **System architects** designing defense-in-depth security

## Why This Exists

CIF provides the first and last line of defense in the governance pipeline. It prevents malicious inputs from reaching the system and sensitive data from leaking out. Without CIF, the system is vulnerable to injection attacks, data exfiltration, and resource exhaustion. CIF works with CDI to create defense-in-depth: CIF handles boundary threats, CDI handles policy violations.

## Guarantees / Invariants

1. **All requests sanitized** — No raw external input reaches handlers
2. **All responses scrubbed** — No secrets, PII, or internal paths leak
3. **Rate limits enforced** — Per-client token bucket prevents abuse
4. **Size limits enforced** — Prevents resource exhaustion attacks
5. **Audit logging** — All boundary crossings recorded
6. **Fail-closed on errors** — CIF errors result in request rejection
7. **Schema validation** — Malformed inputs rejected early
8. **Performance bound** — < 5ms per ingress/egress check (p95)

## Non-Goals

- **Business logic validation** — CIF sanitizes, CDI enforces policy
- **Authentication** — CIF validates structure, auth is separate layer
- **Encryption** — CIF protects boundaries, TLS handles transport
- **DDoS mitigation** — Rate limiting is basic; not full DDoS protection
- **WAF replacement** — CIF is app-level, not network-level firewall

---

## Overview

The CIF acts as a protective boundary around the Mathison OI system, sanitizing inputs, preventing data leakage, and enforcing rate limits. It works in tandem with the CDI to ensure governance compliance.

## Core Responsibilities

### Ingress (Input Protection)

1. **Sanitization** — Remove malicious payloads (XSS, injection)
2. **Quarantine** — Flag suspicious patterns for review
3. **Rate Limiting** — Prevent abuse per client
4. **Schema Validation** — Ensure well-formed inputs

### Egress (Output Protection)

1. **PII Detection** — Identify and scrub personal information
2. **Leak Prevention** — Block credentials, secrets, internal paths
3. **Audit Logging** — Record all outbound data
4. **Size Limits** — Prevent excessive responses

## API Surface

### Initialization

```typescript
interface CIFConfig {
  maxRequestSize: number;      // bytes
  maxResponseSize: number;     // bytes
  rateLimit: {
    windowMs: number;          // time window
    maxRequests: number;       // requests per window
  };
  piiPatterns: RegExp[];       // PII detection patterns
  secretPatterns: RegExp[];    // Secret detection patterns
  auditLog: boolean;
}

class CIF {
  constructor(config: CIFConfig);
  async initialize(): Promise<void>;
  async shutdown(): Promise<void>;
}
```

### Ingress API

```typescript
interface IngressContext {
  clientId: string;
  endpoint: string;
  payload: unknown;
  headers?: Record<string, string>;
  timestamp: number;
}

interface IngressResult {
  allowed: boolean;
  sanitizedPayload?: unknown;
  quarantined: boolean;
  violations: string[];
  rateLimitRemaining?: number;
}

class CIF {
  async ingress(context: IngressContext): Promise<IngressResult>;
}
```

### Egress API

```typescript
interface EgressContext {
  clientId: string;
  endpoint: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

interface EgressResult {
  allowed: boolean;
  sanitizedPayload?: unknown;
  violations: string[];
  leaksDetected: string[];    // Types of leaks found
}

class CIF {
  async egress(context: EgressContext): Promise<EgressResult>;
}
```

## Ingress Protection Details

### 1. Sanitization

**Threats Mitigated:**
- XSS injection in text fields
- SQL injection patterns
- Command injection
- Path traversal attempts

**Implementation:**
```typescript
function sanitizeInput(input: string): string {
  // Strip HTML tags except whitelisted
  // Escape SQL special characters
  // Remove shell metacharacters
  // Normalize path separators
}
```

### 2. Quarantine

**Patterns Flagged:**
- Unusual character encodings
- Excessive nesting depth (JSON/XML bombs)
- Binary data in text fields
- Known malware signatures

**Action:** Log, alert, optionally reject

### 3. Rate Limiting

**Strategy:** Token bucket per client ID

```typescript
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  refillRate: number;
}

function checkRateLimit(clientId: string): boolean {
  const bucket = this.buckets.get(clientId);
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }
  return false;
}
```

### 4. Schema Validation

**Approach:** JSON Schema validation for structured data

```typescript
const requestSchema = {
  type: "object",
  properties: {
    action: { type: "string", maxLength: 100 },
    params: { type: "object" }
  },
  required: ["action"]
};

function validateSchema(payload: unknown): ValidationResult;
```

## Egress Protection Details

### 1. PII Detection

**Patterns Detected:**
- Email addresses
- Phone numbers
- Credit card numbers
- Social security numbers
- IP addresses
- Physical addresses

**Actions:**
- `REDACT`: Replace with `[REDACTED]`
- `HASH`: Replace with hash (for tracking without exposing)
- `BLOCK`: Reject entire response

### 2. Leak Prevention

**Secrets Detected:**
- API keys (patterns like `sk-...`, `AKIA...`)
- Private keys (BEGIN PRIVATE KEY)
- Passwords (context-based detection)
- Database connection strings
- File paths that might reveal internal structure

**Default Action:** BLOCK (fail-closed)

### 3. Audit Logging

**Logged Fields:**
```typescript
interface AuditEntry {
  timestamp: number;
  direction: "ingress" | "egress";
  clientId: string;
  endpoint: string;
  allowed: boolean;
  violations: string[];
  sanitizationApplied: boolean;
  payloadHash: string;        // For correlation
}
```

### 4. Size Limits

**Enforcement:**
- Ingress: Reject requests > maxRequestSize
- Egress: Truncate or reject responses > maxResponseSize
- Protection against resource exhaustion

## Integration with CDI

```
Request Flow:

1. CIF.ingress(request)
   ↓
2. If allowed, CDI.checkAction(action)
   ↓
3. If allowed, perform action
   ↓
4. CDI.checkOutput(result)
   ↓
5. CIF.egress(result)
   ↓
6. Return to client
```

Both CIF and CDI must approve for action to proceed.

## Performance Targets

- **Ingress latency:** < 5ms per request (p95)
- **Egress latency:** < 5ms per response (p95)
- **Throughput:** > 2000 req/sec per instance
- **Memory:** < 50MB steady state

## Configuration Examples

### Development Mode (Permissive)

```json
{
  "maxRequestSize": 10485760,
  "maxResponseSize": 10485760,
  "rateLimit": {
    "windowMs": 60000,
    "maxRequests": 1000
  },
  "piiPatterns": [],
  "secretPatterns": ["sk-", "AKIA"],
  "auditLog": false
}
```

### Production Mode (Strict)

```json
{
  "maxRequestSize": 1048576,
  "maxResponseSize": 1048576,
  "rateLimit": {
    "windowMs": 60000,
    "maxRequests": 100
  },
  "piiPatterns": [
    "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b",
    "\\b\\d{3}-\\d{2}-\\d{4}\\b"
  ],
  "secretPatterns": [
    "sk-[a-zA-Z0-9]{32,}",
    "AKIA[A-Z0-9]{16}",
    "-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----"
  ],
  "auditLog": true
}
```

## Testing Strategy

### Unit Tests

- Each sanitization function isolated
- PII pattern matching accuracy
- Rate limit bucket logic

### Integration Tests

- Full ingress → CDI → egress flow
- Leak detection with real secrets
- Rate limit enforcement under load

### Adversarial Tests

- Bypass attempts (encoding tricks)
- Polyglot payloads
- Timing attacks on rate limiter

## Security Considerations

1. **Defense in depth** — CIF + CDI both enforce boundaries
2. **Pattern maintenance** — Regularly update PII/secret patterns
3. **Audit integrity** — Immutable, append-only logs
4. **Resource limits** — Prevent DoS via large payloads

---

**Status:** Specification phase (v0.1)
**Next:** Implement core ingress/egress pipeline

---

## How to Verify

### Automated Tests
```bash
# Run CIF unit tests
pnpm --filter mathison-governance test cif.test.ts

# Run integration tests
pnpm --filter mathison-server test server-conformance.test.ts

# Performance benchmarks
pnpm --filter mathison-governance test:perf cif
```

### Manual Verification
1. **XSS injection test**: Send `<script>alert('xss')</script>` → expect sanitization
2. **Rate limit test**: Send 101 requests in 60s → expect 429 on last request
3. **PII leak test**: Generate response with email → expect redaction
4. **Secret leak test**: Output API key → expect blocking
5. **Size limit test**: Send 2MB payload → expect rejection

### Leak Detection Test
```bash
# Test secret patterns
echo '{"response": "My API key is sk-1234567890abcdef"}' | \
  pnpm tsx scripts/test-cif-egress.ts
# Expected: BLOCKED or [REDACTED]
```

### Rate Limit Test
```bash
# Burst 200 requests
for i in {1..200}; do
  curl -X POST http://localhost:3000/api/test -H "X-Client-ID: test-client"
done
# Expected: 429 Too Many Requests after limit exceeded
```

## Implementation Pointers

### Core Implementation
- **CIF class**: `/home/user/mathison/packages/mathison-governance/src/cif.ts`
- **Ingress sanitization**: `ingress()` method
- **Egress leak prevention**: `egress()` method
- **Rate limiting**: Token bucket implementation

### Server Integration
```typescript
// packages/mathison-server/src/server.ts
// Ingress hook (runs first)
fastify.addHook('onRequest', async (request, reply) => {
  const result = await cif.ingress({
    clientId: request.ip,
    endpoint: request.url,
    payload: request.body,
    headers: request.headers,
    timestamp: Date.now()
  });

  if (!result.allowed) {
    reply.code(400).send({ error: 'CIF ingress denied' });
  }

  request.body = result.sanitizedPayload;
});

// Egress hook (runs last)
fastify.addHook('onSend', async (request, reply, payload) => {
  const result = await cif.egress({
    clientId: request.ip,
    endpoint: request.url,
    payload: JSON.parse(payload)
  });

  if (!result.allowed) {
    reply.code(500).send({ error: 'CIF egress denied' });
  }

  return JSON.stringify(result.sanitizedPayload);
});
```

### Pattern Management
```typescript
// Add custom PII pattern
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
cif.addPIIPattern(emailPattern);

// Add custom secret pattern
const apiKeyPattern = /sk-[a-zA-Z0-9]{32,}/;
cif.addSecretPattern(apiKeyPattern);
```

### Audit Trail
```typescript
// View CIF audit log
import { readAuditLog } from '@mathison/governance';

const entries = await readAuditLog({
  direction: 'egress',
  violations: { $ne: [] },  // Only entries with violations
  startTime: Date.now() - 3600000  // Last hour
});

console.log(`Found ${entries.length} violations`);
```

### Test Coverage
- **Sanitization tests**: `packages/mathison-governance/tests/cif-sanitization.test.ts`
- **Rate limit tests**: `packages/mathison-governance/tests/cif-ratelimit.test.ts`
- **Leak detection tests**: `packages/mathison-governance/tests/cif-leak.test.ts`
- **Integration tests**: `packages/mathison-server/src/__tests__/server-conformance.test.ts`

### Extension Guide
1. **Add new sanitization rule**: Implement in `sanitizeInput()` method
2. **Add new PII pattern**: Add regex to `piiPatterns` config array
3. **Add new secret pattern**: Add regex to `secretPatterns` config array
4. **Custom rate limiting**: Extend `RateLimitBucket` interface
5. **Custom audit format**: Extend `AuditEntry` interface and logging logic
