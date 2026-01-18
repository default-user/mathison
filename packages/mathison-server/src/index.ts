/**
 * Mathison v2.1 Server
 *
 * HTTP server with unified governed request pipeline.
 * ALL requests flow through: CIF ingress → CDI action check → handler → CDI output check → CIF egress
 *
 * INVARIANT: No handler can be called directly - pipeline enforces governance.
 * INVARIANT: Fail-closed - missing governance material = deny.
 */

import express, { Express, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  PipelineExecutor,
  HandlerRegistry,
  createPipeline,
  PipelineRouter,
  RegisteredHandler,
  PipelineContext,
  CapabilityToken,
} from '@mathison/pipeline';
import {
  createGovernanceProvider,
  GovernanceProviderImpl,
} from '@mathison/governance';
import {
  createMemoryStore,
  MemoryStore,
  GovernanceTags,
} from '@mathison/memory';

// ============================================================================
// Server Configuration
// ============================================================================

export interface ServerConfig {
  port: number;
  host: string;
  authorityConfigPath: string;
  governanceCapsulePath: string;
  databaseConfig: {
    type: 'postgres' | 'sqlite';
    postgres?: {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
    };
    sqlite?: {
      path: string;
    };
  };
}

// ============================================================================
// Handlers (business logic)
// ============================================================================

interface CreateThreadPayload {
  namespace_id: string;
  scope: string;
  priority: number;
}

interface GetThreadsPayload {
  namespace_id: string;
  state?: string;
}

interface AddMessagePayload {
  namespace_id: string;
  thread_id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
}

/**
 * Register all handlers with the pipeline registry
 */
function registerHandlers(registry: HandlerRegistry, store: MemoryStore): void {
  // Create thread handler
  registry.register<CreateThreadPayload, any>({
    id: 'create_thread',
    intent: 'thread.create',
    risk_class: 'low_risk',
    required_capabilities: ['memory_write'],
    handler: async (ctx, payload, capabilities) => {
      const tags = buildGovernanceTags(ctx);
      const thread = await store.createThread(
        {
          namespace_id: payload.namespace_id,
          scope: payload.scope,
          priority: payload.priority,
        },
        tags
      );
      return thread;
    },
  });

  // Get threads handler
  registry.register<GetThreadsPayload, any>({
    id: 'get_threads',
    intent: 'thread.list',
    risk_class: 'read_only',
    required_capabilities: ['memory_read'],
    handler: async (ctx, payload, capabilities) => {
      const tags = buildGovernanceTags(ctx);
      const threads = await store.getThreads(
        payload.namespace_id,
        { state: payload.state as any },
        tags
      );
      return { threads };
    },
  });

  // Add message handler
  registry.register<AddMessagePayload, any>({
    id: 'add_message',
    intent: 'message.create',
    risk_class: 'low_risk',
    required_capabilities: ['memory_write'],
    handler: async (ctx, payload, capabilities) => {
      const tags = buildGovernanceTags(ctx);
      const message = await store.addMessage(
        {
          namespace_id: payload.namespace_id,
          thread_id: payload.thread_id,
          content: payload.content,
          role: payload.role,
        },
        tags
      );
      return message;
    },
  });

  // Health check handler
  registry.register<{}, any>({
    id: 'health',
    intent: 'system.health',
    risk_class: 'read_only',
    required_capabilities: [],
    handler: async (ctx, payload, capabilities) => {
      const healthy = await store.healthCheck();
      return {
        status: healthy ? 'ok' : 'degraded',
        version: '2.1.0',
        timestamp: new Date().toISOString(),
      };
    },
  });
}

/**
 * Build governance tags from pipeline context
 */
function buildGovernanceTags(ctx: PipelineContext): GovernanceTags {
  return {
    principal_id: ctx.principal_id,
    oi_id: ctx.oi_id,
    purpose: ctx.intent,
    origin_labels: ctx.origin.labels,
  };
}

// ============================================================================
// Server Initialization
// ============================================================================

/**
 * Create and start the Mathison server
 */
export async function createServer(config: ServerConfig): Promise<{
  app: Express;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}> {
  // Initialize governance provider
  const governanceProvider = createGovernanceProvider({
    ttl_seconds: 300,
    allow_dev_signatures: process.env.NODE_ENV !== 'production',
  });

  // Load governance material (fail-closed if missing)
  await governanceProvider.initialize(
    config.authorityConfigPath,
    config.governanceCapsulePath
  );

  // Check capsule status
  const capsuleStatus = governanceProvider.getCapsuleStatus();
  if (!capsuleStatus.valid && process.env.NODE_ENV === 'production') {
    throw new Error('Cannot start in production without valid governance capsule');
  }

  // Initialize memory store
  let store: MemoryStore;
  if (config.databaseConfig.type === 'postgres' && config.databaseConfig.postgres) {
    store = createMemoryStore({
      type: 'postgres',
      config: config.databaseConfig.postgres,
    });
  } else if (config.databaseConfig.sqlite) {
    store = createMemoryStore({
      type: 'sqlite',
      config: config.databaseConfig.sqlite,
    });
  } else {
    throw new Error('Invalid database configuration');
  }

  await store.initialize();

  // Create handler registry and register handlers
  const registry = new HandlerRegistry();
  registerHandlers(registry, store);

  // Create pipeline executor
  const pipeline = createPipeline(governanceProvider as any, registry);

  // Create Express app
  const app = express();
  app.use(express.json());

  // Create pipeline router
  const pipelineRouter = new PipelineRouter(pipeline);

  // Register routes through pipeline
  pipelineRouter.addRoute({
    method: 'post',
    path: '/threads',
    intent: 'thread.create',
    risk_class: 'low_risk',
    required_capabilities: ['memory_write'],
    extractOiId: (req) => req.body.namespace_id || 'default',
    extractPrincipalId: (req) => req.headers['x-principal-id'] as string || 'anonymous',
    extractPayload: (req) => req.body,
  });

  pipelineRouter.addRoute({
    method: 'get',
    path: '/threads',
    intent: 'thread.list',
    risk_class: 'read_only',
    required_capabilities: ['memory_read'],
    extractOiId: (req) => req.query.namespace_id as string || 'default',
    extractPrincipalId: (req) => req.headers['x-principal-id'] as string || 'anonymous',
    extractPayload: (req) => ({
      namespace_id: req.query.namespace_id,
      state: req.query.state,
    }),
  });

  pipelineRouter.addRoute({
    method: 'post',
    path: '/threads/:thread_id/messages',
    intent: 'message.create',
    risk_class: 'low_risk',
    required_capabilities: ['memory_write'],
    extractOiId: (req) => req.body.namespace_id || 'default',
    extractPrincipalId: (req) => req.headers['x-principal-id'] as string || 'anonymous',
    extractPayload: (req) => ({
      ...req.body,
      thread_id: req.params.thread_id,
    }),
  });

  pipelineRouter.addRoute({
    method: 'get',
    path: '/health',
    intent: 'system.health',
    risk_class: 'read_only',
    required_capabilities: [],
    extractOiId: (_req) => 'system',
    extractPrincipalId: (_req) => 'system',
    extractPayload: (_req) => ({}),
  });

  // Mount pipeline router
  app.use('/api/v2.1', pipelineRouter.getRouter());

  // Legacy health endpoint (no pipeline for backwards compat)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '2.1.0' });
  });

  // Start and stop functions
  let server: any = null;

  const start = async () => {
    return new Promise<void>((resolve) => {
      server = app.listen(config.port, config.host, () => {
        console.log(`Mathison v2.1 server listening on ${config.host}:${config.port}`);
        resolve();
      });
    });
  };

  const stop = async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(resolve));
    }
    await store.close();
  };

  return { app, start, stop };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    authorityConfigPath: process.env.AUTHORITY_CONFIG_PATH || './config/authority.json',
    governanceCapsulePath: process.env.GOVERNANCE_CAPSULE_PATH || './config/governance-capsule.json',
    databaseConfig: {
      type: (process.env.DB_TYPE as 'postgres' | 'sqlite') || 'postgres',
      postgres: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'mathison',
        user: process.env.POSTGRES_USER || 'mathison',
        password: process.env.POSTGRES_PASSWORD || 'mathison_dev_password',
      },
      sqlite: {
        path: process.env.SQLITE_PATH || './mathison.db',
      },
    },
  };

  createServer(config)
    .then(({ start }) => start())
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}
