/**
 * Mathison Server
 * HTTP server with governed API endpoints
 *
 * GOVERNANCE REQUIREMENT:
 * All requests MUST pass through:
 * 1. CIF ingress (boundary protection)
 * 2. CDI checkAction (action evaluation)
 * 3. Business logic (job execution)
 * 4. CDI checkOutput (output validation)
 * 5. CIF egress (final sanitization)
 *
 * Fail-closed: any governance component not initialized -> 503
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { CDI } from 'mathison-governance/dist/cdi';
import { CIF } from 'mathison-governance/dist/cif';
import { CheckpointEngine } from 'mathison-checkpoint';
import { EventLog } from 'mathison-receipts';
import { ingressHook, GovernanceContext } from './middleware/governance';
import { registerJobRoutes } from './routes/jobs';
import * as path from 'path';

export interface MathisonServerConfig {
  port?: number;
  host?: string;
  checkpointDir?: string;
  eventLogPath?: string;
}

export class MathisonServer {
  private fastify: FastifyInstance;
  private cdi: CDI;
  private cif: CIF;
  private checkpointEngine: CheckpointEngine;
  private eventLog: EventLog;
  private config: MathisonServerConfig;
  private governanceReady: boolean = false;

  constructor(config: MathisonServerConfig = {}) {
    this.config = {
      port: config.port || 3000,
      host: config.host || '127.0.0.1',
      checkpointDir: config.checkpointDir || '.mathison/checkpoints',
      eventLogPath: config.eventLogPath || '.mathison/eventlog.jsonl'
    };

    // Initialize Fastify
    this.fastify = Fastify({
      logger: {
        level: 'info'
      }
    });

    // Initialize governance components
    this.cdi = new CDI();
    this.cif = new CIF();
    this.checkpointEngine = new CheckpointEngine(this.config.checkpointDir!);
    this.eventLog = new EventLog(this.config.eventLogPath!);
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Mathison Server...');

    try {
      // Initialize governance components (CRITICAL - must succeed)
      console.log('   Initializing governance components...');
      await this.cdi.initialize();
      await this.cif.initialize();
      this.governanceReady = true;
      console.log('   ✅ Governance components ready (CDI + CIF)');

      // Register CORS
      await this.fastify.register(cors, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      });

      // Global ingress hook (runs before ALL routes)
      const governanceContext: GovernanceContext = {
        cdi: this.cdi,
        cif: this.cif
      };

      this.fastify.addHook('preHandler', async (request, reply) => {
        // Health check endpoint bypasses governance
        if (request.url === '/health') {
          return;
        }

        await ingressHook(governanceContext, request, reply);
      });

      // Health check endpoint
      this.fastify.get('/health', async () => {
        return {
          status: 'healthy',
          governance: this.governanceReady ? 'ready' : 'not_ready',
          timestamp: new Date().toISOString()
        };
      });

      // Register job routes with governance protection
      await registerJobRoutes(
        this.fastify,
        governanceContext,
        this.checkpointEngine,
        this.eventLog
      );

      // Start listening
      await this.fastify.listen({
        port: this.config.port!,
        host: this.config.host!
      });

      console.log(`✅ Mathison Server started on ${this.config.host}:${this.config.port}`);
      console.log(`   Governance: ${this.governanceReady ? 'ACTIVE' : 'INACTIVE'}`);
      console.log(`   Endpoints:`);
      console.log(`     GET  /health`);
      console.log(`     POST /v1/jobs/run`);
      console.log(`     GET  /v1/jobs/:job_id/status`);
      console.log(`     POST /v1/jobs/:job_id/resume`);
      console.log(`     GET  /v1/jobs/:job_id/receipts`);
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Mathison Server...');
    await this.fastify.close();
    console.log('✅ Mathison Server stopped');
  }

  getApp(): FastifyInstance {
    return this.fastify;
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

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

export default MathisonServer;
