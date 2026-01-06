/**
 * CIF (Context Integrity Firewall)
 * Boundary control for safe ingress/egress
 */

export interface CIFConfig {
  maxRequestSize: number;
  maxResponseSize: number;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  piiPatterns: RegExp[];
  secretPatterns: RegExp[];
  auditLog: boolean;
}

export interface IngressContext {
  clientId: string;
  endpoint: string;
  payload: unknown;
  headers?: Record<string, string>;
  timestamp: number;
}

export interface IngressResult {
  allowed: boolean;
  sanitizedPayload?: unknown;
  quarantined: boolean;
  violations: string[];
  rateLimitRemaining?: number;
}

export interface EgressContext {
  clientId: string;
  endpoint: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface EgressResult {
  allowed: boolean;
  sanitizedPayload?: unknown;
  violations: string[];
  leaksDetected: string[];
}

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

export class CIF {
  private config: CIFConfig;
  private rateLimitBuckets: Map<string, RateLimitBucket> = new Map();

  constructor(config: Partial<CIFConfig> = {}) {
    this.config = {
      maxRequestSize: config.maxRequestSize ?? 1048576, // 1MB
      maxResponseSize: config.maxResponseSize ?? 1048576,
      rateLimit: config.rateLimit ?? {
        windowMs: 60000,
        maxRequests: 100
      },
      piiPatterns: config.piiPatterns ?? [
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, // Email
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
        /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g // Credit card
      ],
      secretPatterns: config.secretPatterns ?? [
        /sk-[a-zA-Z0-9]{32,}/g, // API keys
        /AKIA[A-Z0-9]{16}/g, // AWS keys
        /-----BEGIN (RSA |DSA |EC )?PRIVATE KEY-----/g // Private keys
      ],
      auditLog: config.auditLog ?? true
    };
  }

  async initialize(): Promise<void> {
    console.log('🔥 Initializing CIF (Context Integrity Firewall)...');
  }

  async shutdown(): Promise<void> {
    console.log('🔥 Shutting down CIF...');
  }

  /**
   * Ingress processing - HARDENED to never throw
   * Returns deterministic deny response on any error
   */
  async ingress(context: IngressContext): Promise<IngressResult> {
    const violations: string[] = [];

    // HARDENED: Safely stringify payload (never throws)
    let payloadStr: string;
    try {
      payloadStr = JSON.stringify(context.payload);
    } catch (e) {
      // FAIL-CLOSED: Cannot stringify payload
      return {
        allowed: false,
        quarantined: true,
        violations: ['MALFORMED_REQUEST: Payload cannot be serialized to JSON'],
        rateLimitRemaining: 0
      };
    }

    // Check size limits
    if (payloadStr.length > this.config.maxRequestSize) {
      return {
        allowed: false,
        quarantined: false,
        violations: ['Request exceeds size limit'],
        rateLimitRemaining: 0
      };
    }

    // Check rate limit
    const rateLimitOk = this.checkRateLimit(context.clientId);
    if (!rateLimitOk) {
      return {
        allowed: false,
        quarantined: false,
        violations: ['Rate limit exceeded'],
        rateLimitRemaining: 0
      };
    }

    // Sanitize input (basic XSS/injection protection)
    const sanitized = this.sanitizeInput(payloadStr);

    // HARDENED: Safely parse sanitized payload (never throws)
    let sanitizedPayload: unknown;
    try {
      sanitizedPayload = JSON.parse(sanitized);
    } catch (e) {
      // FAIL-CLOSED: Sanitization produced invalid JSON
      return {
        allowed: false,
        quarantined: true,
        violations: ['MALFORMED_REQUEST: Sanitization produced invalid JSON'],
        rateLimitRemaining: 0
      };
    }

    // Check for quarantine patterns
    const quarantined = this.shouldQuarantine(sanitized);
    if (quarantined) {
      violations.push('Suspicious pattern detected');
    }

    const bucket = this.rateLimitBuckets.get(context.clientId);

    return {
      allowed: !quarantined,
      sanitizedPayload,
      quarantined,
      violations,
      rateLimitRemaining: bucket?.tokens ?? this.config.rateLimit.maxRequests
    };
  }

  /**
   * Estimate payload size before serialization (ATTACK 7 FIX)
   * Returns approximate byte size to prevent large payload timing attacks
   */
  private estimatePayloadSize(obj: unknown): number {
    const seen = new WeakSet();

    function sizeOf(value: unknown): number {
      if (value === null) return 4;
      if (value === undefined) return 0;
      if (typeof value === 'string') return value.length * 2; // Approx UTF-16
      if (typeof value === 'number') return 8;
      if (typeof value === 'boolean') return 4;

      if (typeof value === 'object') {
        // Prevent circular references
        if (seen.has(value as object)) return 0;
        seen.add(value as object);

        let size = 0;
        if (Array.isArray(value)) {
          for (const item of value) {
            size += sizeOf(item);
          }
        } else {
          for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            size += key.length * 2; // Key string size
            size += sizeOf(val);
          }
        }
        return size;
      }

      return 0;
    }

    return sizeOf(obj);
  }

  /**
   * Egress processing - HARDENED to never throw
   * Returns deterministic deny response on any error
   */
  async egress(context: EgressContext): Promise<EgressResult> {
    const violations: string[] = [];
    const leaksDetected: string[] = [];

    // ATTACK 7 FIX: Check size BEFORE serialization
    const estimatedSize = this.estimatePayloadSize(context.payload);
    if (estimatedSize > this.config.maxResponseSize) {
      return {
        allowed: false,
        violations: [`RESPONSE_TOO_LARGE: Estimated size ${estimatedSize} exceeds limit ${this.config.maxResponseSize}`],
        leaksDetected: []
      };
    }

    // HARDENED: Safely stringify payload (never throws)
    let payloadStr: string;
    try {
      payloadStr = JSON.stringify(context.payload);
    } catch (e) {
      // FAIL-CLOSED: Cannot stringify response payload
      return {
        allowed: false,
        violations: ['EGRESS_SERIALIZATION_FAILED: Response cannot be serialized to JSON'],
        leaksDetected: []
      };
    }

    // Double-check actual size after serialization (defense in depth)
    if (payloadStr.length > this.config.maxResponseSize) {
      return {
        allowed: false,
        violations: [`RESPONSE_TOO_LARGE: Actual size ${payloadStr.length} exceeds limit ${this.config.maxResponseSize}`],
        leaksDetected: []
      };
    }

    // Check for PII
    const piiFound = this.config.piiPatterns.some(pattern => {
      pattern.lastIndex = 0; // Reset stateful regex
      return pattern.test(payloadStr);
    });
    if (piiFound) {
      leaksDetected.push('PII detected');
    }

    // Check for secrets
    const secretsFound = this.config.secretPatterns.some(pattern => {
      pattern.lastIndex = 0; // Reset stateful regex
      return pattern.test(payloadStr);
    });
    if (secretsFound) {
      leaksDetected.push('Secrets detected');
      violations.push('Attempted secret leakage');
    }

    // Sanitize output if leaks detected
    let sanitized = payloadStr;
    if (leaksDetected.length > 0) {
      sanitized = this.sanitizeOutput(payloadStr);
    }

    // HARDENED: Safely parse sanitized output (never throws)
    let sanitizedPayload: unknown;
    try {
      sanitizedPayload = JSON.parse(sanitized);
    } catch (e) {
      // FAIL-CLOSED: Sanitization produced invalid JSON
      return {
        allowed: false,
        violations: ['EGRESS_PARSE_FAILED: Output sanitization produced invalid JSON'],
        leaksDetected
      };
    }

    if (this.config.auditLog && violations.length > 0) {
      console.log(`⚠️  CIF egress violations: ${violations.join(', ')}`);
    }

    return {
      allowed: violations.length === 0,
      sanitizedPayload,
      violations,
      leaksDetected
    };
  }

  private checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    let bucket = this.rateLimitBuckets.get(clientId);

    if (!bucket) {
      bucket = {
        tokens: this.config.rateLimit.maxRequests - 1,
        lastRefill: now
      };
      this.rateLimitBuckets.set(clientId, bucket);
      return true;
    }

    // Refill tokens based on time elapsed
    const elapsed = now - bucket.lastRefill;
    const refillAmount = Math.floor(elapsed / this.config.rateLimit.windowMs * this.config.rateLimit.maxRequests);

    if (refillAmount > 0) {
      bucket.tokens = Math.min(this.config.rateLimit.maxRequests, bucket.tokens + refillAmount);
      bucket.lastRefill = now;
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    return false;
  }

  private sanitizeInput(input: string): string {
    // Basic XSS/injection sanitization
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/onerror\s*=/gi, '');
  }

  private sanitizeOutput(output: string): string {
    // Redact PII
    let sanitized = output;
    for (const pattern of this.config.piiPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Redact secrets
    for (const pattern of this.config.secretPatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    return sanitized;
  }

  private shouldQuarantine(input: string): boolean {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /<iframe/gi,
      /eval\(/gi,
      /exec\(/gi,
      /\.\.\//g, // Path traversal
    ];

    return suspiciousPatterns.some(pattern => {
      pattern.lastIndex = 0; // Reset stateful regex
      return pattern.test(input);
    });
  }
}

export default CIF;
