/**
 * Mathison SDK Client Tests
 */

import { MathisonClient } from '../client';
import { GovernanceError } from '../types';

describe('MathisonClient', () => {
  let client: MathisonClient;

  beforeEach(() => {
    client = new MathisonClient({
      baseURL: 'http://localhost:3000'
    });
  });

  describe('constructor', () => {
    it('should create client with default timeout', () => {
      expect(client).toBeInstanceOf(MathisonClient);
      expect(client.getBaseURL()).toBe('http://localhost:3000');
    });

    it('should create client with custom timeout', () => {
      const customClient = new MathisonClient({
        baseURL: 'http://localhost:3000',
        timeout: 5000
      });
      expect(customClient).toBeInstanceOf(MathisonClient);
    });

    it('should create client with custom headers', () => {
      const customClient = new MathisonClient({
        baseURL: 'http://localhost:3000',
        headers: { 'X-Custom': 'header' }
      });
      expect(customClient).toBeInstanceOf(MathisonClient);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate unique idempotency keys', () => {
      const key1 = MathisonClient.generateIdempotencyKey();
      const key2 = MathisonClient.generateIdempotencyKey();

      expect(key1).toBeTruthy();
      expect(key2).toBeTruthy();
      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe('getBaseURL', () => {
    it('should return the configured base URL', () => {
      expect(client.getBaseURL()).toBe('http://localhost:3000');
    });
  });

  // Integration tests would require a running server
  // These are placeholder tests demonstrating the SDK structure

  describe('health (integration)', () => {
    it('should check server health', async () => {
      // This test requires a running Mathison server
      // Mock or skip in unit tests
      expect(client.health).toBeDefined();
    });
  });

  describe('memory operations (integration)', () => {
    it('should support node creation with idempotency', async () => {
      // This test requires a running Mathison server
      expect(client.createNode).toBeDefined();
    });

    it('should support edge creation with idempotency', async () => {
      // This test requires a running Mathison server
      expect(client.createEdge).toBeDefined();
    });
  });
});
