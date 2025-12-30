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
      piiPatterns: config.piiPatterns ?? this.getDefaultPIIPatterns(),
      secretPatterns: config.secretPatterns ?? this.getDefaultSecretPatterns(),
      auditLog: config.auditLog ?? true
    };
  }

  private getDefaultPIIPatterns(): RegExp[] {
    return [
      // Email addresses
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,

      // US Social Security Numbers
      /\b\d{3}-\d{2}-\d{4}\b/g,
      /\b\d{9}\b/g, // SSN without dashes

      // Credit card numbers (various formats)
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
      /\b\d{13,19}\b/g, // Generic card number

      // US Phone numbers
      /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

      // IP addresses (can be PII in logs)
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

      // US Passport numbers
      /\b[A-Z]{1,2}\d{6,9}\b/g,

      // Driver's license (generic pattern)
      /\b[A-Z]{1,2}\d{5,8}\b/g,

      // Date of birth (various formats)
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
      /\b(19|20)\d{2}[/-](0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])\b/g,

      // US ZIP codes
      /\b\d{5}(-\d{4})?\b/g,

      // MAC addresses
      /\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\b/g
    ];
  }

  private getDefaultSecretPatterns(): RegExp[] {
    return [
      // OpenAI API keys
      /sk-[a-zA-Z0-9]{32,}/g,
      /sk-proj-[a-zA-Z0-9]{32,}/g,

      // AWS keys
      /AKIA[A-Z0-9]{16}/g,
      /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,

      // GitHub tokens
      /ghp_[A-Za-z0-9]{36}/g,
      /gho_[A-Za-z0-9]{36}/g,
      /ghu_[A-Za-z0-9]{36}/g,
      /ghs_[A-Za-z0-9]{36}/g,
      /ghr_[A-Za-z0-9]{36}/g,

      // Private keys
      /-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,

      // Google OAuth
      /ya29\.[A-Za-z0-9_-]{68,}/g,

      // Stripe keys
      /sk_live_[A-Za-z0-9]{24,}/g,
      /rk_live_[A-Za-z0-9]{24,}/g,

      // Slack tokens
      /xox[baprs]-[A-Za-z0-9-]{10,}/g,

      // Generic API key patterns
      /api[_-]?key[_-]?[:=]\s*['"]?[A-Za-z0-9]{16,}['"]?/gi,
      /secret[_-]?key[_-]?[:=]\s*['"]?[A-Za-z0-9]{16,}['"]?/gi,
      /auth[_-]?token[_-]?[:=]\s*['"]?[A-Za-z0-9]{16,}['"]?/gi,

      // JWT tokens
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,

      // Database connection strings
      /(?:mysql|postgres|mongodb):\/\/[^:]+:[^@]+@[^\/]+/gi,

      // Bearer tokens
      /bearer\s+[A-Za-z0-9_-]{20,}/gi
    ];
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
    // SQL injection patterns
    const sqlInjectionPatterns = [
      /(\bUNION\b.*\bSELECT\b)/gi,
      /(\bSELECT\b.*\bFROM\b.*\bWHERE\b)/gi,
      /(\bINSERT\b.*\bINTO\b.*\bVALUES\b)/gi,
      /(\bDELETE\b.*\bFROM\b)/gi,
      /(\bDROP\b.*\bTABLE\b)/gi,
      /(\bUPDATE\b.*\bSET\b)/gi,
      /(\bEXEC\b|\bEXECUTE\b).*\(/gi,
      /(--|#|\/\*|\*\/)/g, // SQL comments
      /(\bOR\b\s+\d+\s*=\s*\d+)/gi, // Classic OR 1=1
      /(\bAND\b\s+\d+\s*=\s*\d+)/gi,
      /'\s*(OR|AND)\s+'[^']*'\s*=/gi,
      /(\bxp_cmdshell\b)/gi,
      /(\bsp_executesql\b)/gi
    ];

    // Command injection patterns
    const commandInjectionPatterns = [
      /[;&|]\s*(rm|cat|ls|pwd|wget|curl|chmod|chown)/gi,
      /`[^`]*`/g, // Backticks
      /\$\([^)]*\)/g, // Command substitution
      />\s*\/dev\/null/gi,
      /\|\s*sh/gi,
      /\|\s*bash/gi,
      /\|\s*zsh/gi,
      /(nc|netcat)\s+-/gi,
      /\/bin\/(sh|bash|zsh|dash)/gi,
      /(python|perl|ruby|php)\s+-c/gi
    ];

    // XSS and injection patterns
    const xssPatterns = [
      /<script[^>]*>/gi,
      /<iframe[^>]*>/gi,
      /<object[^>]*>/gi,
      /<embed[^>]*>/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi, // Event handlers
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi
    ];

    // Path traversal patterns
    const pathTraversalPatterns = [
      /\.\.\//g,
      /\.\.%2[Ff]/g, // URL encoded ../
      /\.\.\\/g, // Windows style
      /%2e%2e%2[Ff]/gi, // Double encoded
      /\/etc\/passwd/gi,
      /\/etc\/shadow/gi,
      /C:\\Windows\\System32/gi
    ];

    // LDAP injection
    const ldapInjectionPatterns = [
      /\(\|/g,
      /\(\&/g,
      /\(\!/g,
      /\*\)\(/g
    ];

    // NoSQL injection
    const nosqlInjectionPatterns = [
      /\$ne/gi,
      /\$gt/gi,
      /\$lt/gi,
      /\$regex/gi,
      /\$where/gi
    ];

    // Server-Side Template Injection (SSTI)
    const sstiPatterns = [
      /\{\{.*\}\}/g,
      /\{%.*%\}/g,
      /<\$.*\$>/g
    ];

    // XXE (XML External Entity)
    const xxePatterns = [
      /<!ENTITY/gi,
      /<!DOCTYPE.*SYSTEM/gi
    ];

    const allPatterns = [
      ...sqlInjectionPatterns,
      ...commandInjectionPatterns,
      ...xssPatterns,
      ...pathTraversalPatterns,
      ...ldapInjectionPatterns,
      ...nosqlInjectionPatterns,
      ...sstiPatterns,
      ...xxePatterns
    ];

    return allPatterns.some(pattern => pattern.test(input));
  }
}

export default CIF;
