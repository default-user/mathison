/**
 * OI Interpreter - Deterministic interpretation using MemoryGraph context
 * Phase 2: Governed OI endpoint
 *
 * BEHAVIOR:
 * - Deterministic: uses MemoryGraph search results to ground response
 * - No external LLM calls required (simple pattern matching + graph context)
 * - Fail-closed if memory backend unavailable or governance denies
 * - Governed: CIF ingress/egress + CDI action check
 */

export interface MemoryGraph {
  search(query: string, limit?: number): Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
  }>;
  getNode(id: string): { id: string; type: string; data: Record<string, unknown> } | undefined;
}

export interface InterpretRequest {
  text: string;
  limit?: number;
}

export interface Citation {
  node_id: string;
  why: string;
}

export interface InterpretResponse {
  interpretation: string;
  confidence: number;
  citations: Citation[];
  genome: {
    id: string;
    version: string;
  };
}

export class Interpreter {
  private memoryGraph?: MemoryGraph;
  private genomeId?: string;
  private genomeVersion?: string;

  constructor(
    memoryGraph?: MemoryGraph,
    genomeId?: string,
    genomeVersion?: string
  ) {
    this.memoryGraph = memoryGraph;
    this.genomeId = genomeId;
    this.genomeVersion = genomeVersion;
  }

  /**
   * Interpret text using memory graph context
   * Returns deterministic interpretation based on graph search
   */
  async interpret(request: InterpretRequest): Promise<InterpretResponse> {
    // Fail-closed: require memory graph
    if (!this.memoryGraph) {
      throw new Error('Memory backend unavailable');
    }

    // Fail-closed: require genome metadata
    if (!this.genomeId || !this.genomeVersion) {
      throw new Error('Genome metadata missing');
    }

    const { text, limit = 5 } = request;

    // Validate input
    if (!text || text.trim() === '') {
      throw new Error('Empty text input');
    }

    // Extract key terms from input
    const keyTerms = this.extractKeyTerms(text);

    // Search memory graph for relevant context
    const citations: Citation[] = [];
    const contextNodes: Array<{ id: string; type: string; data: Record<string, unknown> }> = [];

    for (const term of keyTerms.slice(0, 3)) {
      const results = this.memoryGraph.search(term, limit);
      for (const node of results) {
        // Avoid duplicates
        if (!contextNodes.find(n => n.id === node.id)) {
          contextNodes.push(node);
          citations.push({
            node_id: node.id,
            why: `Matched search term: "${term}"`
          });
        }
        if (contextNodes.length >= limit) break;
      }
      if (contextNodes.length >= limit) break;
    }

    // Generate deterministic interpretation
    const interpretation = this.generateInterpretation(text, contextNodes);
    const confidence = this.calculateConfidence(text, contextNodes);

    return {
      interpretation,
      confidence,
      citations: citations.slice(0, limit),
      genome: {
        id: this.genomeId,
        version: this.genomeVersion
      }
    };
  }

  /**
   * Extract key terms from text (simple stopword filtering)
   */
  private extractKeyTerms(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
      'to', 'for', 'of', 'with', 'by', 'from', 'this', 'that', 'these',
      'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    return Array.from(new Set(words));
  }

  /**
   * Generate deterministic interpretation from context
   */
  private generateInterpretation(
    text: string,
    contextNodes: Array<{ id: string; type: string; data: Record<string, unknown> }>
  ): string {
    if (contextNodes.length === 0) {
      return `Query: "${text}". No relevant context found in memory graph.`;
    }

    // Summarize context nodes
    const nodeTypes = new Map<string, number>();
    for (const node of contextNodes) {
      nodeTypes.set(node.type, (nodeTypes.get(node.type) || 0) + 1);
    }

    const typeSummary = Array.from(nodeTypes.entries())
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');

    const interpretation = [
      `Query: "${text}".`,
      `Found ${contextNodes.length} relevant node${contextNodes.length > 1 ? 's' : ''} in memory graph: ${typeSummary}.`,
      `Top match: ${contextNodes[0].type} (${contextNodes[0].id}).`
    ].join(' ');

    return interpretation;
  }

  /**
   * Calculate confidence score based on context quality
   */
  private calculateConfidence(
    text: string,
    contextNodes: Array<{ id: string; type: string; data: Record<string, unknown> }>
  ): number {
    // Base confidence
    let confidence = 0.3;

    // Increase confidence based on number of context nodes
    if (contextNodes.length > 0) {
      confidence += Math.min(contextNodes.length * 0.1, 0.5);
    }

    // Increase confidence for well-formed queries
    if (text.length > 10 && text.length < 500) {
      confidence += 0.1;
    }

    // Decrease confidence for very short queries
    if (text.length < 5) {
      confidence -= 0.2;
    }

    return Math.max(0, Math.min(confidence, 1.0));
  }
}

export default Interpreter;
