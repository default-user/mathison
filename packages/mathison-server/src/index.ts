/**
 * WHY: index.ts - Mathison v2.2 Server entry point
 * -----------------------------------------------------------------------------
 * - HTTP server with unified governed request pipeline.
 * - ALL requests flow through: CIF ingress → CDI action check → handler → CDI output check → CIF egress
 * - ai.chat handler demonstrates Model Bus: governed handler is the ONLY path to vendor APIs.
 * - Provenance events are written for every model invocation.
 *
 * INVARIANT: No handler can be called directly - pipeline enforces governance.
 * INVARIANT: Fail-closed - missing governance material = deny.
 * INVARIANT: All model calls go through Model Bus with capability tokens.
 */

import express, { Express, Request, Response } from 'express';
import {
  HandlerRegistry,
  createPipeline,
  PipelineRouter,
  PipelineContext,
} from '@mathison/pipeline';
import { createGovernanceProvider } from '@mathison/governance';
import {
  createMemoryStore,
  MemoryStore,
  GovernanceTags,
} from '@mathison/memory';
import { createGateway, CapabilityToken } from '@mathison/adapters';
import {
  createModelRouter,
  ModelRouter,
  ChatMessage,
} from '@mathison/model-bus';

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
// Handler Payload Types
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
 * WHY ai.chat payload structure:
 * - namespace_id: Required for memory access governance
 * - thread_id: Links to conversation thread for context retrieval
 * - model_id: Determines which adapter to route to
 * - user_input: The user's message to process
 * - parameters: Optional model parameters (temp, max_tokens, etc.)
 */
interface AiChatPayload {
  namespace_id: string;
  thread_id: string;
  model_id: string;
  user_input: string;
  parameters?: {
    temperature?: number;
    max_tokens?: number;
    system_prompt?: string;
  };
}

/**
 * WHY ai.chat response structure:
 * - content: The model's response
 * - usage: Token counts for billing/limits
 * - model_id: Actual model used (may differ from requested)
 * - provider: Which vendor served the request
 * - trace_id: For correlation in logs/events
 */
interface AiChatResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens?: number;
  };
  model_id: string;
  provider: string;
  trace_id: string;
}

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Register all handlers with the pipeline registry
 *
 * WHY centralized registration: Ensures all handlers are discoverable
 * and must declare their risk_class and required_capabilities upfront.
 */
function registerHandlers(
  registry: HandlerRegistry,
  store: MemoryStore,
  modelRouter: ModelRouter
): void {
  // Create thread handler
  registry.register<CreateThreadPayload, unknown>({
    id: 'create_thread',
    intent: 'thread.create',
    risk_class: 'low_risk',
    required_capabilities: ['memory_write'],
    handler: async (ctx, payload, _capabilities) => {
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
  registry.register<GetThreadsPayload, unknown>({
    id: 'get_threads',
    intent: 'thread.list',
    risk_class: 'read_only',
    required_capabilities: ['memory_read'],
    handler: async (ctx, payload, _capabilities) => {
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
  registry.register<AddMessagePayload, unknown>({
    id: 'add_message',
    intent: 'message.create',
    risk_class: 'low_risk',
    required_capabilities: ['memory_write'],
    handler: async (ctx, payload, _capabilities) => {
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
  registry.register<Record<string, never>, unknown>({
    id: 'health',
    intent: 'system.health',
    risk_class: 'read_only',
    required_capabilities: [],
    handler: async (_ctx, _payload, _capabilities) => {
      const healthy = await store.healthCheck();
      return {
        status: healthy ? 'ok' : 'degraded',
        version: '2.2.0',
        timestamp: new Date().toISOString(),
      };
    },
  });

  // =========================================================================
  // ai.chat Handler - v2.2 Model Bus Integration
  // =========================================================================
  /**
   * WHY ai.chat is the core v2.2 feature:
   * - Demonstrates governed handler as the ONLY path to vendor APIs
   * - Reads thread context from governed memory store
   * - Uses CDI-minted capability token for model invocation
   * - Writes provenance event for auditing
   * - Writes assistant response back to thread
   *
   * INVARIANT: NO direct vendor calls - must go through modelRouter
   * INVARIANT: Capability token MUST have 'model_invocation' capability
   */
  registry.register<AiChatPayload, AiChatResponse>({
    id: 'ai_chat',
    intent: 'ai.chat',
    risk_class: 'medium_risk',
    required_capabilities: ['model_invocation', 'memory_read', 'memory_write'],
    handler: async (ctx, payload, capabilities) => {
      const tags = buildGovernanceTags(ctx);
      const startTime = Date.now();

      // Step 1: Find the model_invocation capability token
      // WHY capability search: CDI mints multiple tokens; we need the right one
      const modelCapToken = capabilities.find(
        (cap) => cap.capability === 'model_invocation'
      );
      if (!modelCapToken) {
        // WHY fail-closed: No capability = no model access
        throw new Error('Missing model_invocation capability token');
      }

      // Step 2: Read recent thread messages for context
      // WHY context retrieval: Models need conversation history
      const messages = await store.getMessages(payload.thread_id, tags);

      // Step 3: Assemble messages for the model
      const chatMessages: ChatMessage[] = [];

      // Add system prompt if provided
      if (payload.parameters?.system_prompt) {
        chatMessages.push({
          role: 'system',
          content: payload.parameters.system_prompt,
        });
      }

      // Add conversation history (limit to recent messages for context window)
      // WHY limit: Prevents context overflow and controls costs
      const recentMessages = messages.slice(-20);
      for (const msg of recentMessages) {
        chatMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }

      // Add the new user input
      chatMessages.push({
        role: 'user',
        content: payload.user_input,
      });

      // Step 4: Save user message to thread BEFORE calling model
      // WHY save first: Ensures message is recorded even if model call fails
      await store.addMessage(
        {
          namespace_id: payload.namespace_id,
          thread_id: payload.thread_id,
          content: payload.user_input,
          role: 'user',
        },
        tags
      );

      // Step 5: Call Model Bus via router (ONLY path to vendor APIs)
      // WHY router: Enforces capability verification and adapter selection
      const routerResult = await modelRouter.route({
        model_id: payload.model_id,
        messages: chatMessages,
        parameters: {
          temperature: payload.parameters?.temperature,
          max_tokens: payload.parameters?.max_tokens,
        },
        capability_token: modelCapToken as CapabilityToken,
        trace_id: ctx.trace_id,
        namespace_id: payload.namespace_id,
      });

      if (!routerResult.success || !routerResult.response) {
        // WHY propagate error: Caller needs to know why model call failed
        throw new Error(`Model invocation failed: ${routerResult.error}`);
      }

      const modelResponse = routerResult.response;
      const latencyMs = Date.now() - startTime;

      // Step 6: Write assistant message back to thread
      await store.addMessage(
        {
          namespace_id: payload.namespace_id,
          thread_id: payload.thread_id,
          content: modelResponse.content,
          role: 'assistant',
          metadata: {
            model_id: modelResponse.provenance.model_id,
            provider: modelResponse.provenance.provider,
            trace_id: ctx.trace_id,
          },
        },
        tags
      );

      // Step 7: Write provenance event for auditing
      // WHY provenance: Enables cost tracking, debugging, compliance
      await store.logEvent(
        {
          namespace_id: payload.namespace_id,
          thread_id: payload.thread_id,
          event_type: 'model_invocation',
          payload: {
            provider: modelResponse.provenance.provider,
            model_id: modelResponse.provenance.model_id,
            usage: modelResponse.provenance.usage,
            latency_ms: latencyMs,
            trace_id: ctx.trace_id,
            capability_token_id: modelCapToken.token_id,
            vendor_request_id: modelResponse.provenance.vendor_request_id,
            // WHY no content in event: Avoids storing potentially sensitive data
            finish_reason: modelResponse.finish_reason,
          },
        },
        tags
      );

      // Step 8: Return structured response
      return {
        content: modelResponse.content,
        usage: modelResponse.provenance.usage,
        model_id: modelResponse.provenance.model_id,
        provider: modelResponse.provenance.provider,
        trace_id: ctx.trace_id,
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

  // Initialize adapter gateway
  // WHY gateway: Provides capability enforcement for all adapter calls
  const gateway = createGateway({
    allowed_model_families: ['openai', 'anthropic', 'local'],
    allowed_tool_categories: ['file', 'web', 'code', 'data'],
    max_tokens_per_request: 100000,
    strict_mode: true,
  });

  // Initialize model router
  // WHY router: Routes requests to appropriate adapters based on model_id
  const modelRouter = createModelRouter(gateway, {
    providers: {
      openai: {
        api_key: process.env.OPENAI_API_KEY,
      },
      anthropic: {
        api_key: process.env.ANTHROPIC_API_KEY,
      },
      local: {},
    },
  });

  // Create handler registry and register handlers
  const registry = new HandlerRegistry();
  registerHandlers(registry, store, modelRouter);

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

  // =========================================================================
  // ai.chat HTTP Route - v2.2 Model Bus Endpoint
  // =========================================================================
  /**
   * WHY this route exists:
   * - Provides HTTP interface to the ai.chat handler
   * - Requires model_invocation + memory_read + memory_write capabilities
   * - All model calls MUST go through this governed path
   *
   * POST /threads/:thread_id/ai/chat
   * Body: { namespace_id, model_id, user_input, parameters? }
   */
  pipelineRouter.addRoute({
    method: 'post',
    path: '/threads/:thread_id/ai/chat',
    intent: 'ai.chat',
    risk_class: 'medium_risk',
    required_capabilities: ['model_invocation', 'memory_read', 'memory_write'],
    extractOiId: (req) => req.body.namespace_id || 'default',
    extractPrincipalId: (req) => req.headers['x-principal-id'] as string || 'anonymous',
    extractPayload: (req) => ({
      namespace_id: req.body.namespace_id || 'default',
      thread_id: req.params.thread_id,
      model_id: req.body.model_id,
      user_input: req.body.user_input,
      parameters: req.body.parameters,
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
  app.use('/api/v2.2', pipelineRouter.getRouter());

  // Legacy v2.1 mount point for backwards compatibility
  app.use('/api/v2.1', pipelineRouter.getRouter());

  // Legacy health endpoint (no pipeline for backwards compat)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '2.2.0' });
  });

  // Start and stop functions
  let server: any = null;

  const start = async () => {
    return new Promise<void>((resolve) => {
      server = app.listen(config.port, config.host, () => {
        console.log(`Mathison v2.2 server listening on ${config.host}:${config.port}`);
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
