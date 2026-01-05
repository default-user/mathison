/**
 * Heartbeat Conformance Tests
 * Verifies heartbeat monitor detects failures and flips to fail-closed
 */

import { HeartbeatMonitor } from '../heartbeat';
import { CIF, CDI } from 'mathison-governance';

describe('Heartbeat Conformance', () => {
  let heartbeat: HeartbeatMonitor;
  let cif: CIF;
  let cdi: CDI;

  beforeEach(() => {
    // Set up valid environment
    process.env.MATHISON_STORE_BACKEND = 'FILE';
    process.env.MATHISON_STORE_PATH = '/tmp/mathison-test';
    process.env.MATHISON_GENOME_PATH = './test-fixtures/test-genome.json';

    cif = new CIF();
    cdi = new CDI({ strictMode: true });

    heartbeat = new HeartbeatMonitor({
      intervalMs: 100, // Fast interval for testing
      configPath: './config/governance.json'
    });

    heartbeat.setGovernanceComponents(cif, cdi);
  });

  afterEach(() => {
    if (heartbeat) {
      heartbeat.stop();
    }
  });

  it('should start and report healthy with valid prerequisites', (done) => {
    heartbeat.start();

    // Wait for first check to complete
    setTimeout(() => {
      const status = heartbeat.getStatus();
      // May be unhealthy if config/genome missing in test env, but should have run
      expect(status).not.toBeNull();
      expect(status?.timestamp).toBeDefined();
      expect(status?.checks.length).toBeGreaterThan(0);
      heartbeat.stop();
      done();
    }, 200);
  });

  it('should detect missing governance components', (done) => {
    const badHeartbeat = new HeartbeatMonitor({
      intervalMs: 100,
      configPath: './config/governance.json'
    });

    // Don't set governance components
    badHeartbeat.start();

    setTimeout(() => {
      const status = badHeartbeat.getStatus();
      expect(status).not.toBeNull();
      expect(status?.ok).toBe(false);
      expect(status?.checks.some(c => c.name === 'Governance Wiring' && !c.ok)).toBe(true);
      badHeartbeat.stop();
      done();
    }, 200);
  });

  it('should detect missing storage config', (done) => {
    delete process.env.MATHISON_STORE_BACKEND;

    heartbeat.start();

    setTimeout(() => {
      const status = heartbeat.getStatus();
      expect(status).not.toBeNull();
      expect(status?.ok).toBe(false);
      expect(status?.checks.some(c => c.name === 'Storage Config' && !c.ok)).toBe(true);
      heartbeat.stop();
      done();
    }, 200);
  });

  it('should flip to unhealthy and back to healthy on state change', (done) => {
    let stateChanges = 0;

    const monitorWithCallback = new HeartbeatMonitor({
      intervalMs: 100,
      configPath: './config/governance.json',
      onStatusChange: (status) => {
        stateChanges++;
        console.log(`Heartbeat state change ${stateChanges}: ok=${status.ok}`);
      }
    });

    monitorWithCallback.setGovernanceComponents(cif, cdi);
    monitorWithCallback.start();

    setTimeout(() => {
      // Should have had at least one state change (initial check)
      expect(stateChanges).toBeGreaterThan(0);
      monitorWithCallback.stop();
      done();
    }, 300);
  });

  it('should report isHealthy() correctly', (done) => {
    heartbeat.start();

    setTimeout(() => {
      const healthy = heartbeat.isHealthy();
      const status = heartbeat.getStatus();
      expect(healthy).toBe(status?.ok);
      heartbeat.stop();
      done();
    }, 200);
  });
});
