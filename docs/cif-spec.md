# CIF (Context Integrity Firewall) — Specification v0.1

**Component:** Governance Layer
**Purpose:** Boundary control for safe ingress/egress of data

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
