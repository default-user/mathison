/**
 * Mathison Server - Phase 3
 * Governed service with structural enforcement of CIF + CDI pipeline
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { GovernanceEngine, CDI, CIF } from 'mathison-governance';
import { loadStoreConfigFromEnv, StorageAdapter, makeStorageAdapterFromEnv } from 'mathison-storage';
import { MemoryGraph, Node, Edge } from 'mathison-memory';
import { loadAndVerifyGenome, Genome, GenomeMetadata } from 'mathison-genome';
import { ActionGate } from './action-gate';
import { JobExecutor } from './job-executor';
import { IdempotencyLedger } from './idempotency';
import { generateOpenAPISpec } from './openapi';
import { Interpreter } from 'mathison-oi';

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
  private storageAdapter: StorageAdapter | null = null;
  private actionGate: ActionGate | null = null;
  private jobExecutor: JobExecutor | null = null;
  private memoryGraph: MemoryGraph | null = null;
  private idempotencyLedger: IdempotencyLedger;
  private config: Required<MathisonServerConfig>;
  private bootStatus: 'booting' | 'ready' | 'failed' = 'booting';
  private bootError: string | null = null;
  // Memetic Genome (loaded and verified at boot)
  private genome: Genome | null = null;
  private genomeId: string | null = null;
  // OI Interpreter (Phase 2)
  private interpreter: Interpreter | null = null;

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
    if (this.storageAdapter) {
      await this.storageAdapter.close();
    }
    await this.cif.shutdown();
    await this.cdi.shutdown();
    await this.governance.shutdown();
    console.log('✅ Mathison Server stopped');
  }

  private async initializeGovernance(): Promise<void> {
    console.log('⚖️  Initializing governance layer (fail-closed)...');

    try {
      // FIRST: Load and verify Memetic Genome (fail-closed)
      await this.loadGenome();

      await this.governance.initialize();
      await this.cdi.initialize();

      // Configure CDI with genome capabilities for capability ceiling enforcement
      if (this.genome) {
        this.cdi.setGenomeCapabilities(this.genome.capabilities);
      }

      await this.cif.initialize();
      console.log('✓ Governance layer initialized');
    } catch (error) {
      console.error('❌ Governance initialization failed');
      throw new Error(`GOVERNANCE_INIT_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async loadGenome(): Promise<void> {
    const genomePath = process.env.MATHISON_GENOME_PATH || './genomes/TOTK_ROOT_v1.0.0/genome.json';
    const isProduction = process.env.MATHISON_ENV === 'production';
    const verifyManifest = process.env.MATHISON_VERIFY_MANIFEST === 'true' || isProduction;

    console.log(`🧬 Loading Memetic Genome: ${genomePath}`);
    console.log(`   Mode: ${isProduction ? 'production' : 'development'}`);
    console.log(`   Manifest verification: ${verifyManifest ? 'ON' : 'OFF'}`);

    try {
      const repoRoot = process.env.MATHISON_REPO_ROOT || process.cwd();
      const { genome, genome_id } = await loadAndVerifyGenome(genomePath, {
        verifyManifest,
        repoRoot
      });
      this.genome = genome;
      this.genomeId = genome_id;
      console.log(`✓ Genome loaded and verified: ${genome.name} v${genome.version}`);
      console.log(`  Genome ID: ${genome_id.substring(0, 16)}...`);
      console.log(`  Invariants: ${genome.invariants.length}`);
      console.log(`  Capabilities: ${genome.capabilities.length}`);
      if (verifyManifest) {
        console.log(`  Build manifest: ${genome.build_manifest.files.length} files verified`);
      }
    } catch (error) {
      console.error('❌ Genome verification failed (FAIL-CLOSED)');
      throw new Error(`GENOME_INVALID: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async initializeStorage(): Promise<void> {
    console.log('💾 Initializing storage layer (fail-closed)...');

    try {
      // Fail-closed: loadStoreConfigFromEnv throws if invalid/missing
      const storeConfig = loadStoreConfigFromEnv();
      console.log(`✓ Store config: backend=${storeConfig.backend}, path=${storeConfig.path}`);

      // Phase 0.5: Use StorageAdapter for lifecycle management
      this.storageAdapter = makeStorageAdapterFromEnv();
      await this.storageAdapter.init();
      console.log('✓ Storage layer initialized');

      // Create Stores interface for ActionGate compatibility
      const stores = {
        checkpointStore: this.storageAdapter.getCheckpointStore(),
        receiptStore: this.storageAdapter.getReceiptStore(),
        graphStore: this.storageAdapter.getGraphStore()
      };

      // Initialize ActionGate and JobExecutor
      this.actionGate = new ActionGate(this.cdi, this.cif, stores);
      const jobTimeout = process.env.MATHISON_JOB_TIMEOUT ? parseInt(process.env.MATHISON_JOB_TIMEOUT, 10) : 30000;
      const maxConcurrentJobs = process.env.MATHISON_MAX_CONCURRENT_JOBS ? parseInt(process.env.MATHISON_MAX_CONCURRENT_JOBS, 10) : 100;
      this.jobExecutor = new JobExecutor(this.actionGate, { jobTimeout, maxConcurrentJobs });
      console.log('✓ ActionGate and JobExecutor initialized');

      // P4-C: Initialize MemoryGraph with persistent storage
      this.memoryGraph = new MemoryGraph(stores.graphStore);
      await this.memoryGraph.initialize();
      console.log('✓ MemoryGraph initialized with persistence');

      // Phase 2: Initialize OI Interpreter
      this.interpreter = new Interpreter(
        this.memoryGraph,
        this.genomeId ?? undefined,
        this.genome?.version
      );
      console.log('✓ OI Interpreter initialized');
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

    // Pre-handler: CDI action check (FAIL-CLOSED)
    // All routes MUST declare an action unless in allowlist
    this.app.addHook('preHandler', async (request, reply) => {
      // Route-to-action mapping (static, declared at route definition time)
      const ROUTE_ACTIONS: Record<string, Record<string, string>> = {
        'GET': {
          '/genome': 'genome_read',
          '/jobs/status': 'job_status',
          '/jobs/logs': 'receipts_read',
          '/memory/search': 'memory_search',
        },
        'POST': {
          '/jobs/run': 'job_run',
          '/jobs/resume': 'job_resume',
          '/memory/nodes': 'memory_create_node',
          '/memory/edges': 'memory_create_edge',
          '/memory/hyperedges': 'memory_create_hyperedge',
          '/oi/interpret': 'oi_interpret',
        },
      };

      // Pattern-based route-to-action mapping for parameterized routes
      const PATTERN_ACTIONS: Array<{ method: string; pattern: RegExp; action: string }> = [
        { method: 'GET', pattern: /^\/memory\/nodes\/[^/]+$/, action: 'memory_read_node' },
        { method: 'GET', pattern: /^\/memory\/nodes\/[^/]+\/edges$/, action: 'memory_read_edges' },
        { method: 'GET', pattern: /^\/memory\/nodes\/[^/]+\/hyperedges$/, action: 'memory_read_hyperedges' },
        { method: 'GET', pattern: /^\/memory\/edges\/[^/]+$/, action: 'memory_read_edge' },
        { method: 'GET', pattern: /^\/memory\/hyperedges\/[^/]+$/, action: 'memory_read_hyperedge' },
        { method: 'POST', pattern: /^\/memory\/nodes\/[^/]+$/, action: 'memory_update_node' },
      ];

      // Allowlist: endpoints that bypass action requirement entirely
      const ALLOWLIST = ['/health', '/openapi.json'];
      const urlPath = request.url.split('?')[0];
      const isAllowlisted = ALLOWLIST.includes(urlPath);

      // Look up action from static mapping
      let action = ROUTE_ACTIONS[request.method]?.[urlPath];
      let isKnownRoute = action !== undefined;

      // If not found, try pattern matching
      if (!action) {
        for (const { method, pattern, action: patternAction } of PATTERN_ACTIONS) {
          if (request.method === method && pattern.test(urlPath)) {
            action = patternAction;
            isKnownRoute = true;
            break;
          }
        }
      }

      // Also check if action was set by route handler (for backwards compatibility)
      if (!action) {
        action = (request as any).action;
        if (action) isKnownRoute = true;
      }

      // Unknown routes (no mapping) should pass through to 404 handler
      // Only deny known routes that are missing action declarations
      if (!action && !isAllowlisted && !isKnownRoute) {
        // Let unknown routes fall through to 404 handler
        return;
      }

      // FAIL-CLOSED: Known routes MUST have an action
      if (!action && isKnownRoute && !isAllowlisted) {
        reply.code(403).send({
          reason_code: 'GOV_ACTION_REQUIRED',
          message: 'Route does not declare an action - denied by fail-closed governance policy',
          details: {
            url: request.url,
            method: request.method
          }
        });
        return reply;
      }

      // Skip CDI check for allowlisted routes (they have no action)
      if (!action) {
        return;
      }

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

    // Pre-serialization: JSON contract enforcement + CDI output check + CIF egress
    this.app.addHook('onSend', async (request, reply, payload) => {
      const clientId = request.ip;

      // Phase 0.4: JSON-only contract enforcement (fail-closed)
      // All responses MUST be JSON-serializable
      let parsedPayload: any;
      try {
        parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
        // Ensure we can serialize it back to JSON (validates JSON-serializable)
        JSON.stringify(parsedPayload);
      } catch (error) {
        // FAIL CLOSED: Non-JSON response attempted
        reply.code(500);
        reply.header('Content-Type', 'application/json');
        return JSON.stringify({
          error: 'JSON_CONTRACT_VIOLATION',
          message: 'All responses must be valid JSON',
          details: error instanceof Error ? error.message : String(error)
        });
      }

      // Enforce Content-Type: application/json on all responses
      reply.header('Content-Type', 'application/json');

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
        payload: parsedPayload
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

      const isProduction = process.env.MATHISON_ENV === 'production';
      const manifestVerified = process.env.MATHISON_VERIFY_MANIFEST === 'true' || isProduction;

      return {
        status: 'healthy',
        bootStatus: this.bootStatus,
        governance: {
          treaty: {
            version: this.governance.getTreatyVersion(),
            authority: this.governance.getTreatyAuthority()
          },
          genome: {
            name: this.genome?.name,
            version: this.genome?.version,
            genome_id: this.genomeId?.substring(0, 16) + '...',
            initialized: this.genome !== null,
            verified: this.genome !== null,
            manifestVerified: manifestVerified && this.genome !== null,
            manifestFiles: this.genome?.build_manifest.files.length || 0
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
          initialized: this.storageAdapter !== null,
          backend: this.storageAdapter?.getBackend()
        },
        memory: {
          initialized: this.memoryGraph !== null
        }
      };
    });

    // Phase 4: GET /openapi.json - return OpenAPI 3.0 specification
    this.app.get('/openapi.json', async (request, reply) => {
      const spec = generateOpenAPISpec(this.genome?.version);
      return reply.send(spec);
    });

    // GET /genome - read active genome metadata
    this.app.get('/genome', async (request, reply) => {
      (request as any).action = 'genome_read';

      if (!this.genome || !this.genomeId) {
        return reply.code(503).send({
          reason_code: 'GENOME_MISSING',
          message: 'Genome not loaded'
        });
      }

      return {
        genome_id: this.genomeId,
        name: this.genome.name,
        version: this.genome.version,
        parents: this.genome.parents,
        created_at: this.genome.created_at,
        authority: {
          threshold: this.genome.authority.threshold,
          signers: this.genome.authority.signers.map(s => ({
            key_id: s.key_id,
            alg: s.alg
            // Omit public_key from response for brevity
          }))
        },
        invariants: this.genome.invariants.map(inv => ({
          id: inv.id,
          severity: inv.severity,
          testable_claim: inv.testable_claim
        })),
        capabilities: this.genome.capabilities.map(cap => ({
          cap_id: cap.cap_id,
          risk_class: cap.risk_class,
          allow_count: cap.allow_actions.length,
          deny_count: cap.deny_actions.length
        }))
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

      const result = await this.jobExecutor.runJob(
        actor,
        {
          jobType: body.jobType ?? 'default',
          inputs: body.inputs,
          policyId: body.policyId,
          jobId: body.jobId
        },
        this.genomeId ?? undefined,
        this.genome?.version
      );

      return result;
    });

    // P3-C: GET /jobs/status - get job status (list or by job_id query param)
    this.app.get('/jobs/status', async (request, reply) => {
      (request as any).action = 'job_status';
      const { job_id, limit } = request.query as { job_id?: string; limit?: string };

      if (!this.jobExecutor) {
        return reply.code(503).send({
          error: 'Job executor not initialized'
        });
      }

      // If job_id provided, get specific job status
      if (job_id) {
        const status = await this.jobExecutor.getStatus(
          job_id,
          this.genomeId ?? undefined,
          this.genome?.version
        );

        if (!status) {
          return reply.code(404).send({
            error: 'Job not found',
            job_id
          });
        }

        return status;
      }

      // Otherwise, list all jobs
      const jobs = await this.jobExecutor.listJobs(
        limit ? parseInt(limit, 10) : undefined
      );

      return {
        count: jobs.length,
        jobs
      };
    });

    // P3-C: POST /jobs/resume - resume job by job_id in body
    this.app.post('/jobs/resume', async (request, reply) => {
      (request as any).action = 'job_resume';
      const actor = request.ip;
      const body = (request as any).sanitizedBody as any;

      if (!body.job_id || typeof body.job_id !== 'string') {
        return reply.code(400).send({
          error: 'Missing required field: job_id'
        });
      }

      if (!this.jobExecutor) {
        return reply.code(503).send({
          error: 'Job executor not initialized'
        });
      }

      const result = await this.jobExecutor.resumeJob(
        actor,
        body.job_id,
        this.genomeId ?? undefined,
        this.genome?.version
      );

      return result;
    });

    // P3-C: GET /jobs/logs - get job logs/receipts (all or by job_id query param)
    this.app.get('/jobs/logs', async (request, reply) => {
      (request as any).action = 'receipts_read';
      const { job_id, limit } = request.query as { job_id?: string; limit?: string };

      if (!this.actionGate) {
        return reply.code(503).send({
          error: 'ActionGate not initialized'
        });
      }

      // If job_id provided, get receipts for that job
      if (job_id) {
        const receipts = await this.actionGate.readReceipts(
          job_id,
          limit ? parseInt(limit, 10) : undefined
        );

        return {
          job_id,
          count: receipts.length,
          receipts
        };
      }

      // Otherwise return error - must specify job_id for now
      // (Future: could list all receipts with pagination)
      return reply.code(400).send({
        error: 'Missing required query parameter: job_id'
      });
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

    // P4-A: GET /memory/edges/:id - retrieve edge by ID (read-only)
    this.app.get('/memory/edges/:id', async (request, reply) => {
      (request as any).action = 'memory_read_edge';
      const { id } = request.params as { id: string };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      // Find edge by ID
      const edge = (this.memoryGraph as any).edges?.get(id);
      if (!edge) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Edge not found: ${id}`
        });
      }

      return edge;
    });

    // P4-A: GET /memory/hyperedges/:id - retrieve hyperedge by ID (read-only)
    this.app.get('/memory/hyperedges/:id', async (request, reply) => {
      (request as any).action = 'memory_read_hyperedge';
      const { id } = request.params as { id: string };

      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph not initialized'
        });
      }

      // Find hyperedge by ID
      const hyperedge = (this.memoryGraph as any).hyperedges?.get(id);
      if (!hyperedge) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Hyperedge not found: ${id}`
        });
      }

      return hyperedge;
    });

    // P4-A: GET /memory/nodes/:id/hyperedges - retrieve hyperedges for node (read-only)
    this.app.get('/memory/nodes/:id/hyperedges', async (request, reply) => {
      (request as any).action = 'memory_read_hyperedges';
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

      const hyperedges = this.memoryGraph.getNodeHyperedges(id);
      return {
        node_id: id,
        count: hyperedges.length,
        hyperedges
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
          },
          genome_id: this.genomeId ?? undefined,
          genome_version: this.genome?.version
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
          },
          genome_id: this.genomeId ?? undefined,
          genome_version: this.genome?.version
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

    // P4-B: POST /memory/hyperedges - create hyperedge (write with ActionGate + idempotency)
    this.app.post('/memory/hyperedges', async (request, reply) => {
      (request as any).action = 'memory_create_hyperedge';
      const actor = request.ip;
      const body = (request as any).sanitizedBody as any;

      // Validate required fields
      if (!body.idempotency_key || typeof body.idempotency_key !== 'string' || body.idempotency_key.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty required field: idempotency_key'
        });
      }

      if (!body.nodes || !Array.isArray(body.nodes) || body.nodes.length === 0) {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or invalid required field: nodes (must be non-empty array)'
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

      // Verify all nodes exist
      for (const nodeId of body.nodes) {
        if (typeof nodeId !== 'string') {
          return reply.code(400).send({
            reason_code: 'MALFORMED_REQUEST',
            message: 'All node IDs must be strings'
          });
        }
        const node = this.memoryGraph.getNode(nodeId);
        if (!node) {
          return reply.code(404).send({
            reason_code: 'ROUTE_NOT_FOUND',
            message: `Node not found: ${nodeId}`
          });
        }
      }

      // Generate request hash for idempotency
      const requestHash = IdempotencyLedger.generateRequestHash(
        '/memory/hyperedges',
        body,
        body.idempotency_key
      );

      // Check if request already processed
      const cachedResponse = this.idempotencyLedger.get(requestHash);
      if (cachedResponse) {
        return reply.code(cachedResponse.statusCode).send(cachedResponse.body);
      }

      // Generate hyperedge ID
      const hyperedgeId = body.id || `hyperedge-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Execute hyperedge creation through ActionGate
      const hyperedge = {
        id: hyperedgeId,
        nodes: body.nodes,
        type: body.type,
        metadata: body.metadata
      };

      const result = await this.actionGate.executeSideEffect(
        {
          actor,
          action: 'MEMORY_HYPEREDGE_CREATE',
          payload: hyperedge,
          metadata: {
            job_id: 'memory',
            stage: 'memory_write',
            policy_id: 'default',
            idempotency_key: body.idempotency_key,
            request_hash: requestHash
          },
          genome_id: this.genomeId ?? undefined,
          genome_version: this.genome?.version
        },
        async () => {
          this.memoryGraph!.addHyperedge(hyperedge);
          return hyperedge;
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
          hyperedge: result.data,
          created: true,
          receipt: result.receipt
        }
      };
      this.idempotencyLedger.set(requestHash, successResponse);
      return reply.code(201).send(successResponse.body);
    });

    // P4-B: POST /memory/nodes/:id - update node (write with ActionGate + idempotency)
    this.app.post('/memory/nodes/:id', async (request, reply) => {
      (request as any).action = 'memory_update_node';
      const actor = request.ip;
      const { id } = request.params as { id: string };
      const body = (request as any).sanitizedBody as any;

      // Validate required fields
      if (!body.idempotency_key || typeof body.idempotency_key !== 'string' || body.idempotency_key.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty required field: idempotency_key'
        });
      }

      if (!this.memoryGraph || !this.actionGate) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'MemoryGraph or ActionGate not initialized'
        });
      }

      // Check if node exists
      const existingNode = this.memoryGraph.getNode(id);
      if (!existingNode) {
        return reply.code(404).send({
          reason_code: 'ROUTE_NOT_FOUND',
          message: `Node not found: ${id}`
        });
      }

      // Generate request hash for idempotency
      const requestHash = IdempotencyLedger.generateRequestHash(
        `/memory/nodes/${id}`,
        body,
        body.idempotency_key
      );

      // Check if request already processed
      const cachedResponse = this.idempotencyLedger.get(requestHash);
      if (cachedResponse) {
        return reply.code(cachedResponse.statusCode).send(cachedResponse.body);
      }

      // Create updated node (merge with existing)
      const updatedNode = {
        id,
        type: body.type ?? existingNode.type,
        data: body.data ?? existingNode.data,
        metadata: body.metadata ?? existingNode.metadata
      };

      // Execute node update through ActionGate
      const result = await this.actionGate.executeSideEffect(
        {
          actor,
          action: 'MEMORY_NODE_UPDATE',
          payload: updatedNode,
          metadata: {
            job_id: 'memory',
            stage: 'memory_write',
            policy_id: 'default',
            idempotency_key: body.idempotency_key,
            request_hash: requestHash
          },
          genome_id: this.genomeId ?? undefined,
          genome_version: this.genome?.version
        },
        async () => {
          this.memoryGraph!.addNode(updatedNode);
          return updatedNode;
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
        statusCode: 200,
        body: {
          node: result.data,
          updated: true,
          receipt: result.receipt
        }
      };
      this.idempotencyLedger.set(requestHash, successResponse);
      return reply.code(200).send(successResponse.body);
    });

    // Phase 2: POST /oi/interpret - OI interpretation endpoint
    this.app.post('/oi/interpret', async (request, reply) => {
      (request as any).action = 'oi_interpret';
      const body = (request as any).sanitizedBody as any;

      // Fail-closed: require interpreter
      if (!this.interpreter) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'OI Interpreter not initialized'
        });
      }

      // Fail-closed: require memory graph
      if (!this.memoryGraph) {
        return reply.code(503).send({
          reason_code: 'GOVERNANCE_INIT_FAILED',
          message: 'Memory backend unavailable'
        });
      }

      // Fail-closed: require genome metadata
      if (!this.genome || !this.genomeId) {
        return reply.code(503).send({
          reason_code: 'GENOME_MISSING',
          message: 'Genome metadata missing'
        });
      }

      // Validate required fields
      if (!body.text || typeof body.text !== 'string' || body.text.trim() === '') {
        return reply.code(400).send({
          reason_code: 'MALFORMED_REQUEST',
          message: 'Missing or empty required field: text'
        });
      }

      // Validate optional limit parameter
      let limit: number | undefined;
      if (body.limit !== undefined) {
        if (typeof body.limit !== 'number' || body.limit < 1 || body.limit > 100) {
          return reply.code(400).send({
            reason_code: 'MALFORMED_REQUEST',
            message: 'Invalid limit parameter (must be number between 1 and 100)'
          });
        }
        limit = body.limit;
      }

      try {
        // Execute interpretation
        const result = await this.interpreter.interpret({
          text: body.text,
          limit
        });

        return result;
      } catch (error) {
        // Handle interpreter errors (fail-closed)
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
  const server = new MathisonServer({
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    host: process.env.HOST
  });
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
export { generateOpenAPISpec, OpenAPISpec, ActionMetadata } from './openapi';
