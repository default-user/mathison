/**
 * Mathison Server - Phase 3
 * Governed service with structural enforcement of CIF + CDI pipeline
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { GovernanceEngine, CDI, CIF } from 'mathison-governance';
import { loadStoreConfigFromEnv, makeStoresFromEnv, Stores } from 'mathison-storage';
import { MemoryGraph, Node, Edge } from 'mathison-memory';
import { ActionGate } from './action-gate';
import { JobExecutor } from './job-executor';
import { IdempotencyLedger } from './idempotency';
import {
  parseLimit,
  parseDepth,
  parseCursor,
  generateCursor,
  validateQueryLength,
  stableSort,
  paginate
} from './pagination';

export interface MathisonServerConfig {
  port?: number;
  host?: string;
  cdiStrictMode?: boolean;
  cifMaxRequestSize?: number;
  cifMaxResponseSize?: number;
}

export class MathisonServer {
  private app: FastifyInstance;
  private governance: GovernanceEngine;
  private cdi: CDI;
  private cif: CIF;
  private stores: Stores | null = null;
  private actionGate: ActionGate | null = null;
  private jobExecutor: JobExecutor | null = null;
  private memoryGraph: MemoryGraph | null = null;
  private idempotencyLedger: IdempotencyLedger;
  private config: Required<MathisonServerConfig>;
  private bootStatus: 'booting' | 'ready' | 'failed' = 'booting';
  private bootError: string | null = null;

  constructor(config: MathisonServerConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      host: config.host ?? '0.0.0.0',
      cdiStrictMode: config.cdiStrictMode ?? true,
      cifMaxRequestSize: config.cifMaxRequestSize ?? 1048576,
      cifMaxResponseSize: config.cifMaxResponseSize ?? 1048576
    };

    this.app = Fastify({
      logger: true,
      bodyLimit: this.config.cifMaxRequestSize
    });

    this.governance = new GovernanceEngine();
    this.cdi = new CDI({ strictMode: this.config.cdiStrictMode });
    this.cif = new CIF({
      maxRequestSize: this.config.cifMaxRequestSize,
      maxResponseSize: this.config.cifMaxResponseSize
    });
    this.idempotencyLedger = new IdempotencyLedger();
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Mathison Server (Phase 3: Governed Service)...');
    console.log(`📍 Governance: Tiriti o te Kai v1.0`);

    try {
      // P3-A: Fail-closed boot validation
      await this.initializeGovernance();
      await this.initializeStorage();

      // Register CORS
      await this.app.register(cors, {
        origin: '*'
      });

      // Register governance pipeline hooks
      this.registerGovernancePipeline();

      // Register routes
      this.registerRoutes();

      // Start server
      await this.app.listen({
        port: this.config.port,
        host: this.config.host
      });

      this.bootStatus = 'ready';
      console.log('✅ Mathison Server started successfully');
      console.log(`🌐 Listening on http://${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.bootStatus = 'failed';
      this.bootError = error instanceof Error ? error.message : String(error);
      console.error('❌ Server boot failed:', this.bootError);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Mathison Server...');
    await this.app.close();
    if (this.memoryGraph) {
      await this.memoryGraph.shutdown();
    }
    await this.cif.shutdown();
    await this.cdi.shutdown();
    await this.governance.shutdown();
    console.log('✅ Mathison Server stopped');
  }

  private async initializeGovernance(): Promise<void> {
    console.log('⚖️  Initializing governance layer (fail-closed)...');

    try {
      await this.governance.initialize();
      await this.cdi.initialize();
      await this.cif.initialize();
      console.log('✓ Governance layer initialized');
    } catch (error) {
      console.error('❌ Governance initialization failed');
      throw new Error(`GOVERNANCE_INIT_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async initializeStorage(): Promise<void> {
    console.log('💾 Initializing storage layer (fail-closed)...');

    try {
      // Fail-closed: loadStoreConfigFromEnv throws if invalid/missing
      const storeConfig = loadStoreConfigFromEnv();
      console.log(`✓ Store config: backend=${storeConfig.backend}, path=${storeConfig.path}`);

      this.stores = makeStoresFromEnv();
      await this.stores.checkpointStore.init();
      await this.stores.receiptStore.init();
      console.log('✓ Storage layer initialized');

      // Initialize ActionGate and JobExecutor
      this.actionGate = new ActionGate(this.cdi, this.cif, this.stores);
      this.jobExecutor = new JobExecutor(this.actionGate);
      console.log('✓ ActionGate and JobExecutor initialized');

      // P4-A: Initialize MemoryGraph (read-only access)
      this.memoryGraph = new MemoryGraph();
      await this.memoryGraph.initialize();
      console.log('✓ MemoryGraph initialized');
    } catch (error) {
      console.error('❌ Storage initialization failed');
      throw error; // Re-throw to fail boot
    }
  }

  private registerGovernancePipeline(): void {
    // P3-A: Mandatory governance pipeline for all requests
    // CIF Ingress happens in preValidation (after body parsing)
    this.app.addHook('preValidation', async (request, reply) => {
      const clientId = request.ip;

      // CIF Ingress
      const ingressResult = await this.cif.ingress({
        clientId,
        endpoint: request.url,
        payload: request.body ?? {},
        headers: request.headers as Record<string, string>,
        timestamp: Date.now()
      });

      if (!ingressResult.allowed) {
        reply.code(400).send({
          error: 'CIF_INGRESS_BLOCKED',
          violations: ingressResult.violations,
          quarantined: ingressResult.quarantined
        });
        return reply;
      }

      // Attach sanitized payload for downstream handlers
      (request as any).sanitizedBody = ingressResult.sanitizedPayload;
    });

    // Pre-handler: CDI action check (routes can specify action via decorateRequest)
    this.app.addHook('preHandler', async (request, reply) => {
      const action = (request as any).action ?? 'unknown';
      const clientId = request.ip;

      const actionResult = await this.cdi.checkAction({
        actor: clientId,
        action,
        payload: (request as any).sanitizedBody
      });

      if (actionResult.verdict !== 'allow') {
        reply.code(403).send({
          error: 'CDI_ACTION_DENIED',
          reason: actionResult.reason,
          alternative: actionResult.suggestedAlternative
        });
        return reply;
      }
    });

    // Pre-serialization: CDI output check + CIF egress
    this.app.addHook('onSend', async (request, reply, payload) => {
      const clientId = request.ip;

      // CDI output check
      const outputCheck = await this.cdi.checkOutput({
        content: typeof payload === 'string' ? payload : JSON.stringify(payload)
      });

      if (!outputCheck.allowed) {
        reply.code(403);
        return JSON.stringify({
          error: 'CDI_OUTPUT_BLOCKED',
          violations: outputCheck.violations
        });
      }

      // CIF egress
      const egressResult = await this.cif.egress({
        clientId,
        endpoint: request.url,
        payload: typeof payload === 'string' ? JSON.parse(payload) : payload
      });

      if (!egressResult.allowed) {
        reply.code(403);
        return JSON.stringify({
          error: 'CIF_EGRESS_BLOCKED',
          violations: egressResult.violations,
          leaks: egressResult.leaksDetected
        });
      }

      return JSON.stringify(egressResult.sanitizedPayload);
    });
  }

  private registerRoutes(): void {
    // P3-A: GET /health - governance status check
    this.app.get('/health', async (request, reply) => {
      (request as any).action = 'health_check';

      if (this.bootStatus !== 'ready') {
        return reply.code(503).send({
          status: 'unhealthy',
          bootStatus: this.bootStatus,
          error: this.bootError
        });
      }

      return {
        status: 'healthy',
        bootStatus: this.bootStatus,
        governance: {
          treaty: {
            version: this.governance.getTreatyVersion(),
            authority: this.governance.getTreatyAuthority()
          },
          cdi: {
            strictMode: this.config.cdiStrictMode,
            initialized: true
          },
          cif: {
            maxRequestSize: this.config.cifMaxRequestSize,
            maxResponseSize: this.config.cifMaxResponseSize,
            initialized: true
          }
        },
        storage: {
          initialized: this.stores !== null
        },
        memory: {
          initialized: this.memoryGraph !== null
        }
      };
    });

    // P3-C: POST /jobs/run - execute job
    this.app.post('/jobs/run', async (request, reply) => {
      (request as any).action = 'job_run';
      const actor = request.ip;
      const body = (request as any).sanitizedBody as any;

      if (!this.jobExecutor) {
        return reply.code(503).send({
          error: 'Job executor not initialized'
        });
      }

      const result = await this.jobExecutor.runJob(actor, {
        jobType: body.jobType ?? 'default',
        inputs: body.inputs,
        policyId: body.policyId,
        jobId: body.jobId
      });

      return result;
    });

    // P3-C: GET /jobs/:job_id/status - get job status
    this.app.get('/jobs/:job_id/status', async (request, reply) => {
      (request as any).action = 'job_status';
      const { job_id } = request.params as { job_id: string };

      if (!this.jobExecutor) {
        return reply.code(503).send({
          error: 'Job executor not initialized'
        });
      }

      const status = await this.jobExecutor.getStatus(job_id);

      if (!status) {
        return reply.code(404).send({
          error: 'Job not found',
          job_id
        });
      }

      return status;
    });

    // P3-C: POST /jobs/:job_id/resume - resume job
    this.app.post('/jobs/:job_id/resume', async (request, reply) => {
      (request as any).action = 'job_resume';
      const actor = request.ip;
      const { job_id } = request.params as { job_id: string };

      if (!this.jobExecutor) {
        return reply.code(503).send({
          error: 'Job executor not initialized'
        });
      }

      const result = await this.jobExecutor.resumeJob(actor, job_id);

      return result;
    });

    // P3-C: GET /receipts/:job_id - get job receipts (optional)
    this.app.get('/receipts/:job_id', async (request, reply) => {
      (request as any).action = 'receipts_read';
      const { job_id } = request.params as { job_id: string };
      const { limit } = request.query as { limit?: string };

      if (!this.actionGate) {
        return reply.code(503).send({
          error: 'ActionGate not initialized'
        });
      }

      const receipts = await this.actionGate.readReceipts(
        job_id,
        limit ? parseInt(limit, 10) : undefined
      );

      return {
        job_id,
        count: receipts.length,
        receipts
      };
    });

    // P4-A: GET /memory/nodes/:id - retrieve node by ID (read-only)
    this.app.get('/memory/nodes/:id', async (request, reply) => {
      (request as any).action = 'memory_read_node';
      const { id } = request.params as { id: string };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      const node = this.memoryGraph.getNode(id);
      if (!node) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Node not found: ${id}`
        });
      }

      return node;
    });

    // P4-C: GET /memory/nodes/:id/edges - paginated edges with filtering
    this.app.get('/memory/nodes/:id/edges', async (request, reply) => {
      (request as any).action = 'memory_read_edges';
      const { id } = request.params as { id: string };
      const { limit, cursor, direction, types } = request.query as {
        limit?: string;
        cursor?: string;
        direction?: string;
        types?: string;
      };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      // Check if node exists first
      const node = this.memoryGraph.getNode(id);
      if (!node) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Node not found: ${id}`
        });
      }

      // Parse and validate pagination parameters
      let parsedLimit;
      let parsedCursor;
      try {
        parsedLimit = parseLimit(limit);
        parsedCursor = parseCursor(cursor);
      } catch (error) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: error instanceof Error ? error.message : String(error)
        });
      }

      // Validate cursor
      if (!parsedCursor.isValid) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Invalid cursor parameter'
        });
      }

      // Validate direction parameter
      const validDirections = ['in', 'out', 'both'];
      const parsedDirection = (direction || 'both') as 'in' | 'out' | 'both';
      if (!validDirections.includes(parsedDirection)) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: `Invalid direction parameter: must be one of ${validDirections.join(', ')}`
        });
      }

      // Parse types filter (comma-separated)
      const parsedTypes = types ? types.split(',').map(t => t.trim()).filter(t => t.length > 0) : undefined;

      // Get filtered edges
      const edges = this.memoryGraph.getNodeEdgesFiltered(id, parsedDirection, parsedTypes);

      // Apply deterministic ordering
      const sortedEdges = stableSort(edges);

      // Apply pagination
      const paginated = paginate(sortedEdges, parsedCursor.offset, parsedLimit.value);

      return {
        node_id: id,
        direction: parsedDirection,
        types: parsedTypes,
        limit: parsedLimit.value,
        count: paginated.results.length,
        total: sortedEdges.length,
        edges: paginated.results,
        next_cursor: paginated.next_cursor
      };
    });

    // P4-C: GET /memory/traverse - bounded graph traversal
    this.app.get('/memory/traverse', async (request, reply) => {
      (request as any).action = 'memory_traverse';
      const { start, direction, depth, limit, cursor, types } = request.query as {
        start?: string;
        direction?: string;
        depth?: string;
        limit?: string;
        cursor?: string;
        types?: string;
      };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      // Validate start node parameter
      if (!start || start.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty required parameter "start"'
        });
      }

      // Check if start node exists
      const startNode = this.memoryGraph.getNode(start);
      if (!startNode) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Start node not found: ${start}`
        });
      }

      // Parse and validate pagination/traversal parameters
      let parsedLimit;
      let parsedDepth;
      let parsedCursor;
      try {
        parsedLimit = parseLimit(limit);
        parsedDepth = parseDepth(depth);
        parsedCursor = parseCursor(cursor);
      } catch (error) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: error instanceof Error ? error.message : String(error)
        });
      }

      // Validate cursor
      if (!parsedCursor.isValid) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Invalid cursor parameter'
        });
      }

      // Validate direction parameter
      const validDirections = ['in', 'out', 'both'];
      const parsedDirection = (direction || 'both') as 'in' | 'out' | 'both';
      if (!validDirections.includes(parsedDirection)) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: `Invalid direction parameter: must be one of ${validDirections.join(', ')}`
        });
      }

      // Parse types filter (comma-separated)
      const parsedTypes = types ? types.split(',').map(t => t.trim()).filter(t => t.length > 0) : undefined;

      // Execute bounded traversal
      const { nodes, edges } = this.memoryGraph.traverse(
        start,
        parsedDirection,
        parsedDepth.value,
        parsedTypes
      );

      // Apply deterministic ordering to both nodes and edges
      const sortedNodes = stableSort(nodes);
      const sortedEdges = stableSort(edges);

      // Apply pagination to nodes (limit applies to nodes discovered)
      const paginatedNodes = paginate(sortedNodes, parsedCursor.offset, parsedLimit.value);

      // Return edges only for the paginated nodes (for response size control)
      // Include all edges that connect nodes in the current page
      const nodeIdsInPage = new Set(paginatedNodes.results.map(n => n.id));
      const edgesForPage = sortedEdges.filter(
        e => nodeIdsInPage.has(e.source) || nodeIdsInPage.has(e.target)
      );

      return {
        start,
        direction: parsedDirection,
        depth: parsedDepth.value,
        types: parsedTypes,
        limit: parsedLimit.value,
        nodes: paginatedNodes.results,
        node_count: paginatedNodes.results.length,
        total_nodes: sortedNodes.length,
        edges: edgesForPage,
        edge_count: edgesForPage.length,
        total_edges: sortedEdges.length,
        next_cursor: paginatedNodes.next_cursor
      };
    });

    // P4-C: GET /memory/search - paginated search with deterministic ordering
    this.app.get('/memory/search', async (request, reply) => {
      (request as any).action = 'memory_search';
      const { q, limit, cursor } = request.query as {
        q?: string;
        limit?: string;
        cursor?: string;
      };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      // Validate and sanitize query parameter
      if (!q || q.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty query parameter "q"'
        });
      }

      let validatedQuery;
      try {
        validatedQuery = validateQueryLength(q);
      } catch (error) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: error instanceof Error ? error.message : String(error)
        });
      }

      // Parse and validate pagination parameters
      let parsedLimit;
      let parsedCursor;
      try {
        parsedLimit = parseLimit(limit);
        parsedCursor = parseCursor(cursor);
      } catch (error) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: error instanceof Error ? error.message : String(error)
        });
      }

      // Validate cursor
      if (!parsedCursor.isValid) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Invalid cursor parameter'
        });
      }

      // Search with unbounded limit to get all results for deterministic ordering
      // We'll apply pagination after sorting
      const allResults = this.memoryGraph.search(validatedQuery, Number.MAX_SAFE_INTEGER);

      // Apply deterministic ordering
      const sortedResults = stableSort(allResults);

      // Apply pagination
      const paginated = paginate(sortedResults, parsedCursor.offset, parsedLimit.value);

      return {
        query: validatedQuery,
        limit: parsedLimit.value,
        count: paginated.results.length,
        total: sortedResults.length,
        results: paginated.results,
        next_cursor: paginated.next_cursor
      };
    });

    // P4-B: POST /memory/nodes - create node (write with ActionGate + idempotency)
    this.app.post('/memory/nodes', async (request, reply) => {
      (request as any).action = 'memory_create_node';
      const actor = request.ip;
      const body = (request as any).sanitizedBody as any;

      // Validate required fields
      if (!body.idempotency_key || typeof body.idempotency_key !== 'string' || body.idempotency_key.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty required field: idempotency_key'
        });
      }

      if (!body.type || typeof body.type !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: type'
        });
      }

      if (!this.memoryGraph || !this.actionGate) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph or ActionGate not initialized'
        });
      }

      // Generate request hash for idempotency
      const requestHash = IdempotencyLedger.generateRequestHash(
        '/memory/nodes',
        body,
        body.idempotency_key
      );

      // Check if request already processed
      const cachedResponse = this.idempotencyLedger.get(requestHash);
      if (cachedResponse) {
        return reply.code(cachedResponse.statusCode).send(cachedResponse.body);
      }

      // Generate node ID if not provided
      const nodeId = body.id || `node-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Check if node already exists
      const existingNode = this.memoryGraph.getNode(nodeId);
      if (existingNode) {
        // Check if payload matches (idempotent create)
        const payloadMatches =
          existingNode.type === body.type &&
          JSON.stringify(existingNode.data) === JSON.stringify(body.data || {});

        if (payloadMatches) {
          // Idempotent: return existing node
          const response = {
            statusCode: 200,
            body: {
              node: existingNode,
              created: false,
              message: 'Node already exists with identical payload'
            }
          };
          this.idempotencyLedger.set(requestHash, response);
          return reply.code(200).send(response.body);
        } else {
          // Conflict: node exists with different payload
          return reply.code(409).send({
            reason_code: 'MALFORMED_REQUEST',
            message: `Node ${nodeId} already exists with different payload`
          });
        }
      }

      // Execute node creation through ActionGate
      const node: Node = {
        id: nodeId,
        type: body.type,
        data: body.data || {},
        metadata: body.metadata
      };

      const result = await this.actionGate.executeSideEffect(
        {
          actor,
          action: 'MEMORY_NODE_CREATE',
          payload: node,
          metadata: {
            job_id: 'memory',
            stage: 'memory_write',
            policy_id: 'default',
            idempotency_key: body.idempotency_key,
            request_hash: requestHash
          }
        },
        async () => {
          this.memoryGraph!.addNode(node);
          return node;
        }
      );

      if (!result.success) {
        const errorResponse = {
          statusCode: 403,
          body: {
            reason_code: result.governance.reasonCode,
            message: result.governance.message
          }
        };
        this.idempotencyLedger.set(requestHash, errorResponse);
        return reply.code(403).send(errorResponse.body);
      }

      const successResponse = {
        statusCode: 201,
        body: {
          node: result.data,
          created: true,
          receipt: result.receipt
        }
      };
      this.idempotencyLedger.set(requestHash, successResponse);
      return reply.code(201).send(successResponse.body);
    });

    // P4-B: POST /memory/edges - create edge (write with ActionGate + idempotency)
    this.app.post('/memory/edges', async (request, reply) => {
      (request as any).action = 'memory_create_edge';
      const actor = request.ip;
      const body = (request as any).sanitizedBody as any;

      // Validate required fields
      if (!body.idempotency_key || typeof body.idempotency_key !== 'string' || body.idempotency_key.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty required field: idempotency_key'
        });
      }

      if (!body.from || typeof body.from !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: from'
        });
      }

      if (!body.to || typeof body.to !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: to'
        });
      }

      if (!body.type || typeof body.type !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: type'
        });
      }

      if (!this.memoryGraph || !this.actionGate) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph or ActionGate not initialized'
        });
      }

      // Verify source and target nodes exist
      const sourceNode = this.memoryGraph.getNode(body.from);
      if (!sourceNode) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Source node not found: ${body.from}`
        });
      }

      const targetNode = this.memoryGraph.getNode(body.to);
      if (!targetNode) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Target node not found: ${body.to}`
        });
      }

      // Generate request hash for idempotency
      const requestHash = IdempotencyLedger.generateRequestHash(
        '/memory/edges',
        body,
        body.idempotency_key
      );

      // Check if request already processed
      const cachedResponse = this.idempotencyLedger.get(requestHash);
      if (cachedResponse) {
        return reply.code(cachedResponse.statusCode).send(cachedResponse.body);
      }

      // Generate edge ID if not provided
      const edgeId = body.id || `edge-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Execute edge creation through ActionGate
      const edge: Edge = {
        id: edgeId,
        source: body.from,
        target: body.to,
        type: body.type,
        metadata: body.metadata
      };

      const result = await this.actionGate.executeSideEffect(
        {
          actor,
          action: 'MEMORY_EDGE_CREATE',
          payload: edge,
          metadata: {
            job_id: 'memory',
            stage: 'memory_write',
            policy_id: 'default',
            idempotency_key: body.idempotency_key,
            request_hash: requestHash
          }
        },
        async () => {
          this.memoryGraph!.addEdge(edge);
          return edge;
        }
      );

      if (!result.success) {
        const errorResponse = {
          statusCode: 403,
          body: {
            reason_code: result.governance.reasonCode,
            message: result.governance.message
          }
        };
        this.idempotencyLedger.set(requestHash, errorResponse);
        return reply.code(403).send(errorResponse.body);
      }

      const successResponse = {
        statusCode: 201,
        body: {
          edge: result.data,
          created: true,
          receipt: result.receipt
        }
      };
      this.idempotencyLedger.set(requestHash, successResponse);
      return reply.code(201).send(successResponse.body);
    });

    // Catch-all for unknown routes (fail-closed)
    this.app.setNotFoundHandler(async (request, reply) => {
      return reply.code(404).send({
        reason_code: 'ROUTE_NOT_FOUND',
        message: 'Unknown endpoint - denied by fail-closed policy',
        details: {
          url: request.url,
          method: request.method
        }
      });
    });
  }

  getApp(): FastifyInstance {
    return this.app;
  }
}

// CLI entry point
if (require.main === module) {
  const server = new MathisonServer();
  server.start().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

// Public API exports
export default MathisonServer;
export { ActionGate } from './action-gate';
export { JobExecutor, JobRequest, JobResult } from './job-executor';
export {
  GovernanceReasonCode,
  GovernanceDecision,
  GovernanceResult,
  GovernanceError
} from './action-gate/reason-codes';
