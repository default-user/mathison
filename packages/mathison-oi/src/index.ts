/**
 * Mathison OI - Open Interpretation Engine
 *
 * Multi-modal interpretation with confidence scoring and context assembly
 * Integrates with Memory Graph for contextual reasoning
 */

import { MemoryGraph, Node } from 'mathison-memory';

export interface InterpretationContext {
  input: unknown;
  inputType?: 'text' | 'structured' | 'binary';
  metadata?: Record<string, unknown>;
  memoryContext?: string[]; // Node IDs to consider for context
}

export interface InterpretationResult {
  interpretation: unknown;
  confidence: number; // 0.0 - 1.0
  alternatives?: Alternative[];
  contextUsed?: Node[]; // Memory nodes that informed interpretation
  metadata?: Record<string, unknown>;
}

export interface Alternative {
  interpretation: unknown;
  confidence: number;
  rationale?: string;
}

export interface OIEngineConfig {
  confidenceThreshold?: number; // Minimum confidence to return result
  maxAlternatives?: number;
  enableMemoryIntegration?: boolean;
}

export class OIEngine {
  private config: Required<OIEngineConfig>;
  private memoryGraph?: MemoryGraph;
  private initialized: boolean = false;

  constructor(config: OIEngineConfig = {}) {
    this.config = {
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      maxAlternatives: config.maxAlternatives ?? 3,
      enableMemoryIntegration: config.enableMemoryIntegration ?? true
    };
  }

  async initialize(memoryGraph?: MemoryGraph): Promise<void> {
    console.log('🔮 Initializing OI Engine...');

    if (this.config.enableMemoryIntegration && memoryGraph) {
      this.memoryGraph = memoryGraph;
      console.log('✓ Memory graph integration enabled');
    }

    this.initialized = true;
    console.log('✓ OI Engine initialized');
  }

  async shutdown(): Promise<void> {
    console.log('🔮 Shutting down OI Engine...');
    this.initialized = false;
  }

  /**
   * Perform open interpretation on input with confidence scoring
   */
  async interpret(context: InterpretationContext): Promise<InterpretationResult> {
    if (!this.initialized) {
      throw new Error('OI Engine not initialized');
    }

    const inputType = context.inputType || this.detectInputType(context.input);

    // Assemble context from memory graph
    const memoryContext = await this.assembleMemoryContext(context.memoryContext || []);

    // Perform interpretation based on input type
    let interpretation: unknown;
    let confidence: number;
    let alternatives: Alternative[] = [];

    switch (inputType) {
      case 'text':
        ({ interpretation, confidence, alternatives } = await this.interpretText(
          context.input as string,
          memoryContext
        ));
        break;

      case 'structured':
        ({ interpretation, confidence, alternatives } = await this.interpretStructured(
          context.input,
          memoryContext
        ));
        break;

      default:
        // Unknown input type - low confidence fallback
        interpretation = { raw: context.input };
        confidence = 0.3;
        alternatives = [
          {
            interpretation: { error: 'Unknown input type' },
            confidence: 0.1,
            rationale: 'Unable to determine input format'
          }
        ];
    }

    // Filter alternatives by confidence threshold
    const filteredAlternatives = alternatives
      .filter(alt => alt.confidence >= this.config.confidenceThreshold * 0.5)
      .slice(0, this.config.maxAlternatives);

    return {
      interpretation,
      confidence,
      alternatives: filteredAlternatives.length > 0 ? filteredAlternatives : undefined,
      contextUsed: memoryContext.length > 0 ? memoryContext : undefined,
      metadata: {
        inputType,
        memoryNodesUsed: memoryContext.length,
        alternativesConsidered: alternatives.length
      }
    };
  }

  /**
   * Assemble context from memory graph nodes
   */
  private async assembleMemoryContext(nodeIds: string[]): Promise<Node[]> {
    if (!this.memoryGraph || nodeIds.length === 0) {
      return [];
    }

    const contextNodes: Node[] = [];
    for (const nodeId of nodeIds) {
      const node = this.memoryGraph.getNode(nodeId);
      if (node) {
        contextNodes.push(node);
      }
    }

    return contextNodes;
  }

  /**
   * Interpret text input with confidence scoring
   */
  private async interpretText(
    text: string,
    memoryContext: Node[]
  ): Promise<{ interpretation: unknown; confidence: number; alternatives: Alternative[] }> {

    // Basic text interpretation with pattern matching
    const patterns = {
      question: /\?$/,
      command: /^(do|run|execute|perform)/i,
      query: /^(what|where|when|who|how|why)/i,
      statement: /\.$/
    };

    let primaryType = 'unknown';
    let confidence = 0.5;

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        primaryType = type;
        confidence = 0.8;
        break;
      }
    }

    // Boost confidence if memory context is available
    if (memoryContext.length > 0) {
      confidence = Math.min(1.0, confidence + 0.1);
    }

    const interpretation = {
      text,
      type: primaryType,
      tokens: text.split(/\s+/).length,
      contextRelevance: memoryContext.length > 0 ? 'high' : 'none'
    };

    // Generate alternatives
    const alternatives: Alternative[] = [];

    if (primaryType !== 'question' && patterns.question.test(text)) {
      alternatives.push({
        interpretation: { ...interpretation, type: 'question' },
        confidence: 0.6,
        rationale: 'Could be interpreted as a question'
      });
    }

    if (primaryType !== 'command' && patterns.command.test(text)) {
      alternatives.push({
        interpretation: { ...interpretation, type: 'command' },
        confidence: 0.5,
        rationale: 'Could be interpreted as a command'
      });
    }

    return { interpretation, confidence, alternatives };
  }

  /**
   * Interpret structured data input
   */
  private async interpretStructured(
    data: unknown,
    memoryContext: Node[]
  ): Promise<{ interpretation: unknown; confidence: number; alternatives: Alternative[] }> {

    // Analyze structure
    const isArray = Array.isArray(data);
    const isObject = typeof data === 'object' && data !== null && !isArray;

    let confidence = 0.7;

    if (isObject) {
      const keys = Object.keys(data as object);
      confidence = keys.length > 0 ? 0.9 : 0.5;
    } else if (isArray) {
      confidence = (data as unknown[]).length > 0 ? 0.85 : 0.5;
    }

    // Boost confidence with memory context
    if (memoryContext.length > 0) {
      confidence = Math.min(1.0, confidence + 0.05);
    }

    const interpretation = {
      structure: isArray ? 'array' : isObject ? 'object' : 'primitive',
      data,
      size: isArray ? (data as unknown[]).length : isObject ? Object.keys(data as object).length : 1,
      contextRelevance: memoryContext.length > 0 ? 'moderate' : 'none'
    };

    const alternatives: Alternative[] = [
      {
        interpretation: { raw: data },
        confidence: 0.4,
        rationale: 'Raw data without interpretation'
      }
    ];

    return { interpretation, confidence, alternatives };
  }

  /**
   * Detect input type from input value
   */
  private detectInputType(input: unknown): 'text' | 'structured' | 'binary' {
    if (typeof input === 'string') {
      return 'text';
    }

    if (typeof input === 'object' && input !== null) {
      return 'structured';
    }

    return 'binary';
  }

  /**
   * Score confidence for a given interpretation
   * Can be extended with ML-based confidence estimation
   */
  scoreConfidence(interpretation: unknown, context: InterpretationContext): number {
    // Base confidence from interpretation quality
    let confidence = 0.5;

    // Increase confidence if interpretation is well-formed
    if (interpretation && typeof interpretation === 'object') {
      confidence += 0.2;
    }

    // Increase confidence if memory context is available
    if (context.memoryContext && context.memoryContext.length > 0) {
      confidence += 0.1 * Math.min(context.memoryContext.length, 3);
    }

    // Cap at 1.0
    return Math.min(1.0, confidence);
  }

  /**
   * Get engine status and configuration
   */
  getStatus(): {
    initialized: boolean;
    memoryIntegration: boolean;
    config: OIEngineConfig;
  } {
    return {
      initialized: this.initialized,
      memoryIntegration: this.config.enableMemoryIntegration && !!this.memoryGraph,
      config: this.config
    };
  }
}

export default OIEngine;
