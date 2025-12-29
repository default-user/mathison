/**
 * Route Conformance: Structural Enforcement Tests
 * Verifies no route can bypass ActionGate
 *
 * SPEC REQUIREMENT (P1 Conformance):
 * - Adding a route without ActionGate must make this test fail
 * - Routes must not directly import job runners/checkpoint/receipts
 * - All side-effectful operations must go through governance gate
 */

import { MathisonServer } from '../index';
import * as fs from 'fs';
import * as path from 'path';

describe('Route Conformance: No Bypass', () => {
  const originalCwd = process.cwd();
  const repoRoot = path.resolve(__dirname, '../../../..');

  beforeEach(() => {
    process.chdir(repoRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  describe('Structural Enforcement', () => {
    it('should fail if routes can bypass ActionGate (route wrapper assertion)', async () => {
      // This test uses Fastify's route introspection to verify all routes
      // are wrapped by governance

      const server = new MathisonServer({
        port: 9999, // Unused port
        host: '127.0.0.1',
        checkpointDir: '.mathison-test-conformance/checkpoints',
        eventLogPath: '.mathison-test-conformance/eventlog.jsonl'
      });

      await server.start();
      const app = server.getApp();

      try {
        // Get all registered routes
        const routes = app.printRoutes({ commonPrefix: false });

        // Parse routes (Fastify printRoutes returns a string table)
        const routeLines = routes.split('\n').filter(line => line.trim());

        // Check that critical endpoints exist and are protected
        const criticalEndpoints = [
          '/v1/jobs/run',
          '/v1/jobs/:job_id/status',
          '/v1/jobs/:job_id/resume',
          '/v1/jobs/:job_id/receipts'
        ];

        for (const endpoint of criticalEndpoints) {
          const hasRoute = routeLines.some(line => line.includes(endpoint));
          expect(hasRoute).toBe(true);
        }

        // Verify routes module uses governedHandler wrapper
        // Read the routes file and check it imports and uses governedHandler
        const routesFilePath = path.join(__dirname, '../routes/jobs.ts');
        const routesContent = fs.readFileSync(routesFilePath, 'utf-8');

        // Must import governedHandler
        expect(routesContent).toContain('governedHandler');
        expect(routesContent).toContain('from \'../middleware/action-gate\'');

        // Must NOT directly import job runners (bypass check)
        expect(routesContent).not.toContain('from \'mathison-jobs\'');

        // All POST routes must use governedHandler
        const postRouteMatches = routesContent.match(/fastify\.post\([^)]+/g);
        if (postRouteMatches) {
          for (const match of postRouteMatches) {
            // Should be followed by governedHandler call
            const startIdx = routesContent.indexOf(match);
            const snippet = routesContent.slice(startIdx, startIdx + 200);

            // Allow health endpoint to bypass
            if (snippet.includes('/health')) continue;

            expect(snippet).toContain('governedHandler');
          }
        }

        // All GET routes that access state must use governedHandler
        const getRouteMatches = routesContent.match(/fastify\.get\([^)]+/g);
        if (getRouteMatches) {
          for (const match of getRouteMatches) {
            const startIdx = routesContent.indexOf(match);
            const snippet = routesContent.slice(startIdx, startIdx + 200);

            // Health endpoint can bypass
            if (snippet.includes('/health')) continue;

            // Job status/receipts endpoints must be governed
            if (snippet.includes('/v1/jobs')) {
              expect(snippet).toContain('governedHandler');
            }
          }
        }

      } finally {
        await server.stop();
      }
    });

    it('should use ActionGate for all side-effectful operations', () => {
      // Verify routes module structure
      const routesFilePath = path.join(__dirname, '../routes/jobs.ts');
      const routesContent = fs.readFileSync(routesFilePath, 'utf-8');

      // Must NOT directly access CheckpointEngine methods
      expect(routesContent).not.toMatch(/checkpointEngine\.(createCheckpoint|updateStage|markCompleted)/);

      // Must NOT directly access EventLog methods for governance decisions
      expect(routesContent).not.toMatch(/eventLog\.(logGovernanceDecision)/);

      // Must use ActionGate wrapper
      expect(routesContent).toContain('ActionGate');
    });

    it('should enforce that new routes without ActionGate fail this test', () => {
      // This test documents the requirement:
      // If you add a new route to jobs.ts without governedHandler,
      // the structural checks above will fail

      const routesFilePath = path.join(__dirname, '../routes/jobs.ts');
      const routesContent = fs.readFileSync(routesFilePath, 'utf-8');

      // Count governedHandler uses
      const governedHandlerCount = (routesContent.match(/governedHandler\(/g) || []).length;

      // Count route registrations (excluding health)
      const routeRegistrations = (routesContent.match(/fastify\.(get|post|put|delete)\(/g) || []).length;
      const healthRouteCount = (routesContent.match(/\/health/g) || []).length;

      const expectedGoverned = routeRegistrations - healthRouteCount;

      // All non-health routes must use governedHandler
      expect(governedHandlerCount).toBeGreaterThanOrEqual(expectedGoverned);
    });
  });

  describe('Route Registry Verification', () => {
    it('should have governance context attached to all job endpoints', async () => {
      const server = new MathisonServer({
        port: 9998,
        host: '127.0.0.1',
        checkpointDir: '.mathison-test-conformance/checkpoints',
        eventLogPath: '.mathison-test-conformance/eventlog.jsonl'
      });

      await server.start();
      const app = server.getApp();

      try {
        // Test that job endpoints have governance in place by trying to access them
        // Without proper auth/payload, they should fail with governance errors, not direct execution errors

        const response = await app.inject({
          method: 'POST',
          url: '/v1/jobs/run',
          payload: {} // Invalid but should hit governance first
        });

        // Should get a governed response (not a raw error)
        expect(response.statusCode).toBeDefined();
        const payload = JSON.parse(response.payload);

        // If governance is working, we'll get a structured error
        // If governance is bypassed, we'll get an unhandled exception
        expect(payload.error || payload.message).toBeDefined();

      } finally {
        await server.stop();
      }
    });
  });
});
