/**
 * Mesh Discovery Protocol
 * Implements mDNS-based and UDP broadcast peer discovery
 * Feature flag controlled for gradual rollout
 */

import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import { MeshNodeInfo } from './index';

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  enabled: boolean;
  mode: 'mdns' | 'broadcast' | 'both';
  broadcastPort: number;
  broadcastInterval: number; // ms
  discoveryTimeout: number; // ms
  maxPeers: number;
}

/**
 * Discovery beacon message
 */
export interface DiscoveryBeacon {
  type: 'mathison_discovery';
  version: 1;
  nodeId: string;
  publicKey: string; // hex-encoded
  capabilities: {
    compute: number;
    memory: number;
  };
  port: number; // Service port for direct connection
  timestamp: number;
}

/**
 * Discovery event types
 */
export interface DiscoveryEvents {
  'peer-discovered': (peer: DiscoveredPeer) => void;
  'peer-lost': (nodeId: string) => void;
  'discovery-started': () => void;
  'discovery-stopped': () => void;
  'error': (error: Error) => void;
}

/**
 * Discovered peer information
 */
export interface DiscoveredPeer {
  nodeId: string;
  publicKey: Buffer;
  address: string;
  port: number;
  capabilities: {
    compute: number;
    memory: number;
  };
  lastSeen: number;
}

/**
 * Default discovery configuration
 */
export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  enabled: false, // Off by default - feature flag
  mode: 'broadcast',
  broadcastPort: 41234,
  broadcastInterval: 5000,
  discoveryTimeout: 15000,
  maxPeers: 20
};

/**
 * Mesh Discovery Service
 * Discovers peers on local network using UDP broadcast
 */
export class DiscoveryService extends EventEmitter {
  private config: DiscoveryConfig;
  private localNode: MeshNodeInfo;
  private socket: dgram.Socket | null = null;
  private beaconInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private discoveredPeers: Map<string, DiscoveredPeer> = new Map();
  private running: boolean = false;

  constructor(localNode: MeshNodeInfo, config: Partial<DiscoveryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
    this.localNode = localNode;
  }

  /**
   * Start discovery service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('🔍 Discovery service disabled (feature flag off)');
      return;
    }

    if (this.running) {
      return;
    }

    console.log(`🔍 Starting discovery service (mode: ${this.config.mode})`);

    try {
      if (this.config.mode === 'broadcast' || this.config.mode === 'both') {
        await this.startBroadcastDiscovery();
      }

      // Start cleanup interval
      this.cleanupInterval = setInterval(() => {
        this.cleanupStalePeers();
      }, this.config.discoveryTimeout / 2);

      this.running = true;
      this.emit('discovery-started');
      console.log('✓ Discovery service started');
    } catch (error) {
      console.error('Discovery service failed to start:', error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Stop discovery service
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('🔍 Stopping discovery service...');

    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
      this.beaconInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.socket) {
      await new Promise<void>((resolve) => {
        this.socket!.close(() => resolve());
      });
      this.socket = null;
    }

    this.running = false;
    this.emit('discovery-stopped');
    console.log('✓ Discovery service stopped');
  }

  /**
   * Get all discovered peers
   */
  getPeers(): DiscoveredPeer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * Get a specific peer by node ID
   */
  getPeer(nodeId: string): DiscoveredPeer | undefined {
    return this.discoveredPeers.get(nodeId);
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Start UDP broadcast discovery
   */
  private async startBroadcastDiscovery(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        console.error('Discovery socket error:', err);
        this.emit('error', err);
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleIncomingBeacon(msg, rinfo);
      });

      this.socket.bind(this.config.broadcastPort, () => {
        try {
          this.socket!.setBroadcast(true);
          console.log(`   Listening on UDP port ${this.config.broadcastPort}`);

          // Start sending beacons
          this.sendBeacon();
          this.beaconInterval = setInterval(() => {
            this.sendBeacon();
          }, this.config.broadcastInterval);

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Send discovery beacon
   */
  private sendBeacon(): void {
    if (!this.socket) {
      return;
    }

    const beacon: DiscoveryBeacon = {
      type: 'mathison_discovery',
      version: 1,
      nodeId: this.localNode.nodeId,
      publicKey: this.localNode.publicKey,
      capabilities: this.localNode.capabilities,
      port: 3000, // Default service port
      timestamp: Date.now()
    };

    const message = Buffer.from(JSON.stringify(beacon));

    try {
      this.socket.send(message, 0, message.length, this.config.broadcastPort, '255.255.255.255');
    } catch (error) {
      console.error('Failed to send discovery beacon:', error);
    }
  }

  /**
   * Handle incoming beacon from another node
   */
  private handleIncomingBeacon(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const beacon = JSON.parse(msg.toString()) as DiscoveryBeacon;

      // Validate beacon
      if (beacon.type !== 'mathison_discovery' || beacon.version !== 1) {
        return;
      }

      // Ignore our own beacons
      if (beacon.nodeId === this.localNode.nodeId) {
        return;
      }

      // Check if this is a new peer or update
      const isNew = !this.discoveredPeers.has(beacon.nodeId);

      const peer: DiscoveredPeer = {
        nodeId: beacon.nodeId,
        publicKey: Buffer.from(beacon.publicKey, 'hex'),
        address: rinfo.address,
        port: beacon.port,
        capabilities: beacon.capabilities,
        lastSeen: Date.now()
      };

      // Enforce max peers limit
      if (isNew && this.discoveredPeers.size >= this.config.maxPeers) {
        // Evict oldest peer
        let oldestId: string | null = null;
        let oldestTime = Infinity;

        for (const [id, p] of this.discoveredPeers) {
          if (p.lastSeen < oldestTime) {
            oldestTime = p.lastSeen;
            oldestId = id;
          }
        }

        if (oldestId) {
          this.discoveredPeers.delete(oldestId);
          this.emit('peer-lost', oldestId);
        }
      }

      this.discoveredPeers.set(beacon.nodeId, peer);

      if (isNew) {
        console.log(`🔍 Discovered peer: ${beacon.nodeId} at ${rinfo.address}:${beacon.port}`);
        this.emit('peer-discovered', peer);
      }
    } catch (error) {
      // Ignore malformed beacons
    }
  }

  /**
   * Remove stale peers that haven't been seen recently
   */
  private cleanupStalePeers(): void {
    const now = Date.now();
    const staleThreshold = this.config.discoveryTimeout;

    for (const [nodeId, peer] of this.discoveredPeers) {
      if (now - peer.lastSeen > staleThreshold) {
        this.discoveredPeers.delete(nodeId);
        console.log(`🔍 Peer lost: ${nodeId} (stale)`);
        this.emit('peer-lost', nodeId);
      }
    }
  }
}

/**
 * Simulated discovery for testing
 */
export class SimulatedDiscovery extends EventEmitter {
  private peers: Map<string, DiscoveredPeer> = new Map();
  private running: boolean = false;

  async start(): Promise<void> {
    this.running = true;
    this.emit('discovery-started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.emit('discovery-stopped');
  }

  /**
   * Simulate discovering a peer
   */
  simulatePeerDiscovery(peer: DiscoveredPeer): void {
    this.peers.set(peer.nodeId, peer);
    this.emit('peer-discovered', peer);
  }

  /**
   * Simulate losing a peer
   */
  simulatePeerLost(nodeId: string): void {
    this.peers.delete(nodeId);
    this.emit('peer-lost', nodeId);
  }

  getPeers(): DiscoveredPeer[] {
    return Array.from(this.peers.values());
  }

  isRunning(): boolean {
    return this.running;
  }
}
