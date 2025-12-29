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

  async ingress(context: IngressContext): Promise<IngressResult> {
    const violations: string[] = [];
    const payloadStr = JSON.stringify(context.payload);

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

    // Check for quarantine patterns
    const quarantined = this.shouldQuarantine(sanitized);
    if (quarantined) {
      violations.push('Suspicious pattern detected');
    }

    const bucket = this.rateLimitBuckets.get(context.clientId);

    return {
      allowed: !quarantined,
      sanitizedPayload: JSON.parse(sanitized),
      quarantined,
      violations,
      rateLimitRemaining: bucket?.tokens ?? this.config.rateLimit.maxRequests
    };
  }

  async egress(context: EgressContext): Promise<EgressResult> {
    const violations: string[] = [];
    const leaksDetected: string[] = [];
    const payloadStr = JSON.stringify(context.payload);

    // Check size limits
    if (payloadStr.length > this.config.maxResponseSize) {
      return {
        allowed: false,
        violations: ['Response exceeds size limit'],
        leaksDetected: []
      };
    }

    // Check for PII
    const piiFound = this.config.piiPatterns.some(pattern => pattern.test(payloadStr));
    if (piiFound) {
      leaksDetected.push('PII detected');
    }

    // Check for secrets
    const secretsFound = this.config.secretPatterns.some(pattern => pattern.test(payloadStr));
    if (secretsFound) {
      leaksDetected.push('Secrets detected');
      violations.push('Attempted secret leakage');
    }

    // Sanitize output if leaks detected
    let sanitized = payloadStr;
    if (leaksDetected.length > 0) {
      sanitized = this.sanitizeOutput(payloadStr);
    }

    if (this.config.auditLog && violations.length > 0) {
      console.log(`⚠️  CIF egress violations: ${violations.join(', ')}`);
    }

    return {
      allowed: violations.length === 0,
      sanitizedPayload: JSON.parse(sanitized),
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

    return suspiciousPatterns.some(pattern => pattern.test(input));
  }
}

export default CIF;
