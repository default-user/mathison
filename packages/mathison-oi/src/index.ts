/**
 * Mathison OI - Open Interpretation Engine (Phase 5)
 * Provides local reasoning and interpretation with memory graph integration
 */

export interface MemoryGraph {
  search(query: string, limit?: number): Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>;
  getNode(id: string): { id: string; type: string; data: Record<string, unknown> } | undefined;
}

export interface InterpretationContext {
  input: unknown;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export interface InterpretationResult {
  interpretation: unknown;
  confidence: number;
  alternatives?: unknown[];
  contextUsed?: string[];
  reasoning?: string;
}

export interface OIEngineConfig {
  memoryGraph?: MemoryGraph;
  maxContextNodes?: number;
}

export class OIEngine {
  private memoryGraph?: MemoryGraph;
  private maxContextNodes: number;
  private initialized: boolean = false;

  constructor(config: OIEngineConfig = {}) {
    this.memoryGraph = config.memoryGraph;
    this.maxContextNodes = config.maxContextNodes ?? 5;
  }

  async initialize(): Promise<void> {
    console.log('🔮 Initializing OI Engine...');
    this.initialized = true;
    console.log('✓ OI Engine ready (local inference mode)');
  }

  async shutdown(): Promise<void> {
    console.log('🔮 Shutting down OI Engine...');
    this.initialized = false;
  }

  async interpret(context: InterpretationContext): Promise<InterpretationResult> {
    if (!this.initialized) {
      throw new Error('OI Engine not initialized');
    }

    // Handle different input types
    if (typeof context.input === 'string') {
      return await this.interpretText(context.input, context);
    } else if (typeof context.input === 'object' && context.input !== null) {
      return await this.interpretStructured(context.input, context);
    }

    return {
      interpretation: {
        type: 'unknown',
        message: 'Unable to interpret input',
      },
      confidence: 0.1,
      reasoning: 'Input type not recognized',
    };
  }

  private async interpretText(
    text: string,
    context: InterpretationContext
  ): Promise<InterpretationResult> {
    // Gather relevant context from memory graph
    const contextNodes: string[] = [];
    let relevantMemories: Array<{ id: string; type: string; data: Record<string, unknown> }> = [];

    if (this.memoryGraph) {
      // Search for relevant context based on input text
      const searchTerms = this.extractKeyTerms(text);
      for (const term of searchTerms.slice(0, 3)) {
        const results = this.memoryGraph.search(term, this.maxContextNodes);
        relevantMemories.push(...results);
        contextNodes.push(...results.map((r) => r.id));
      }
    }

    // Simple interpretation logic (will be enhanced with actual models)
    const interpretation = this.performBasicInterpretation(text, relevantMemories);

    return {
      interpretation,
      confidence: this.calculateConfidence(text, relevantMemories),
      contextUsed: Array.from(new Set(contextNodes)),
      reasoning: this.explainReasoning(text, relevantMemories),
    };
  }

  private async interpretStructured(
    input: object,
    context: InterpretationContext
  ): Promise<InterpretationResult> {
    // Handle structured input (JSON objects, etc.)
    const inputData = input as Record<string, unknown>;

    return {
      interpretation: {
        type: 'structured_data',
        summary: `Received ${Object.keys(inputData).length} fields`,
        fields: Object.keys(inputData),
      },
      confidence: 0.8,
      reasoning: 'Structured input parsed successfully',
    };
  }

  private extractKeyTerms(text: string): string[] {
    // Simple keyword extraction (can be enhanced with NLP)
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for']);
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    return Array.from(new Set(words));
  }

  private performBasicInterpretation(
    text: string,
    memories: Array<{ id: string; type: string; data: Record<string, unknown> }>
  ): Record<string, unknown> {
    // Basic interpretation logic
    const intent = this.detectIntent(text);
    const entities = this.extractKeyTerms(text);
    const contextSummary = memories.map((m) => ({
      id: m.id,
      type: m.type,
      relevance: 'medium', // Simplified - would use embeddings in real implementation
    }));

    return {
      type: 'text_interpretation',
      intent,
      entities,
      contextSummary,
      inputLength: text.length,
    };
  }

  private detectIntent(text: string): string {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('?')) return 'question';
    if (lowerText.match(/^(create|add|make|build)/)) return 'create';
    if (lowerText.match(/^(update|modify|change|edit)/)) return 'update';
    if (lowerText.match(/^(delete|remove)/)) return 'delete';
    if (lowerText.match(/^(find|search|look|show|get)/)) return 'query';

    return 'statement';
  }

  private calculateConfidence(
    text: string,
    memories: Array<{ id: string; type: string; data: Record<string, unknown> }>
  ): number {
    // Simple confidence calculation
    let confidence = 0.5; // Base confidence

    // Increase confidence if we have relevant context
    if (memories.length > 0) {
      confidence += Math.min(memories.length * 0.1, 0.3);
    }

    // Increase confidence for well-formed input
    if (text.length > 10 && text.length < 1000) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  private explainReasoning(
    text: string,
    memories: Array<{ id: string; type: string; data: Record<string, unknown> }>
  ): string {
    const parts: string[] = [];

    parts.push(`Analyzed input of ${text.length} characters`);

    if (memories.length > 0) {
      parts.push(`Found ${memories.length} relevant memory nodes`);
    } else {
      parts.push('No relevant memory context found');
    }

    const intent = this.detectIntent(text);
    parts.push(`Detected intent: ${intent}`);

    return parts.join('. ');
  }
}

export default OIEngine;
