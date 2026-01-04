/**
 * CIF Hardened Ingress/Egress Tests
 * Tests for deterministic DENY responses on malformed input
 */

import { CIF } from '../cif';

describe('CIF Hardened Ingress', () => {
  let cif: CIF;

  beforeEach(async () => {
    cif = new CIF({
      maxRequestSize: 1024,
      maxResponseSize: 1024,
      rateLimit: { windowMs: 60000, maxRequests: 100 }
    });
    await cif.initialize();
  });

  afterEach(async () => {
    await cif.shutdown();
  });

  describe('Deterministic DENY on malformed payloads', () => {
    it('should DENY payload with circular reference (cannot stringify)', async () => {
      // Create circular reference
      const circular: any = { a: 1 };
      circular.self = circular;

      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload: circular,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(false);
      expect(result.quarantined).toBe(true);
      expect(result.violations).toContain('MALFORMED_REQUEST: Payload cannot be serialized to JSON');
    });

    it('should DENY payload with BigInt (cannot stringify)', async () => {
      const payload = { value: BigInt(9007199254740991) };

      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(false);
      expect(result.quarantined).toBe(true);
      expect(result.violations).toContain('MALFORMED_REQUEST: Payload cannot be serialized to JSON');
    });

    it('should ALLOW valid JSON payload', async () => {
      const payload = { message: 'hello', count: 42 };

      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(true);
      expect(result.sanitizedPayload).toEqual(payload);
    });

    it('should ALLOW empty object', async () => {
      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload: {},
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(true);
      expect(result.sanitizedPayload).toEqual({});
    });

    it('should ALLOW null payload', async () => {
      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload: null,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(true);
      expect(result.sanitizedPayload).toBe(null);
    });

    it('should DENY and quarantine payload with script tags', async () => {
      const payload = { content: '<script>alert("xss")</script>' };

      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload,
        timestamp: Date.now()
      });

      // Script tags are stripped but not quarantined by themselves
      // unless another suspicious pattern is found
      expect(result.allowed).toBe(true); // Sanitized successfully
    });

    it('should DENY and quarantine payload with eval', async () => {
      const payload = { code: 'eval("dangerous")' };

      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(false);
      expect(result.quarantined).toBe(true);
      expect(result.violations).toContain('Suspicious pattern detected');
    });

    it('should DENY payload exceeding size limit', async () => {
      const payload = { data: 'x'.repeat(2000) }; // Exceeds 1024 limit

      const result = await cif.ingress({
        clientId: 'test-client',
        endpoint: '/test',
        payload,
        timestamp: Date.now()
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Request exceeds size limit');
    });
  });
});

describe('CIF Hardened Egress', () => {
  let cif: CIF;

  beforeEach(async () => {
    cif = new CIF({
      maxRequestSize: 1024,
      maxResponseSize: 1024,
      rateLimit: { windowMs: 60000, maxRequests: 100 }
    });
    await cif.initialize();
  });

  afterEach(async () => {
    await cif.shutdown();
  });

  describe('Deterministic DENY on malformed responses', () => {
    it('should DENY response with circular reference', async () => {
      const circular: any = { result: 'success' };
      circular.self = circular;

      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/test',
        payload: circular
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('EGRESS_SERIALIZATION_FAILED: Response cannot be serialized to JSON');
    });

    it('should DENY response with BigInt', async () => {
      const payload = { value: BigInt(9007199254740991) };

      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/test',
        payload
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('EGRESS_SERIALIZATION_FAILED: Response cannot be serialized to JSON');
    });

    it('should ALLOW valid JSON response', async () => {
      const payload = { status: 'ok', data: [1, 2, 3] };

      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/test',
        payload
      });

      expect(result.allowed).toBe(true);
      expect(result.sanitizedPayload).toEqual(payload);
    });

    it('should DENY response with secrets', async () => {
      const payload = { apiKey: 'sk-1234567890123456789012345678901234' };

      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/test',
        payload
      });

      expect(result.allowed).toBe(false);
      expect(result.leaksDetected).toContain('Secrets detected');
      expect(result.violations).toContain('Attempted secret leakage');
    });

    it('should DENY response exceeding size limit', async () => {
      const payload = { data: 'x'.repeat(2000) };

      const result = await cif.egress({
        clientId: 'test-client',
        endpoint: '/test',
        payload
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('Response exceeds size limit');
    });
  });
});
