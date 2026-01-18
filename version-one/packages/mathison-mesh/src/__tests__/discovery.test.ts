/**
 * Mesh Discovery Tests
 * Tests peer discovery and simulated discovery
 */

import {
  DiscoveryService,
  SimulatedDiscovery,
  DEFAULT_DISCOVERY_CONFIG,
  DiscoveredPeer
} from '../discovery';
import { MeshNodeInfo } from '../index';

describe('Mesh Discovery', () => {
  const createTestNode = (id: string): MeshNodeInfo => ({
    nodeId: id,
    publicKey: Buffer.from(id.repeat(8)).toString('hex').slice(0, 64),
    capabilities: {
      compute: 50,
      memory: 1024
    }
  });

  describe('DiscoveryService', () => {
    let discovery: DiscoveryService;

    beforeEach(() => {
      discovery = new DiscoveryService(createTestNode('test-node'), {
        enabled: false // Start with disabled for unit tests
      });
    });

    afterEach(async () => {
      await discovery.stop();
    });

    it('is disabled by default', () => {
      expect(discovery.isRunning()).toBe(false);
    });

    it('does not start when disabled', async () => {
      await discovery.start();
      expect(discovery.isRunning()).toBe(false);
    });

    it('has default configuration', () => {
      expect(DEFAULT_DISCOVERY_CONFIG.enabled).toBe(false);
      expect(DEFAULT_DISCOVERY_CONFIG.mode).toBe('broadcast');
      expect(DEFAULT_DISCOVERY_CONFIG.broadcastPort).toBe(41234);
      expect(DEFAULT_DISCOVERY_CONFIG.maxPeers).toBe(20);
    });

    it('returns empty peers list when not running', () => {
      expect(discovery.getPeers()).toHaveLength(0);
    });

    it('returns undefined for unknown peer', () => {
      expect(discovery.getPeer('unknown-node')).toBeUndefined();
    });
  });

  describe('SimulatedDiscovery', () => {
    let discovery: SimulatedDiscovery;

    beforeEach(() => {
      discovery = new SimulatedDiscovery();
    });

    afterEach(async () => {
      await discovery.stop();
    });

    it('starts and stops', async () => {
      expect(discovery.isRunning()).toBe(false);

      await discovery.start();
      expect(discovery.isRunning()).toBe(true);

      await discovery.stop();
      expect(discovery.isRunning()).toBe(false);
    });

    it('emits discovery-started event', async () => {
      const startedPromise = new Promise<void>((resolve) => {
        discovery.on('discovery-started', resolve);
      });

      await discovery.start();
      await startedPromise;
    });

    it('emits discovery-stopped event', async () => {
      await discovery.start();

      const stoppedPromise = new Promise<void>((resolve) => {
        discovery.on('discovery-stopped', resolve);
      });

      await discovery.stop();
      await stoppedPromise;
    });

    it('simulates peer discovery', async () => {
      await discovery.start();

      const peer: DiscoveredPeer = {
        nodeId: 'peer-1',
        publicKey: Buffer.from('0'.repeat(64), 'hex'),
        address: '192.168.1.100',
        port: 3000,
        capabilities: { compute: 80, memory: 2048 },
        lastSeen: Date.now()
      };

      const discoveredPromise = new Promise<DiscoveredPeer>((resolve) => {
        discovery.on('peer-discovered', resolve);
      });

      discovery.simulatePeerDiscovery(peer);

      const discoveredPeer = await discoveredPromise;
      expect(discoveredPeer.nodeId).toBe('peer-1');
      expect(discoveredPeer.address).toBe('192.168.1.100');
    });

    it('returns discovered peers', async () => {
      await discovery.start();

      const peer1: DiscoveredPeer = {
        nodeId: 'peer-1',
        publicKey: Buffer.from('1'.repeat(64), 'hex'),
        address: '192.168.1.100',
        port: 3000,
        capabilities: { compute: 80, memory: 2048 },
        lastSeen: Date.now()
      };

      const peer2: DiscoveredPeer = {
        nodeId: 'peer-2',
        publicKey: Buffer.from('2'.repeat(64), 'hex'),
        address: '192.168.1.101',
        port: 3000,
        capabilities: { compute: 60, memory: 1024 },
        lastSeen: Date.now()
      };

      discovery.simulatePeerDiscovery(peer1);
      discovery.simulatePeerDiscovery(peer2);

      const peers = discovery.getPeers();
      expect(peers).toHaveLength(2);
      expect(peers.map(p => p.nodeId)).toContain('peer-1');
      expect(peers.map(p => p.nodeId)).toContain('peer-2');
    });

    it('emits peer-lost event', async () => {
      await discovery.start();

      const peer: DiscoveredPeer = {
        nodeId: 'peer-1',
        publicKey: Buffer.from('0'.repeat(64), 'hex'),
        address: '192.168.1.100',
        port: 3000,
        capabilities: { compute: 80, memory: 2048 },
        lastSeen: Date.now()
      };

      discovery.simulatePeerDiscovery(peer);
      expect(discovery.getPeers()).toHaveLength(1);

      const lostPromise = new Promise<string>((resolve) => {
        discovery.on('peer-lost', resolve);
      });

      discovery.simulatePeerLost('peer-1');

      const lostNodeId = await lostPromise;
      expect(lostNodeId).toBe('peer-1');
      expect(discovery.getPeers()).toHaveLength(0);
    });

    it('handles multiple peer discoveries and losses', async () => {
      await discovery.start();

      // Add three peers
      for (let i = 0; i < 3; i++) {
        discovery.simulatePeerDiscovery({
          nodeId: `peer-${i}`,
          publicKey: Buffer.from(`${i}`.repeat(64), 'hex'),
          address: `192.168.1.${100 + i}`,
          port: 3000,
          capabilities: { compute: 50 + i * 10, memory: 1024 },
          lastSeen: Date.now()
        });
      }

      expect(discovery.getPeers()).toHaveLength(3);

      // Lose one peer
      discovery.simulatePeerLost('peer-1');
      expect(discovery.getPeers()).toHaveLength(2);

      // Add a new peer
      discovery.simulatePeerDiscovery({
        nodeId: 'peer-3',
        publicKey: Buffer.from('3'.repeat(64), 'hex'),
        address: '192.168.1.103',
        port: 3000,
        capabilities: { compute: 90, memory: 4096 },
        lastSeen: Date.now()
      });

      expect(discovery.getPeers()).toHaveLength(3);
    });
  });
});
