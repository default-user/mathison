/**
 * Mathison Server - Phase 3
 * Governed service with structural enforcement of CIF + CDI pipeline
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { GovernanceEngine, CDI, CIF, AuditLogger } from 'mathison-governance';
import { loadStoreConfigFromEnv, makeStoresFromEnv, Stores } from 'mathison-storage';
import { MemoryGraph, Node, Edge, PostgreSQLBackend, MemoryBackend, InMemoryBackend } from 'mathison-memory';
import { MigrationRunner } from 'mathison-memory/dist/migrations/runner';
import { OIEngine } from 'mathison-oi';
import { ActionGate } from './action-gate';
import { JobExecutor } from './job-executor';
import { IdempotencyLedger } from './idempotency';
import * as path from 'path';

export interface MathisonServerConfig {
  port?: number;
  host?: string;
  cdiStrictMode?: boolean;
  cifMaxRequestSize?: number;
  cifMaxResponseSize?: number;
  memoryBackend?: 'memory' | 'postgres';
  postgresConfig?: {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    connectionString?: string;
  };
}

export class MathisonServer {
  private app: FastifyInstance;
  private governance: GovernanceEngine;
  private cdi: CDI;
  private cif: CIF;
  private auditLogger: AuditLogger;
  private stores: Stores | null = null;
  private actionGate: ActionGate | null = null;
  private jobExecutor: JobExecutor | null = null;
  private memoryGraph: MemoryGraph | null = null;
  private memoryBackend: MemoryBackend | null = null;
  private memoryBackendType: 'memory' | 'postgres' = 'memory';
  private oiEngine: OIEngine | null = null;
  private idempotencyLedger: IdempotencyLedger;
  private config: {
    port: number;
    host: string;
    cdiStrictMode: boolean;
    cifMaxRequestSize: number;
    cifMaxResponseSize: number;
    memoryBackend?: 'memory' | 'postgres';
    postgresConfig?: {
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      connectionString?: string;
    };
  };
  private bootStatus: 'booting' | 'ready' | 'failed' = 'booting';
  private bootError: string | null = null;

  constructor(config: MathisonServerConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      host: config.host ?? '0.0.0.0',
      cdiStrictMode: config.cdiStrictMode ?? true,
      cifMaxRequestSize: config.cifMaxRequestSize ?? 1048576,
      cifMaxResponseSize: config.cifMaxResponseSize ?? 1048576,
      memoryBackend: config.memoryBackend,
      postgresConfig: config.postgresConfig
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
    this.auditLogger = new AuditLogger({ enabled: true });
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
    if (this.oiEngine) {
      await this.oiEngine.shutdown();
    }
    if (this.memoryGraph) {
      await this.memoryGraph.shutdown();
    }
    await this.auditLogger.shutdown();
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
      await this.auditLogger.initialize();
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

      // P3-A: Initialize MemoryGraph with backend selection
      await this.initializeMemoryBackend();

      // Initialize OI Engine with memory graph integration
      this.oiEngine = new OIEngine({ enableMemoryIntegration: true });
      await this.oiEngine.initialize(this.memoryGraph!);
      console.log('✓ OI Engine initialized');
    } catch (error) {
      console.error('❌ Storage initialization failed');
      throw error; // Re-throw to fail boot
    }
  }

  private async initializeMemoryBackend(): Promise<void> {
    const backendType = process.env.MATHISON_MEMORY_BACKEND || this.config.memoryBackend || 'memory';
    this.memoryBackendType = backendType as 'memory' | 'postgres';
    console.log(`🧠 Initializing MemoryGraph with ${backendType} backend...`);

    let backend: MemoryBackend;

    if (backendType === 'postgres') {
      // PostgreSQL backend configuration
      const postgresConfig = this.config.postgresConfig || {
        host: process.env.PGHOST || 'localhost',
        port: parseInt(process.env.PGPORT || '5432'),
        database: process.env.PGDATABASE || 'mathison',
        user: process.env.PGUSER || 'mathison',
        password: process.env.PGPASSWORD,
        connectionString: process.env.DATABASE_URL
      };

      console.log(`🗄️  PostgreSQL config: ${postgresConfig.host}:${postgresConfig.port}/${postgresConfig.database}`);

      // Run migrations first
      const migrationsPath = path.join(__dirname, '../../mathison-memory/migrations');
      console.log(`📊 Running migrations from ${migrationsPath}...`);

      const migrationRunner = new MigrationRunner(postgresConfig);
      try {
        await migrationRunner.initialize();
        await migrationRunner.runMigrations(migrationsPath);
        await migrationRunner.shutdown();
        console.log('✓ Migrations complete');
      } catch (error) {
        console.error('❌ Migration failed:', error);
        throw new Error(`MIGRATION_FAILED: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Create PostgreSQL backend
      backend = new PostgreSQLBackend(postgresConfig);
    } else {
      // Default to in-memory backend
      console.log('📦 Using in-memory backend (no persistence)');
      backend = new InMemoryBackend();
    }

    // Initialize MemoryGraph with selected backend
    this.memoryBackend = backend;
    this.memoryGraph = new MemoryGraph(backend);
    await this.memoryGraph.initialize();
    console.log('✓ MemoryGraph initialized');
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

      // Audit log ingress
      this.auditLogger.logIngress(
        clientId,
        request.url,
        ingressResult.allowed,
        ingressResult.violations
      );

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

      // Audit log action check
      this.auditLogger.logAction(
        clientId,
        action,
        actionResult.verdict === 'allow',
        actionResult.verdict,
        actionResult.reason
      );

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

      // Audit log output check
      this.auditLogger.logOutput(
        clientId,
        outputCheck.allowed,
        outputCheck.violations
      );

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

      // Audit log egress
      this.auditLogger.logEgress(
        clientId,
        request.url,
        egressResult.allowed,
        egressResult.violations,
        egressResult.leaksDetected
      );

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

      // Test database connectivity if using PostgreSQL
      let dbHealthy = true;
      let dbError: string | undefined;
      if (this.memoryBackendType === 'postgres' && this.memoryBackend) {
        try {
          // Quick health check: try to get all nodes (should be fast even if empty)
          await this.memoryBackend.getAllNodes();
        } catch (error) {
          dbHealthy = false;
          dbError = error instanceof Error ? error.message : String(error);
        }
      }

      return {
        status: dbHealthy ? 'healthy' : 'degraded',
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
          initialized: this.memoryGraph !== null,
          backend: this.memoryBackendType,
          persistent: this.memoryBackendType === 'postgres',
          healthy: dbHealthy,
          error: dbError
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

    // P4-A: GET /memory/nodes/:id/edges - retrieve edges for node (read-only)
    this.app.get('/memory/nodes/:id/edges', async (request, reply) => {
      (request as any).action = 'memory_read_edges';
      const { id } = request.params as { id: string };

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

      const edges = this.memoryGraph.getNodeEdges(id);
      return {
        node_id: id,
        count: edges.length,
        edges
      };
    });

    // P4-A: GET /memory/search - search nodes (read-only)
    this.app.get('/memory/search', async (request, reply) => {
      (request as any).action = 'memory_search';
      const { q, limit } = request.query as { q?: string; limit?: string };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      // Validate query parameter
      if (!q || q.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty query parameter "q"'
        });
      }

      // Validate limit parameter
      let parsedLimit = 10;
      if (limit) {
        parsedLimit = parseInt(limit, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
          return reply.code(400).send({
            reason_code: 'MALFORMED_REQUEST',
            message: 'Invalid limit parameter (must be between 1 and 100)'
          });
        }
      }

      const results = this.memoryGraph.search(q, parsedLimit);
      return {
        query: q,
        limit: parsedLimit,
        count: results.length,
        results
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

      // Generate edge ID
      const edgeId = `edge-${Date.now()}-${Math.random().toString(36).substring(7)}`;

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

    // P4-C: Graph Intelligence API - Traversal Endpoints

    // POST /memory/traversal/bfs - breadth-first search
    this.app.post('/memory/traversal/bfs', async (request, reply) => {
      (request as any).action = 'memory_traversal_bfs';
      const body = (request as any).sanitizedBody as any;

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      if (!body.startNodeId || typeof body.startNodeId !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: startNodeId'
        });
      }

      try {
        const nodes = await this.memoryGraph.traversal.bfs(body.startNodeId, {
          maxDepth: body.maxDepth,
          nodeTypeFilter: body.nodeTypeFilter,
          edgeTypeFilter: body.edgeTypeFilter
        });

        return {
          startNodeId: body.startNodeId,
          count: nodes.length,
          nodes
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'BFS traversal failed'
        });
      }
    });

    // POST /memory/traversal/dfs - depth-first search
    this.app.post('/memory/traversal/dfs', async (request, reply) => {
      (request as any).action = 'memory_traversal_dfs';
      const body = (request as any).sanitizedBody as any;

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      if (!body.startNodeId || typeof body.startNodeId !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: startNodeId'
        });
      }

      try {
        const nodes = await this.memoryGraph.traversal.dfs(body.startNodeId, {
          maxDepth: body.maxDepth,
          nodeTypeFilter: body.nodeTypeFilter,
          edgeTypeFilter: body.edgeTypeFilter
        });

        return {
          startNodeId: body.startNodeId,
          count: nodes.length,
          nodes
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'DFS traversal failed'
        });
      }
    });

    // POST /memory/traversal/shortest-path - find shortest path
    this.app.post('/memory/traversal/shortest-path', async (request, reply) => {
      (request as any).action = 'memory_traversal_shortest_path';
      const body = (request as any).sanitizedBody as any;

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      if (!body.startNodeId || typeof body.startNodeId !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: startNodeId'
        });
      }

      if (!body.endNodeId || typeof body.endNodeId !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: endNodeId'
        });
      }

      try {
        const path = await this.memoryGraph.traversal.shortestPath(
          body.startNodeId,
          body.endNodeId
        );

        if (!path) {
          return reply.code(404).send({
            reason_code: 'ROUTE_NOT_FOUND',
            message: `No path found between ${body.startNodeId} and ${body.endNodeId}`
          });
        }

        return {
          startNodeId: body.startNodeId,
          endNodeId: body.endNodeId,
          distance: path.totalDistance,
          path: {
            nodes: path.nodes,
            edges: path.edges
          }
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Shortest path calculation failed'
        });
      }
    });

    // POST /memory/traversal/neighborhood - get node neighborhood
    this.app.post('/memory/traversal/neighborhood', async (request, reply) => {
      (request as any).action = 'memory_traversal_neighborhood';
      const body = (request as any).sanitizedBody as any;

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      if (!body.nodeId || typeof body.nodeId !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: nodeId'
        });
      }

      try {
        const neighbors = await this.memoryGraph.traversal.neighborhood(
          body.nodeId,
          body.depth ?? 1
        );

        return {
          nodeId: body.nodeId,
          depth: body.depth ?? 1,
          count: neighbors.length,
          neighbors
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Neighborhood query failed'
        });
      }
    });

    // P4-C: Graph Intelligence API - Analytics Endpoints

    // GET /memory/analytics/node/:id/degree - node degree metrics
    this.app.get('/memory/analytics/node/:id/degree', async (request, reply) => {
      (request as any).action = 'memory_analytics_degree';
      const { id } = request.params as { id: string };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      try {
        const metrics = await this.memoryGraph.analytics.nodeDegree(id);
        return {
          nodeId: id,
          metrics
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Degree calculation failed'
        });
      }
    });

    // GET /memory/analytics/node/:id/centrality - centrality metrics
    this.app.get('/memory/analytics/node/:id/centrality', async (request, reply) => {
      (request as any).action = 'memory_analytics_centrality';
      const { id } = request.params as { id: string };
      const { sampleSize } = request.query as { sampleSize?: string };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      try {
        const nodeDegreeMetrics = await this.memoryGraph.analytics.nodeDegree(id);
        const allNodes = await this.memoryBackend!.getAllNodes();
        const totalNodes = allNodes.length;

        // Degree centrality = degree / (n - 1) where n is total nodes
        const degreeCentrality = totalNodes > 1
          ? nodeDegreeMetrics.degree / (totalNodes - 1)
          : 0;

        const betweenness = await this.memoryGraph.analytics.betweennessCentrality(
          id,
          sampleSize ? parseInt(sampleSize, 10) : 20
        );
        const closeness = await this.memoryGraph.analytics.closenessCentrality(id);

        return {
          nodeId: id,
          centrality: {
            degree: degreeCentrality,
            betweenness,
            closeness
          }
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Centrality calculation failed'
        });
      }
    });

    // GET /memory/analytics/hubs - find hub nodes
    this.app.get('/memory/analytics/hubs', async (request, reply) => {
      (request as any).action = 'memory_analytics_hubs';
      const { limit } = request.query as { limit?: string };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      try {
        const hubs = await this.memoryGraph.analytics.findHubs(
          limit ? parseInt(limit, 10) : 10
        );

        return {
          count: hubs.length,
          hubs
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Hub detection failed'
        });
      }
    });

    // GET /memory/analytics/components - connected components
    this.app.get('/memory/analytics/components', async (request, reply) => {
      (request as any).action = 'memory_analytics_components';

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      try {
        const components = await this.memoryGraph.analytics.connectedComponents();

        return {
          count: components.length,
          components: components.map(comp => ({
            size: comp.length,
            nodes: comp
          }))
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Component analysis failed'
        });
      }
    });

    // GET /memory/analytics/metrics - overall graph metrics
    this.app.get('/memory/analytics/metrics', async (request, reply) => {
      (request as any).action = 'memory_analytics_metrics';

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      try {
        const metrics = await this.memoryGraph.analytics.graphMetrics();

        return {
          metrics
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Metrics calculation failed'
        });
      }
    });

    // P4-C: Graph Intelligence API - Query DSL Endpoints

    // POST /memory/query/match - Cypher-like pattern matching
    this.app.post('/memory/query/match', async (request, reply) => {
      (request as any).action = 'memory_query_match';
      const body = (request as any).sanitizedBody as any;

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      if (!body.query || typeof body.query !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: query'
        });
      }

      try {
        const result = await this.memoryGraph.query.match(body.query);

        return {
          query: body.query,
          nodeCount: result.nodes.length,
          edgeCount: result.edges.length,
          pathCount: result.paths?.length ?? 0,
          result
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Query execution failed'
        });
      }
    });

    // POST /memory/query/pattern - declarative pattern query
    this.app.post('/memory/query/pattern', async (request, reply) => {
      (request as any).action = 'memory_query_pattern';
      const body = (request as any).sanitizedBody as any;

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      if (!body.pattern || typeof body.pattern !== 'object') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: pattern'
        });
      }

      try {
        const result = await this.memoryGraph.query.findPaths(body.pattern);

        return {
          pattern: body.pattern,
          nodeCount: result.nodes.length,
          edgeCount: result.edges.length,
          pathCount: result.paths?.length ?? 0,
          result
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Pattern query failed'
        });
      }
    });

    // POST /memory/query/subgraph - extract subgraph around center node
    this.app.post('/memory/query/subgraph', async (request, reply) => {
      (request as any).action = 'memory_query_subgraph';
      const body = (request as any).sanitizedBody as any;

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      if (!body.centerNodeId || typeof body.centerNodeId !== 'string') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: centerNodeId'
        });
      }

      try {
        const result = await this.memoryGraph.query.subgraph(
          body.centerNodeId,
          body.depth ?? 2,
          body.filters
        );

        return {
          centerNodeId: body.centerNodeId,
          depth: body.depth ?? 2,
          nodeCount: result.nodes.length,
          edgeCount: result.edges.length,
          result
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Subgraph extraction failed'
        });
      }
    });

    // GET /memory/query/triangles - find triangles (3-node cycles)
    this.app.get('/memory/query/triangles', async (request, reply) => {
      (request as any).action = 'memory_query_triangles';

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      try {
        const triangles = await this.memoryGraph.query.findTriangles();

        return {
          count: triangles.length,
          triangles
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Triangle detection failed'
        });
      }
    });

    // POST /interpret - OI Engine interpretation with memory context
    this.app.post('/interpret', async (request, reply) => {
      (request as any).action = 'interpret';
      const body = (request as any).sanitizedBody as any;

      if (!this.oiEngine) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'OI Engine not initialized'
        });
      }

      // Validate input
      if (!body.input) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing required field: input'
        });
      }

      try {
        const result = await this.oiEngine.interpret({
          input: body.input,
          inputType: body.inputType,
          memoryContext: body.memoryContext,
          metadata: body.metadata
        });

        return {
          interpretation: result.interpretation,
          confidence: result.confidence,
          alternatives: result.alternatives,
          contextUsed: result.contextUsed,
          metadata: result.metadata
        };
      } catch (error) {
        return reply.code(500).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: error instanceof Error ? error.message : 'Interpretation failed'
        });
      }
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
