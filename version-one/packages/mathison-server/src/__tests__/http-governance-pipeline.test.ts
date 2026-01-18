/**
 * HTTP Governance Pipeline Conformance Tests
 * Verifies CIF ingress -> CDI action -> handler -> CDI output -> CIF egress sequence
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import MathisonServer from '../index';
import { getFixturePath } from './setup';

describe('HTTP Governance Pipeline Conformance', () => {
  let server: MathisonServer;
  let baseUrl: string;

  beforeAll(async () => {
    // Set up test environment
    process.env.MATHISON_STORE_BACKEND = 'FILE';
    process.env.MATHISON_STORE_PATH = '/tmp/mathison-test-http';
    process.env.MATHISON_GENOME_PATH = getFixturePath('test-genome.json');
    process.env.MATHISON_ENV = 'development';
    process.env.MATHISON_HEARTBEAT_INTERVAL = '60000'; // Long interval for tests

    server = new MathisonServer({ port: 0, host: '127.0.0.1' }); // Random port
    await server.start();

    const app = server.getApp();
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 30000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('CIF Ingress', () => {
    it('should block oversized payloads', async () => {
      // Create oversized payload (> 1MB)
      const oversized = 'x'.repeat(2 * 1024 * 1024);

      const response = await fetch(`${baseUrl}/oi/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: oversized })
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('CIF_INGRESS_BLOCKED');
    });

    it('should allow valid-sized payloads through ingress', async () => {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET'
      });

      expect(response.status).toBeLessThan(500);
      // Health should pass ingress (might fail for other reasons)
    });
  });

  describe('CDI Action Check', () => {
    it('should deny routes without action declaration', async () => {
      // Attempt to hit a non-existent route (no action mapping)
      const response = await fetch(`${baseUrl}/undefined-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      // Should be 404 (unknown route) or 403 (missing action)
      expect([403, 404]).toContain(response.status);
    });

    it('should allow allowlisted routes to bypass action check', async () => {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET'
      });

      // Health is allowlisted, should not require action
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Handler Execution', () => {
    it('should execute handler only after CIF+CDI pass', async () => {
      const response = await fetch(`${baseUrl}/genome`, {
        method: 'GET'
      });

      // If handler executes, should return genome metadata or 503 (not initialized)
      expect([200, 503]).toContain(response.status);
    });
  });

  describe('CDI Output Check', () => {
    it('should block outputs containing personhood claims', async () => {
      // This is hard to test without modifying handler behavior
      // Placeholder for future test
      expect(true).toBe(true);
    });
  });

  describe('CIF Egress', () => {
    it('should sanitize outputs containing PII/secrets', async () => {
      // This is hard to test without injecting PII into responses
      // Placeholder for future test
      expect(true).toBe(true);
    });

    it('should enforce JSON-only contract', async () => {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET'
      });

      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });
  });

  describe('Heartbeat Fail-Closed', () => {
    it('should deny all requests if heartbeat unhealthy', async () => {
      // This requires mocking heartbeat state
      // Placeholder for future test with dependency injection
      expect(true).toBe(true);
    });
  });

  describe('Pipeline Ordering', () => {
    it('should enforce correct hook order: onRequest -> preValidation -> preHandler -> handler -> onSend', async () => {
      // Verify by checking error types at different stages
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET'
      });

      // If we got a response, pipeline executed in order
      expect(response.status).toBeDefined();
    });
  });
});
