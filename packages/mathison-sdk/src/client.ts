/**
 * Mathison SDK Client
 * TypeScript client for the Mathison OI system
 *
 * Implements governance-aware communication with Mathison Server
 * following the architecture defined in docs/architecture.md
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  HealthStatus,
  JobRequest,
  JobResult,
  JobStatus,
  Receipt,
  ReceiptsResponse,
  Node,
  Edge,
  NodeEdgesResponse,
  SearchResponse,
  CreateNodeRequest,
  CreateNodeResponse,
  CreateEdgeRequest,
  CreateEdgeResponse,
  ErrorResponse,
  GovernanceError,
  GovernanceReasonCode
} from './types';

export interface MathisonClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class MathisonClient {
  private http: AxiosInstance;
  private baseURL: string;

  constructor(config: MathisonClientConfig) {
    this.baseURL = config.baseURL;
    this.http = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      }
    });

    // Add response interceptor for governance-aware error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ErrorResponse>) => {
        throw this.handleError(error);
      }
    );
  }

  // ==========================================================================
  // Health & Status
  // ==========================================================================

  /**
   * Check server health and governance status
   * @returns Health status including governance layer info
   */
  async health(): Promise<HealthStatus> {
    const response = await this.http.get<HealthStatus>('/health');
    return response.data;
  }

  /**
   * Verify server is ready to accept requests
   * @returns true if server is healthy and ready
   */
  async isReady(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === 'healthy' && health.bootStatus === 'ready';
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Job Execution
  // ==========================================================================

  /**
   * Submit a job for execution
   * @param request Job request with inputs and optional policy
   * @returns Job result with governance decision and receipt
   */
  async runJob(request: JobRequest): Promise<JobResult> {
    const response = await this.http.post<JobResult>('/jobs/run', request);
    return response.data;
  }

  /**
   * Get job status by ID
   * @param jobId Job identifier
   * @returns Current job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await this.http.get<JobStatus>(`/jobs/${jobId}/status`);
    return response.data;
  }

  /**
   * Resume a paused or failed job
   * @param jobId Job identifier
   * @returns Job result from resume operation
   */
  async resumeJob(jobId: string): Promise<JobResult> {
    const response = await this.http.post<JobResult>(`/jobs/${jobId}/resume`);
    return response.data;
  }

  /**
   * Get receipts for a job (audit trail)
   * @param jobId Job identifier
   * @param limit Maximum number of receipts to return
   * @returns Collection of receipts for the job
   */
  async getReceipts(jobId: string, limit?: number): Promise<ReceiptsResponse> {
    const params = limit ? { limit: limit.toString() } : {};
    const response = await this.http.get<ReceiptsResponse>(`/receipts/${jobId}`, { params });
    return response.data;
  }

  // ==========================================================================
  // Memory Graph - Read Operations
  // ==========================================================================

  /**
   * Get a node by ID
   * @param nodeId Node identifier
   * @returns Node data
   */
  async getNode(nodeId: string): Promise<Node> {
    const response = await this.http.get<Node>(`/memory/nodes/${nodeId}`);
    return response.data;
  }

  /**
   * Get all edges connected to a node
   * @param nodeId Node identifier
   * @returns Collection of edges
   */
  async getNodeEdges(nodeId: string): Promise<NodeEdgesResponse> {
    const response = await this.http.get<NodeEdgesResponse>(`/memory/nodes/${nodeId}/edges`);
    return response.data;
  }

  /**
   * Search nodes by query string
   * @param query Search query
   * @param limit Maximum number of results (1-100, default 10)
   * @returns Search results
   */
  async searchNodes(query: string, limit?: number): Promise<SearchResponse> {
    const params: any = { q: query };
    if (limit !== undefined) {
      params.limit = limit.toString();
    }
    const response = await this.http.get<SearchResponse>('/memory/search', { params });
    return response.data;
  }

  // ==========================================================================
  // Memory Graph - Write Operations
  // ==========================================================================

  /**
   * Create a new node in the memory graph
   * Requires idempotency key for safe retries
   * @param request Node creation request
   * @returns Created node with receipt
   */
  async createNode(request: CreateNodeRequest): Promise<CreateNodeResponse> {
    const response = await this.http.post<CreateNodeResponse>('/memory/nodes', request);
    return response.data;
  }

  /**
   * Create a new edge between nodes
   * Requires idempotency key for safe retries
   * @param request Edge creation request
   * @returns Created edge with receipt
   */
  async createEdge(request: CreateEdgeRequest): Promise<CreateEdgeResponse> {
    const response = await this.http.post<CreateEdgeResponse>('/memory/edges', request);
    return response.data;
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  /**
   * Convert axios errors to governance-aware errors
   * @param error Axios error from HTTP request
   * @returns GovernanceError with structured information
   */
  private handleError(error: AxiosError<ErrorResponse>): GovernanceError {
    const data = error.response?.data;
    const status = error.response?.status ?? 0;

    // Extract governance information from error response
    const reasonCode: GovernanceReasonCode = data?.reason_code ?? this.inferReasonCode(status);
    const message = data?.message ?? data?.error ?? error.message;
    const violations = data?.violations;

    const govError = new Error(message) as GovernanceError;
    govError.name = 'GovernanceError';
    govError.reasonCode = reasonCode;
    govError.message = message;
    if (violations) {
      govError.violations = violations;
    }

    return govError;
  }

  /**
   * Infer reason code from HTTP status when not provided
   */
  private inferReasonCode(status: number): GovernanceReasonCode {
    switch (status) {
      case 400:
        return 'MALFORMED_REQUEST';
      case 403:
        return 'CDI_DENIED';
      case 404:
        return 'ROUTE_NOT_FOUND';
      case 503:
        return 'GOVERNANCE_INIT_FAILED';
      default:
        return 'CDI_DENIED';
    }
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Get the base URL for this client
   */
  getBaseURL(): string {
    return this.baseURL;
  }

  /**
   * Generate an idempotency key for write operations
   * Uses timestamp + random suffix
   */
  static generateIdempotencyKey(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
  }
}

export default MathisonClient;
