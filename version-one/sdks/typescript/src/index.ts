/**
 * Mathison TypeScript SDK
 * Generated from mathison-server OpenAPI (canonical product API)
 *
 * IMPORTANT: This client targets mathison-server (port 3000), NOT kernel-mac.
 */

export interface MathisonClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  bootStatus: 'booting' | 'ready' | 'failed';
  governance: {
    treaty: { version: string; authority: string };
    genome: { name: string; version: string; genome_id: string; initialized: boolean };
  };
}

export interface GenomeMetadata {
  genome_id: string;
  name: string;
  version: string;
  parents: string[];
  created_at: string;
  invariants: Array<{ id: string; severity: string; testable_claim: string }>;
  capabilities: Array<{ cap_id: string; risk_class: string; allow_count: number; deny_count: number }>;
}

export interface JobRunRequest {
  jobType: string;
  inputs?: Record<string, unknown>;
  policyId?: string;
  jobId?: string;
}

export interface JobResult {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'suspended';
  outputs?: Record<string, unknown>;
  genome_id?: string;
  genome_version?: string;
}

export interface JobLogsResponse {
  job_id: string;
  count: number;
  receipts: Receipt[];
}

export interface Receipt {
  timestamp: string;
  job_id: string;
  stage: string;
  action: string;
  decision: 'ALLOW' | 'DENY';
  policy_id?: string;
  genome_id?: string;
  genome_version?: string;
}

export interface Node {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateNodeRequest {
  idempotency_key: string;
  id?: string;
  type: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateEdgeRequest {
  idempotency_key: string;
  from: string;
  to: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface CreateHyperedgeRequest {
  idempotency_key: string;
  id?: string;
  nodes: string[];
  type: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  limit: number;
  count: number;
  results: Node[];
}

export interface InterpretRequest {
  text: string;
  limit?: number;
}

export interface InterpretResponse {
  interpretation: string;
  confidence: number;
  citations: Array<{ node_id: string; why: string }>;
  genome: { id: string; version: string };
}

export class MathisonClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(options: MathisonClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
        throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Get active genome metadata
  // Action: genome_read (READ)
  async getGenome(): Promise<GenomeMetadata> {
    return this.request('GET', '/genome');
  }

  // Health check

  async getHealth(): Promise<HealthResponse> {
    return this.request('GET', '/health');
  }

  // Get job logs/receipts
  // Action: receipts_read (READ)
  async getJobLogs(job_id?: string, limit?: string): Promise<void> {
    return this.request('GET', '/jobs/logs', undefined, { job_id, limit });
  }

  // Resume a suspended job
  // Action: job_resume (WRITE)
  async resumeJob(body: { job_id: string }): Promise<void> {
    return this.request('POST', '/jobs/resume', body);
  }

  // Run a job
  // Action: job_run (WRITE)
  async runJob(body: JobRunRequest): Promise<JobResult> {
    return this.request('POST', '/jobs/run', body);
  }

  // Get job status
  // Action: job_status (READ)
  async getJobStatus(job_id?: string, limit?: string): Promise<void> {
    return this.request('GET', '/jobs/status', undefined, { job_id, limit });
  }

  // Create a new edge
  // Action: memory_create_edge (WRITE)
  async createEdge(body: CreateEdgeRequest): Promise<void> {
    return this.request('POST', '/memory/edges', body);
  }

  // Get edge by ID
  // Action: memory_read_edge (READ)
  async getEdge(id: string): Promise<void> {
    return this.request('GET', `/memory/edges/${id}`);
  }

  // Create a new hyperedge
  // Action: memory_create_hyperedge (WRITE)
  async createHyperedge(body: CreateHyperedgeRequest): Promise<void> {
    return this.request('POST', '/memory/hyperedges', body);
  }

  // Get hyperedge by ID
  // Action: memory_read_hyperedge (READ)
  async getHyperedge(id: string): Promise<void> {
    return this.request('GET', `/memory/hyperedges/${id}`);
  }

  // Create a new node
  // Action: memory_create_node (WRITE)
  async createNode(body: CreateNodeRequest): Promise<{ node: Node; created: boolean }> {
    return this.request('POST', '/memory/nodes', body);
  }

  // Get node by ID
  // Action: memory_read_node (READ)
  async getNode(id: string): Promise<Node> {
    return this.request('GET', `/memory/nodes/${id}`);
  }

  // Update node by ID
  // Action: memory_update_node (WRITE)
  async updateNode(id: string, body: Partial<CreateNodeRequest>): Promise<{ node: Node; updated: boolean }> {
    return this.request('POST', `/memory/nodes/${id}`, body);
  }

  // Get edges for node
  // Action: memory_read_edges (READ)
  async getNodeEdges(id: string): Promise<void> {
    return this.request('GET', `/memory/nodes/${id}/edges`);
  }

  // Get hyperedges for node
  // Action: memory_read_hyperedges (READ)
  async getNodeHyperedges(id: string): Promise<void> {
    return this.request('GET', `/memory/nodes/${id}/hyperedges`);
  }

  // Search nodes
  // Action: memory_search (READ)
  async searchNodes(q?: string, limit?: string): Promise<SearchResponse> {
    return this.request('GET', '/memory/search', undefined, { q, limit });
  }

  // Interpret text using memory context
  // Action: oi_interpret (READ)
  async interpret(body: InterpretRequest): Promise<InterpretResponse> {
    return this.request('POST', '/oi/interpret', body);
  }

  // OpenAPI specification

  async getOpenAPI(): Promise<void> {
    return this.request('GET', '/openapi.json');
  }
}

export default MathisonClient;
