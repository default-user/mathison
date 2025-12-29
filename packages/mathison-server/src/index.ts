/**
 * Mathison Server - Phase 3
 * Governed service with structural enforcement of CIF + CDI pipeline
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { GovernanceEngine, CDI, CIF } from 'mathison-governance';
import { loadStoreConfigFromEnv, makeStoresFromEnv, Stores } from 'mathison-storage';

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
    } catch (error) {
      console.error('❌ Storage initialization failed');
      throw error; // Re-throw to fail boot
    }
  }

  private registerGovernancePipeline(): void {
    // P3-A: Mandatory governance pipeline for all requests
    this.app.addHook('onRequest', async (request, reply) => {
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
        }
      };
    });

    // Catch-all for unknown routes (fail-closed)
    this.app.setNotFoundHandler(async (request, reply) => {
      return reply.code(404).send({
        error: 'ROUTE_NOT_FOUND',
        message: 'Unknown endpoint - denied by fail-closed policy',
        url: request.url,
        method: request.method
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

export default MathisonServer;
