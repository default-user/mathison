/**
 * CIF Adversarial Tests
 * Verifies boundary protection against attacks
 *
 * SPEC REQUIREMENT (P1 Conformance):
 * - Prompt injection attempts → quarantined
 * - Path traversal → quarantined
 * - Secrets in payload → egress blocked with CIF_QUARANTINED
 * - Oversized bodies → rejected with size limit error
 * - Rate limit determinism → same actor, same window → consistent block
 */

import { CIF } from 'mathison-governance/dist/cif';

describe('CIF Adversarial Tests', () => {
  let cif: CIF;

  beforeEach(async () => {
    cif = new CIF({
      maxRequestSize: 1024, // 1KB for testing
      maxResponseSize: 1024,
      rateLimit: {
        windowMs: 1000, // 1 second window
        maxRequests: 5
      }
    });
    await cif.initialize();
  });

  describe('Prompt Injection Protection', () => {
    it('should quarantine eval() injection attempts', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-1',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'eval(maliciousCode)',
          in: 'test.md'
        },
        timestamp: Date.now()
      });

      expect(result.quarantined).toBe(true);
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Suspicious pattern detected');
    });

    it('should quarantine exec() injection attempts', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-2',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'normal',
          in: 'exec(rm -rf /)'
        },
        timestamp: Date.now()
      });

      expect(result.quarantined).toBe(true);
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Suspicious pattern detected');
    });

    it('should quarantine iframe injection attempts', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-3',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'normal',
          content: '<iframe src="https://evil.com"></iframe>'
        },
        timestamp: Date.now()
      });

      expect(result.quarantined).toBe(true);
      expect(result.allowed).toBe(false);
    });

    it('should sanitize XSS attempts in input', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-4',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'normal',
          content: '<script>alert("XSS")</script>'
        },
        timestamp: Date.now()
      });

      // Should sanitize even if not quarantined
      const sanitized = result.sanitizedPayload as any;
      expect(JSON.stringify(sanitized)).not.toContain('<script>');
    });

    it('should sanitize javascript: protocol attempts', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-5',
        endpoint: '/v1/jobs/run',
        payload: {
          link: 'javascript:alert(1)'
        },
        timestamp: Date.now()
      });

      const sanitized = result.sanitizedPayload as any;
      expect(JSON.stringify(sanitized)).not.toContain('javascript:');
    });
  });

  describe('Path Traversal Protection', () => {
    it('should quarantine ../ path traversal attempts', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-6',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'tiriti-audit',
          in: '../../../etc/passwd'
        },
        timestamp: Date.now()
      });

      expect(result.quarantined).toBe(true);
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Suspicious pattern detected');
    });

    it('should quarantine multiple path traversal sequences', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-7',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'normal',
          outdir: '../../sensitive/data'
        },
        timestamp: Date.now()
      });

      expect(result.quarantined).toBe(true);
      expect(result.allowed).toBe(false);
    });

    it('should allow safe relative paths without traversal', async () => {
      const result = await cif.ingress({
        clientId: 'safe-user-1',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'normal',
          in: 'docs/tiriti.md',
          outdir: './output/reports'
        },
        timestamp: Date.now()
      });

      expect(result.quarantined).toBe(false);
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Secret Leak Prevention', () => {
    it('should detect API key in egress payload', async () => {
      const result = await cif.egress({
        clientId: 'user-1',
        endpoint: '/v1/jobs/run',
        payload: {
          result: 'success',
          apiKey: 'sk-1234567890abcdefghijklmnopqrstuv'
        }
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Attempted secret leakage');
      expect(result.leaksDetected).toContain('Secrets detected');
    });

    it('should detect AWS key in egress payload', async () => {
      const result = await cif.egress({
        clientId: 'user-2',
        endpoint: '/v1/jobs/status',
        payload: {
          status: 'completed',
          awsKey: 'AKIAIOSFODNN7EXAMPLE'
        }
      });

      expect(result.allowed).toBe(false);
      expect(result.leaksDetected).toContain('Secrets detected');
    });

    it('should detect private key in egress payload', async () => {
      const result = await cif.egress({
        clientId: 'user-3',
        endpoint: '/v1/jobs/receipts',
        payload: {
          receipt: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgk...'
        }
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Attempted secret leakage');
    });

    it('should redact secrets in sanitized output', async () => {
      const result = await cif.egress({
        clientId: 'user-4',
        endpoint: '/v1/jobs/run',
        payload: {
          message: 'API key is sk-abc123def456ghi789jkl012mno345pqr',
          status: 'ok'
        }
      });

      const sanitized = result.sanitizedPayload as any;
      expect(JSON.stringify(sanitized)).toContain('[REDACTED]');
      expect(JSON.stringify(sanitized)).not.toContain('sk-abc123');
    });

    it('should allow safe output without secrets', async () => {
      const result = await cif.egress({
        clientId: 'user-5',
        endpoint: '/v1/jobs/run',
        payload: {
          status: 'completed',
          job_id: 'job-123',
          result: 'Audit passed'
        }
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.leaksDetected).toHaveLength(0);
    });
  });

  describe('PII Detection', () => {
    it('should detect email addresses in egress', async () => {
      const result = await cif.egress({
        clientId: 'user-6',
        endpoint: '/v1/jobs/run',
        payload: {
          contact: 'user@example.com',
          status: 'ok'
        }
      });

      expect(result.leaksDetected).toContain('PII detected');
    });

    it('should detect SSN in egress', async () => {
      const result = await cif.egress({
        clientId: 'user-7',
        endpoint: '/v1/jobs/run',
        payload: {
          ssn: '123-45-6789',
          name: 'Test User'
        }
      });

      expect(result.leaksDetected).toContain('PII detected');
    });

    it('should detect credit card numbers in egress', async () => {
      const result = await cif.egress({
        clientId: 'user-8',
        endpoint: '/v1/jobs/run',
        payload: {
          card: '4111 1111 1111 1111',
          status: 'payment'
        }
      });

      expect(result.leaksDetected).toContain('PII detected');
    });

    it('should redact PII in sanitized output', async () => {
      const result = await cif.egress({
        clientId: 'user-9',
        endpoint: '/v1/jobs/run',
        payload: {
          email: 'sensitive@example.com',
          message: 'User registration'
        }
      });

      const sanitized = result.sanitizedPayload as any;
      expect(JSON.stringify(sanitized)).toContain('[REDACTED]');
      expect(JSON.stringify(sanitized)).not.toContain('sensitive@');
    });
  });

  describe('Size Limit Enforcement', () => {
    it('should reject oversized ingress payload', async () => {
      const largePayload = {
        job: 'normal',
        data: 'x'.repeat(2000) // 2KB, exceeds 1KB limit
      };

      const result = await cif.ingress({
        clientId: 'user-10',
        endpoint: '/v1/jobs/run',
        payload: largePayload,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Request exceeds size limit');
    });

    it('should reject oversized egress payload', async () => {
      const largePayload = {
        result: 'success',
        output: 'y'.repeat(2000) // 2KB, exceeds 1KB limit
      };

      const result = await cif.egress({
        clientId: 'user-11',
        endpoint: '/v1/jobs/run',
        payload: largePayload
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Response exceeds size limit');
    });

    it('should allow payloads within size limits', async () => {
      const safePayload = {
        job: 'tiriti-audit',
        in: 'docs/tiriti.md',
        outdir: 'output'
      };

      const result = await cif.ingress({
        clientId: 'user-12',
        endpoint: '/v1/jobs/run',
        payload: safePayload,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Rate Limit Determinism', () => {
    it('should allow requests within rate limit', async () => {
      const clientId = 'rate-test-1';

      // Send 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        const result = await cif.ingress({
          clientId,
          endpoint: '/v1/jobs/run',
          payload: { job: `test-${i}` },
          timestamp: Date.now()
        });

        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', async () => {
      const clientId = 'rate-test-2';

      // Send 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        await cif.ingress({
          clientId,
          endpoint: '/v1/jobs/run',
          payload: { job: `test-${i}` },
          timestamp: Date.now()
        });
      }

      // 6th request should be blocked
      const result = await cif.ingress({
        clientId,
        endpoint: '/v1/jobs/run',
        payload: { job: 'test-overflow' },
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Rate limit exceeded');
      expect(result.rateLimitRemaining).toBe(0);
    });

    it('should refill rate limit tokens after window expires', async () => {
      const clientId = 'rate-test-3';

      // Exhaust rate limit
      for (let i = 0; i < 5; i++) {
        await cif.ingress({
          clientId,
          endpoint: '/v1/jobs/run',
          payload: { job: `test-${i}` },
          timestamp: Date.now()
        });
      }

      // Verify blocked
      let result = await cif.ingress({
        clientId,
        endpoint: '/v1/jobs/run',
        payload: { job: 'test-blocked' },
        timestamp: Date.now()
      });
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds

      // Should be allowed again
      result = await cif.ingress({
        clientId,
        endpoint: '/v1/jobs/run',
        payload: { job: 'test-refilled' },
        timestamp: Date.now()
      });
      expect(result.allowed).toBe(true);
    });

    it('should isolate rate limits by client ID', async () => {
      const client1 = 'rate-test-4a';
      const client2 = 'rate-test-4b';

      // Exhaust client1's limit
      for (let i = 0; i < 5; i++) {
        await cif.ingress({
          clientId: client1,
          endpoint: '/v1/jobs/run',
          payload: { job: `test-${i}` },
          timestamp: Date.now()
        });
      }

      // client1 blocked
      const result1 = await cif.ingress({
        clientId: client1,
        endpoint: '/v1/jobs/run',
        payload: { job: 'test-overflow' },
        timestamp: Date.now()
      });
      expect(result1.allowed).toBe(false);

      // client2 still allowed
      const result2 = await cif.ingress({
        clientId: client2,
        endpoint: '/v1/jobs/run',
        payload: { job: 'test-ok' },
        timestamp: Date.now()
      });
      expect(result2.allowed).toBe(true);
    });

    it('should provide consistent blocking for same actor in same window', async () => {
      const clientId = 'rate-test-5';

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        await cif.ingress({
          clientId,
          endpoint: '/v1/jobs/run',
          payload: { job: `test-${i}` },
          timestamp: Date.now()
        });
      }

      // Multiple attempts should all be blocked consistently
      const results: boolean[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await cif.ingress({
          clientId,
          endpoint: '/v1/jobs/run',
          payload: { job: `test-overflow-${i}` },
          timestamp: Date.now()
        });
        results.push(result.allowed);
      }

      // All should be consistently blocked
      expect(results.every(allowed => allowed === false)).toBe(true);
    });
  });

  describe('Combined Attack Scenarios', () => {
    it('should block request with multiple violations', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-combo-1',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'eval(malicious)',
          in: '../../../etc/passwd',
          content: '<iframe src="evil.com"></iframe>'
        },
        timestamp: Date.now()
      });

      expect(result.quarantined).toBe(true);
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Suspicious pattern detected');
    });

    it('should handle oversized malicious payload', async () => {
      const largeAttack = {
        job: 'eval(code)',
        data: '../' + 'x'.repeat(2000)
      };

      const result = await cif.ingress({
        clientId: 'attacker-combo-2',
        endpoint: '/v1/jobs/run',
        payload: largeAttack,
        timestamp: Date.now()
      });

      // Size check happens first
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Request exceeds size limit');
    });
  });

  describe('CIF_QUARANTINED Reason Code', () => {
    it('should use consistent violation messages', async () => {
      const result = await cif.ingress({
        clientId: 'attacker-8',
        endpoint: '/v1/jobs/run',
        payload: {
          job: 'normal',
          in: '../../../etc/passwd'
        },
        timestamp: Date.now()
      });

      expect(result.violations).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toBe('Suspicious pattern detected');
    });
  });
});
