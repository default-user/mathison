/**
 * Model Bus - The Kernel for Distributed LLM Inference
 * Routes inference requests across mesh nodes based on model availability and load
 */

import { EventEmitter } from 'events';

// Model capabilities and metadata
export interface ModelInfo {
  modelId: string;
  modelName: string;
  type: 'text' | 'embedding' | 'vision' | 'multimodal';
  size: 'tiny' | 'small' | 'medium' | 'large';
  capabilities: {
    maxTokens: number;
    streaming: boolean;
    batching: boolean;
  };
  performance: {
    tokensPerSecond: number;
    latencyMs: number;
  };
}

// Model availability on a specific node
export interface NodeModelInfo {
  nodeId: string;
  modelId: string;
  status: 'available' | 'busy' | 'offline';
  currentLoad: number; // 0-100
  queueDepth: number;
}

// Inference request
export interface InferenceRequest {
  requestId: string;
  prompt: string | unknown; // Text or structured input
  modelPreference?: string; // Preferred model ID
  constraints?: {
    maxLatency?: number; // Max acceptable latency in ms
    minQuality?: number; // Min quality threshold (0-1)
    allowFallback?: boolean; // Allow fallback to different model
  };
  synthesis?: {
    compositional: boolean; // Use multiple models for synthesis
    ensemble?: number; // Number of models to ensemble (if >1)
  };
}

// Inference result
export interface InferenceResult {
  requestId: string;
  nodeId: string;
  modelId: string;
  output: unknown;
  metadata: {
    tokensGenerated: number;
    latencyMs: number;
    quality?: number; // Quality score if available
    synthesisContributors?: string[]; // Models that contributed to synthesis
  };
}

// Model Bus - Central routing and orchestration
export class ModelBus extends EventEmitter {
  private modelRegistry: Map<string, ModelInfo> = new Map();
  private nodeModelRegistry: Map<string, NodeModelInfo[]> = new Map();
  private pendingRequests: Map<string, InferenceRequest> = new Map();
  private completedRequests: Map<string, InferenceResult> = new Map();

  async initialize(): Promise<void> {
    console.log('🚌 Initializing Model Bus...');
    console.log('   Structural generative synthesis engine ready');
  }

  async shutdown(): Promise<void> {
    console.log('🚌 Shutting down Model Bus...');
    this.modelRegistry.clear();
    this.nodeModelRegistry.clear();
  }

  // Register a model in the bus
  registerModel(model: ModelInfo): void {
    this.modelRegistry.set(model.modelId, model);
    console.log(`✓ Registered model: ${model.modelName} (${model.type}, ${model.size})`);
    this.emit('model-registered', model);
  }

  // Register model availability on a node
  registerNodeModel(nodeId: string, modelId: string, status: NodeModelInfo['status'] = 'available'): void {
    const existing = this.nodeModelRegistry.get(nodeId) || [];

    // Update or add
    const index = existing.findIndex(nm => nm.modelId === modelId);
    const nodeModel: NodeModelInfo = {
      nodeId,
      modelId,
      status,
      currentLoad: 0,
      queueDepth: 0,
    };

    if (index >= 0) {
      existing[index] = nodeModel;
    } else {
      existing.push(nodeModel);
    }

    this.nodeModelRegistry.set(nodeId, existing);
    console.log(`✓ Node ${nodeId} now serving model ${modelId}`);
    this.emit('node-model-registered', { nodeId, modelId });
  }

  // Route inference request to best available node
  async routeInference(request: InferenceRequest): Promise<string> {
    console.log(`🚌 Routing inference request ${request.requestId}`);

    this.pendingRequests.set(request.requestId, request);

    // Find best node for this request
    const targetNode = this.selectTargetNode(request);

    if (!targetNode) {
      throw new Error(`No available nodes for inference request ${request.requestId}`);
    }

    console.log(`   → Routing to node ${targetNode.nodeId} (model: ${targetNode.modelId})`);

    // Execute inference
    const result = await this.executeInference(targetNode, request);

    // Store result
    this.completedRequests.set(request.requestId, result);
    this.pendingRequests.delete(request.requestId);

    this.emit('inference-complete', result);
    return request.requestId;
  }

  // Compositional synthesis across multiple models
  async synthesize(request: InferenceRequest): Promise<InferenceResult> {
    console.log(`🧬 Structural synthesis request ${request.requestId}`);

    if (!request.synthesis?.compositional) {
      // Not a synthesis request, route normally
      await this.routeInference(request);
      return this.completedRequests.get(request.requestId)!;
    }

    const ensembleSize = request.synthesis.ensemble || 3;
    const nodes = this.selectEnsembleNodes(request, ensembleSize);

    if (nodes.length === 0) {
      throw new Error('No nodes available for synthesis');
    }

    console.log(`   Ensemble: ${nodes.length} models`);

    // Execute on all nodes in parallel
    const results = await Promise.all(
      nodes.map(node => this.executeInference(node, request))
    );

    // Synthesize results compositionally
    const synthesizedResult = this.compositionalSynthesis(results, request);

    this.completedRequests.set(request.requestId, synthesizedResult);
    this.pendingRequests.delete(request.requestId);

    this.emit('synthesis-complete', synthesizedResult);
    return synthesizedResult;
  }

  // Get inference result
  async getResult(requestId: string): Promise<InferenceResult | null> {
    return this.completedRequests.get(requestId) || null;
  }

  // Select best node for single inference
  private selectTargetNode(request: InferenceRequest): NodeModelInfo | null {
    const allNodes: NodeModelInfo[] = [];

    // Gather all available nodes
    for (const nodeModels of this.nodeModelRegistry.values()) {
      allNodes.push(...nodeModels.filter(nm => nm.status === 'available'));
    }

    if (allNodes.length === 0) {
      return null;
    }

    // Filter by model preference
    let candidates = allNodes;
    if (request.modelPreference) {
      const preferred = allNodes.filter(nm => nm.modelId === request.modelPreference);
      if (preferred.length > 0) {
        candidates = preferred;
      } else if (!request.constraints?.allowFallback) {
        return null; // No fallback allowed
      }
    }

    // Sort by load (lowest first)
    candidates.sort((a, b) => {
      const loadDiff = a.currentLoad - b.currentLoad;
      if (loadDiff !== 0) return loadDiff;
      return a.queueDepth - b.queueDepth;
    });

    return candidates[0];
  }

  // Select ensemble of nodes for compositional synthesis
  private selectEnsembleNodes(request: InferenceRequest, count: number): NodeModelInfo[] {
    const allNodes: NodeModelInfo[] = [];

    for (const nodeModels of this.nodeModelRegistry.values()) {
      allNodes.push(...nodeModels.filter(nm => nm.status === 'available'));
    }

    // Prefer diversity in model types for ensemble
    const diverse: NodeModelInfo[] = [];
    const seen = new Set<string>();

    for (const node of allNodes) {
      if (!seen.has(node.modelId) && diverse.length < count) {
        diverse.push(node);
        seen.add(node.modelId);
      }
    }

    // Fill remaining slots if needed
    while (diverse.length < count && diverse.length < allNodes.length) {
      const remaining = allNodes.filter(n => !diverse.includes(n));
      if (remaining.length === 0) break;
      diverse.push(remaining[0]);
    }

    return diverse.slice(0, count);
  }

  // Execute inference on target node
  private async executeInference(
    node: NodeModelInfo,
    request: InferenceRequest
  ): Promise<InferenceResult> {
    const startTime = Date.now();

    // Simulate inference (in production, this would call actual model)
    const model = this.modelRegistry.get(node.modelId);

    let output: unknown;
    if (typeof request.prompt === 'string') {
      output = {
        generated: `Response from ${model?.modelName || 'unknown model'}`,
        prompt: request.prompt,
        type: 'text_generation',
      };
    } else {
      output = {
        processed: true,
        input: request.prompt,
      };
    }

    const latencyMs = Date.now() - startTime;

    return {
      requestId: request.requestId,
      nodeId: node.nodeId,
      modelId: node.modelId,
      output,
      metadata: {
        tokensGenerated: 100, // Simulated
        latencyMs,
        quality: 0.85,
      },
    };
  }

  // Compositional synthesis - combine results from multiple models
  private compositionalSynthesis(
    results: InferenceResult[],
    request: InferenceRequest
  ): InferenceResult {
    console.log(`   Synthesizing ${results.length} outputs compositionally...`);

    // Combine outputs using structural synthesis
    const synthesized = {
      type: 'compositional_synthesis',
      contributions: results.map(r => ({
        model: r.modelId,
        node: r.nodeId,
        output: r.output,
        quality: r.metadata.quality,
      })),
      synthesized_output: {
        // In production, this would use actual synthesis logic
        // For now, we combine metadata
        combined: true,
        sources: results.map(r => r.modelId),
      },
    };

    const totalLatency = Math.max(...results.map(r => r.metadata.latencyMs));
    const avgQuality = results.reduce((sum, r) => sum + (r.metadata.quality || 0), 0) / results.length;

    return {
      requestId: request.requestId,
      nodeId: 'synthesis-coordinator',
      modelId: 'ensemble',
      output: synthesized,
      metadata: {
        tokensGenerated: results.reduce((sum, r) => sum + r.metadata.tokensGenerated, 0),
        latencyMs: totalLatency,
        quality: avgQuality,
        synthesisContributors: results.map(r => r.modelId),
      },
    };
  }

  // Get all registered models
  getModels(): ModelInfo[] {
    return Array.from(this.modelRegistry.values());
  }

  // Get node-model availability
  getNodeModels(): Map<string, NodeModelInfo[]> {
    return this.nodeModelRegistry;
  }
}

export default ModelBus;
