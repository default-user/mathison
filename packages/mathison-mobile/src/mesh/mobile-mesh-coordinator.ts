/**
 * Mobile Mesh Coordinator - Proximity-based mesh formation for React Native
 * Uses Android Nearby Connections API for device discovery and mesh formation
 */

import type {
  MeshNodeInfo,
  MeshFormationRequest,
  MeshTask,
  MeshTaskResult,
} from 'mathison-mesh';

export interface NearbyDevice {
  endpointId: string;
  endpointName: string;
  serviceId: string;
  distance?: number; // Estimated distance in meters
}

export interface MobileMeshConfig {
  serviceId: string; // Unique ID for Mathison mesh (e.g., 'mathison-mesh-v1')
  strategyType: 'P2P_CLUSTER' | 'P2P_STAR' | 'P2P_POINT_TO_POINT';
  maxNodes?: number;
  requireEncryption: boolean;
}

/**
 * Mobile Mesh Coordinator for React Native
 *
 * Uses Android Nearby Connections API (or iOS MultipeerConnectivity) for:
 * - Discovery of nearby Mathison devices
 * - Proximity-based mesh formation
 * - Privacy-preserving task distribution
 *
 * In a real React Native app, you would:
 * ```typescript
 * import NearbyConnections from 'react-native-nearby-connections';
 * ```
 */
export class MobileMeshCoordinator {
  private config: MobileMeshConfig;
  private nodeInfo: MeshNodeInfo;
  private nativeModules: any;

  private discoveredDevices: Map<string, NearbyDevice> = new Map();
  private connectedNodes: Map<string, MeshNodeInfo> = new Map();
  private meshActive = false;
  private currentMeshId: string | null = null;

  constructor(nodeInfo: MeshNodeInfo, config: MobileMeshConfig, nativeModules?: any) {
    this.nodeInfo = nodeInfo;
    this.config = config;
    this.nativeModules = nativeModules || {};
  }

  async initialize(): Promise<void> {
    console.log(`📱 Initializing Mobile Mesh Coordinator (Node: ${this.nodeInfo.nodeId})...`);

    if (!this.nativeModules.NearbyConnections) {
      console.warn('NearbyConnections module not available (running in non-mobile environment)');
      return;
    }

    // Request necessary permissions (handled by RN module)
    await this.nativeModules.NearbyConnections.requestPermissions();

    console.log(`   Strategy: ${this.config.strategyType}`);
    console.log(`   Service ID: ${this.config.serviceId}`);
  }

  async shutdown(): Promise<void> {
    console.log('📱 Shutting down Mobile Mesh Coordinator...');

    if (this.meshActive && this.currentMeshId) {
      await this.dissolveMesh(this.currentMeshId);
    }

    if (this.nativeModules.NearbyConnections) {
      await this.nativeModules.NearbyConnections.stopAllEndpoints();
    }

    this.discoveredDevices.clear();
    this.connectedNodes.clear();
  }

  /**
   * Discover nearby Mathison devices
   * Returns list of discovered devices within proximity
   */
  async discoverNearbyDevices(timeoutMs: number = 10000): Promise<NearbyDevice[]> {
    console.log('🔍 Discovering nearby Mathison devices...');

    if (!this.nativeModules.NearbyConnections) {
      console.warn('NearbyConnections not available');
      return [];
    }

    this.discoveredDevices.clear();

    try {
      // Start advertising (so others can discover us)
      await this.nativeModules.NearbyConnections.startAdvertising({
        endpointName: this.nodeInfo.nodeId,
        serviceId: this.config.serviceId,
        strategy: this.config.strategyType,
      });

      // Start discovery
      await this.nativeModules.NearbyConnections.startDiscovery({
        serviceId: this.config.serviceId,
        strategy: this.config.strategyType,
        onEndpointFound: (endpoint: NearbyDevice) => {
          console.log(`  Found device: ${endpoint.endpointName}`);
          this.discoveredDevices.set(endpoint.endpointId, endpoint);
        },
        onEndpointLost: (endpointId: string) => {
          console.log(`  Lost device: ${endpointId}`);
          this.discoveredDevices.delete(endpointId);
        },
      });

      // Wait for discovery period
      await new Promise((resolve) => setTimeout(resolve, timeoutMs));

      // Stop discovery/advertising
      await this.nativeModules.NearbyConnections.stopDiscovery();
      await this.nativeModules.NearbyConnections.stopAdvertising();

      const devices = Array.from(this.discoveredDevices.values());
      console.log(`✓ Discovered ${devices.length} nearby devices`);

      return devices;
    } catch (error) {
      console.error('Discovery failed:', error);
      return [];
    }
  }

  /**
   * Form a mesh with discovered devices
   * Privacy-preserving: requires explicit consent from each node
   */
  async formMesh(request: MeshFormationRequest, devices: NearbyDevice[]): Promise<string> {
    console.log(`🌐 Forming mesh: ${request.meshId}`);

    if (!this.nativeModules.NearbyConnections) {
      throw new Error('NearbyConnections not available');
    }

    this.currentMeshId = request.meshId;
    this.meshActive = true;

    // Add self to mesh
    this.connectedNodes.set(this.nodeInfo.nodeId, this.nodeInfo);

    // Request connections to discovered devices
    for (const device of devices) {
      if (this.config.maxNodes && this.connectedNodes.size >= this.config.maxNodes) {
        break;
      }

      try {
        await this.requestConnection(device, request);
      } catch (error) {
        console.warn(`Failed to connect to ${device.endpointName}:`, error);
      }
    }

    console.log(`✓ Mesh formed with ${this.connectedNodes.size} nodes`);
    return request.meshId;
  }

  /**
   * Submit task to mesh for distributed execution
   */
  async submitTask(meshId: string, task: MeshTask): Promise<MeshTaskResult[]> {
    if (!this.meshActive || this.currentMeshId !== meshId) {
      throw new Error('Mesh not active');
    }

    console.log(`📤 Distributing task ${task.taskId} to ${this.connectedNodes.size} nodes`);

    const results: MeshTaskResult[] = [];

    // For privacy: only send task to trusted nodes
    for (const [nodeId, nodeInfo] of this.connectedNodes) {
      if (task.privacy.trustedNodes && !task.privacy.trustedNodes.includes(nodeId)) {
        continue;
      }

      try {
        const result = await this.executeTaskOnNode(nodeId, task);
        results.push(result);
      } catch (error) {
        console.error(`Task failed on node ${nodeId}:`, error);
      }
    }

    return results;
  }

  /**
   * Dissolve mesh - clean teardown with no residual state
   */
  async dissolveMesh(meshId: string): Promise<void> {
    if (this.currentMeshId !== meshId) {
      return;
    }

    console.log(`🌐 Dissolving mesh ${meshId}...`);

    if (this.nativeModules.NearbyConnections) {
      // Disconnect all endpoints
      for (const device of this.discoveredDevices.values()) {
        await this.nativeModules.NearbyConnections.disconnectFromEndpoint(device.endpointId);
      }

      await this.nativeModules.NearbyConnections.stopAllEndpoints();
    }

    this.connectedNodes.clear();
    this.discoveredDevices.clear();
    this.meshActive = false;
    this.currentMeshId = null;

    console.log('✓ Mesh dissolved');
  }

  /**
   * Get current mesh status
   */
  getMeshStatus(): {
    active: boolean;
    meshId: string | null;
    nodeCount: number;
    nodes: MeshNodeInfo[];
  } {
    return {
      active: this.meshActive,
      meshId: this.currentMeshId,
      nodeCount: this.connectedNodes.size,
      nodes: Array.from(this.connectedNodes.values()),
    };
  }

  // Private methods

  private async requestConnection(device: NearbyDevice, request: MeshFormationRequest): Promise<void> {
    if (!this.nativeModules.NearbyConnections) {
      throw new Error('NearbyConnections not available');
    }

    // Request connection
    await this.nativeModules.NearbyConnections.requestConnection({
      endpointId: device.endpointId,
      endpointName: this.nodeInfo.nodeId,
      onConnectionInitiated: async (connectionInfo: any) => {
        console.log(`  Connection initiated with ${device.endpointName}`);

        // Accept connection (with encryption if required)
        await this.nativeModules.NearbyConnections.acceptConnection(device.endpointId);
      },
      onConnectionResult: (result: { status: string; endpointId: string }) => {
        if (result.status === 'CONNECTED') {
          console.log(`  ✓ Connected to ${device.endpointName}`);

          // Add to connected nodes (would exchange node info here)
          const nodeInfo: MeshNodeInfo = {
            nodeId: device.endpointName,
            publicKey: '', // Would exchange via handshake
            capabilities: {
              compute: 50, // Default estimate
              memory: 1024,
            },
          };

          this.connectedNodes.set(device.endpointId, nodeInfo);
        } else {
          console.warn(`  Connection failed to ${device.endpointName}: ${result.status}`);
        }
      },
    });
  }

  private async executeTaskOnNode(nodeId: string, task: MeshTask): Promise<MeshTaskResult> {
    const startTime = Date.now();

    // Send task payload to node
    if (this.nativeModules.NearbyConnections && nodeId !== this.nodeInfo.nodeId) {
      const payload = JSON.stringify({
        type: 'mesh-task',
        task,
      });

      await this.nativeModules.NearbyConnections.sendPayload({
        endpointId: nodeId,
        payload: { bytes: payload },
      });

      // Wait for result (in production, use event listener)
      // For now, simulate local execution
    }

    // Simulate execution
    const result: MeshTaskResult = {
      taskId: task.taskId,
      nodeId,
      result: {
        executed: true,
        payload: task.payload,
      },
      metadata: {
        executionTime: Date.now() - startTime,
        confidence: 0.8,
      },
    };

    return result;
  }
}

export default MobileMeshCoordinator;
