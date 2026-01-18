/**
 * Mathison Mesh - Distributed Computing Protocol (Phase 6)
 * Enables secure, privacy-preserving distributed computation across personal OI nodes
 */

import { EventEmitter } from 'events';

// Node identity and capabilities
export interface MeshNodeInfo {
  nodeId: string;
  publicKey: string; // For secure communication
  capabilities: {
    compute: number; // Relative compute capacity (0-100)
    memory: number; // Available memory in MB
    battery?: number; // Battery level (0-100) for mobile devices
  };
  location?: {
    // Optional location for proximity-based mesh formation
    lat: number;
    lon: number;
    radius: number; // Meters
  };
}

// Task to be distributed
export interface MeshTask {
  taskId: string;
  type: 'interpretation' | 'computation' | 'aggregation';
  payload: unknown;
  requirements?: {
    minCompute?: number;
    minMemory?: number;
    timeout?: number; // Milliseconds
  };
  privacy: {
    allowDataSharing: boolean; // If false, only encrypted results shared
    trustedNodes?: string[]; // Whitelist of node IDs
  };
}

// Task result
export interface MeshTaskResult {
  taskId: string;
  nodeId: string;
  result: unknown;
  metadata: {
    executionTime: number; // Milliseconds
    confidence?: number;
  };
}

// Mesh formation request
export interface MeshFormationRequest {
  meshId: string;
  initiatorId: string;
  purpose: string;
  maxNodes?: number;
  discoveryMode: 'proximity' | 'manual' | 'broadcast';
  privacy: {
    requireEncryption: boolean;
    allowedNodes?: string[];
  };
}

export type MeshStatus = 'forming' | 'active' | 'dissolved';

export class MeshCoordinator extends EventEmitter {
  private nodeInfo: MeshNodeInfo;
  private activeMeshes: Map<string, ActiveMesh> = new Map();
  private taskQueue: Map<string, MeshTask> = new Map();
  private taskResults: Map<string, MeshTaskResult[]> = new Map();

  constructor(nodeInfo: MeshNodeInfo) {
    super();
    this.nodeInfo = nodeInfo;
  }

  async initialize(): Promise<void> {
    console.log(`🌐 Initializing Mesh Coordinator (Node: ${this.nodeInfo.nodeId})`);
    console.log(`   Capabilities: compute=${this.nodeInfo.capabilities.compute}, memory=${this.nodeInfo.capabilities.memory}MB`);
  }

  async shutdown(): Promise<void> {
    console.log('🌐 Shutting down Mesh Coordinator...');
    // Dissolve all active meshes
    for (const [meshId, mesh] of this.activeMeshes) {
      await this.dissolveMesh(meshId);
    }
  }

  // Form a new mesh
  async formMesh(request: MeshFormationRequest): Promise<string> {
    console.log(`🌐 Forming mesh: ${request.meshId} (${request.purpose})`);

    const mesh: ActiveMesh = {
      meshId: request.meshId,
      initiatorId: request.initiatorId,
      nodes: new Map([[this.nodeInfo.nodeId, this.nodeInfo]]),
      status: 'forming',
      createdAt: Date.now(),
      privacy: request.privacy,
    };

    this.activeMeshes.set(request.meshId, mesh);

    // Emit mesh-formed event
    this.emit('mesh-formed', { meshId: request.meshId, nodeCount: 1 });

    // Implement node discovery based on discoveryMode
    await this.discoverNodes(request.meshId, request.discoveryMode, request.maxNodes);

    mesh.status = 'active';
    return request.meshId;
  }

  // Discover nodes based on discovery mode
  private async discoverNodes(
    meshId: string,
    discoveryMode: 'proximity' | 'manual' | 'broadcast',
    maxNodes?: number
  ): Promise<void> {
    console.log(`🔍 Discovering nodes for mesh ${meshId} using ${discoveryMode} mode...`);

    const mesh = this.activeMeshes.get(meshId);
    if (!mesh) {
      console.error(`Mesh ${meshId} not found during discovery`);
      return;
    }

    try {
      switch (discoveryMode) {
        case 'proximity':
          await this.discoverProximityNodes(meshId, maxNodes);
          break;
        case 'broadcast':
          await this.discoverBroadcastNodes(meshId, maxNodes);
          break;
        case 'manual':
          // Manual mode: nodes join explicitly via joinMesh()
          console.log(`🔍 Manual discovery mode - nodes will join explicitly`);
          break;
        default:
          console.warn(`Unknown discovery mode: ${discoveryMode}`);
      }
    } catch (error) {
      console.error(`Node discovery failed for mesh ${meshId}:`, error);
      this.emit('discovery-failed', { meshId, mode: discoveryMode, error });
    }
  }

  // Discover nodes based on proximity (geographic location)
  private async discoverProximityNodes(meshId: string, maxNodes?: number): Promise<void> {
    const mesh = this.activeMeshes.get(meshId);
    if (!mesh || !this.nodeInfo.location) {
      console.log(`🔍 Proximity discovery skipped - no location data available`);
      return;
    }

    // In a real implementation, this would:
    // 1. Query a location service or DHT for nearby nodes
    // 2. Filter by distance (location.radius)
    // 3. Establish secure connections with discovered nodes
    // 4. Verify node credentials and capabilities

    // For now, emit discovery-started event for external integration
    this.emit('discovery-started', {
      meshId,
      mode: 'proximity',
      location: this.nodeInfo.location,
      maxNodes,
    });

    console.log(
      `🔍 Proximity discovery: looking for nodes within ${this.nodeInfo.location.radius}m of ` +
      `(${this.nodeInfo.location.lat}, ${this.nodeInfo.location.lon})`
    );

    // External systems can listen to 'discovery-started' event and call joinMesh()
    // when nodes are found via actual network protocols (mDNS, BLE, etc.)
  }

  // Discover nodes via network broadcast
  private async discoverBroadcastNodes(meshId: string, maxNodes?: number): Promise<void> {
    const mesh = this.activeMeshes.get(meshId);
    if (!mesh) {
      return;
    }

    // In a real implementation, this would:
    // 1. Send multicast/broadcast discovery packets on local network
    // 2. Listen for responses from other Mathison nodes
    // 3. Perform capability negotiation
    // 4. Establish encrypted connections

    // For now, emit discovery-started event for external integration
    this.emit('discovery-started', {
      meshId,
      mode: 'broadcast',
      maxNodes,
    });

    console.log(`🔍 Broadcast discovery: listening for Mathison nodes on local network`);

    // External systems can implement actual broadcast protocols (mDNS, SSDP, etc.)
    // and call joinMesh() when nodes respond
  }

  // Add node to existing mesh
  async joinMesh(meshId: string, nodeInfo: MeshNodeInfo): Promise<boolean> {
    const mesh = this.activeMeshes.get(meshId);
    if (!mesh) {
      console.error(`Mesh ${meshId} not found`);
      return false;
    }

    // Privacy check: is this node allowed?
    if (mesh.privacy.allowedNodes && !mesh.privacy.allowedNodes.includes(nodeInfo.nodeId)) {
      console.warn(`Node ${nodeInfo.nodeId} not in allowlist for mesh ${meshId}`);
      return false;
    }

    mesh.nodes.set(nodeInfo.nodeId, nodeInfo);
    this.emit('node-joined', { meshId, nodeId: nodeInfo.nodeId, nodeCount: mesh.nodes.size });

    console.log(`✓ Node ${nodeInfo.nodeId} joined mesh ${meshId} (${mesh.nodes.size} nodes)`);
    return true;
  }

  // Submit task to mesh for distributed execution
  async submitTask(meshId: string, task: MeshTask): Promise<string> {
    const mesh = this.activeMeshes.get(meshId);
    if (!mesh || mesh.status !== 'active') {
      throw new Error(`Mesh ${meshId} not active`);
    }

    this.taskQueue.set(task.taskId, task);
    this.taskResults.set(task.taskId, []);

    console.log(`📤 Submitting task ${task.taskId} to mesh ${meshId} (${mesh.nodes.size} nodes)`);

    // Distribute task to eligible nodes
    const eligibleNodes = this.findEligibleNodes(mesh, task);

    if (eligibleNodes.length === 0) {
      throw new Error('No eligible nodes for task');
    }

    // For now, execute locally (single-node mesh)
    // In production, this would distribute across all eligible nodes
    await this.executeTaskLocally(task);

    return task.taskId;
  }

  // Execute task on local node
  private async executeTaskLocally(task: MeshTask): Promise<void> {
    const startTime = Date.now();

    try {
      // Simulate task execution
      let result: unknown;

      if (task.type === 'interpretation') {
        result = {
          interpreted: true,
          payload: task.payload,
          note: 'Executed on local node',
        };
      } else if (task.type === 'computation') {
        result = {
          computed: true,
          payload: task.payload,
        };
      } else {
        result = { unknown: true };
      }

      const taskResult: MeshTaskResult = {
        taskId: task.taskId,
        nodeId: this.nodeInfo.nodeId,
        result,
        metadata: {
          executionTime: Date.now() - startTime,
          confidence: 0.8,
        },
      };

      // Store result
      const results = this.taskResults.get(task.taskId) || [];
      results.push(taskResult);
      this.taskResults.set(task.taskId, results);

      this.emit('task-complete', taskResult);
    } catch (error) {
      console.error(`Task ${task.taskId} failed:`, error);
      this.emit('task-failed', { taskId: task.taskId, error });
    }
  }

  // Get task results
  async getTaskResults(taskId: string): Promise<MeshTaskResult[]> {
    return this.taskResults.get(taskId) || [];
  }

  // Find eligible nodes for task execution
  private findEligibleNodes(mesh: ActiveMesh, task: MeshTask): MeshNodeInfo[] {
    const eligible: MeshNodeInfo[] = [];

    for (const [nodeId, nodeInfo] of mesh.nodes) {
      // Check if node meets requirements
      if (task.requirements?.minCompute && nodeInfo.capabilities.compute < task.requirements.minCompute) {
        continue;
      }

      if (task.requirements?.minMemory && nodeInfo.capabilities.memory < task.requirements.minMemory) {
        continue;
      }

      // Check privacy constraints
      if (task.privacy.trustedNodes && !task.privacy.trustedNodes.includes(nodeId)) {
        continue;
      }

      eligible.push(nodeInfo);
    }

    return eligible;
  }

  // Dissolve mesh
  async dissolveMesh(meshId: string): Promise<void> {
    const mesh = this.activeMeshes.get(meshId);
    if (!mesh) {
      return;
    }

    mesh.status = 'dissolved';
    this.activeMeshes.delete(meshId);

    this.emit('mesh-dissolved', { meshId, nodeCount: mesh.nodes.size });
    console.log(`🌐 Mesh ${meshId} dissolved`);
  }

  // Get active meshes
  getActiveMeshes(): Map<string, ActiveMesh> {
    return this.activeMeshes;
  }

  // Get node info
  getNodeInfo(): MeshNodeInfo {
    return this.nodeInfo;
  }
}

// Internal mesh state
interface ActiveMesh {
  meshId: string;
  initiatorId: string;
  nodes: Map<string, MeshNodeInfo>;
  status: MeshStatus;
  createdAt: number;
  privacy: {
    requireEncryption: boolean;
    allowedNodes?: string[];
  };
}

export default MeshCoordinator;

export * from './model-bus';
export * from './crypto';
export * from './discovery';
