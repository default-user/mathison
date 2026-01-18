/**
 * WHY: integrations.ts - Entrypoint adapters for governed pipeline
 * -----------------------------------------------------------------------------
 * - Provides HTTP router, gRPC interceptor, CLI executor, and worker processor wrappers
 * - Needed to make pipeline integration easy while preventing bypass of governance checks
 * - Enforces: all entrypoints route through PipelineExecutor; context built from request metadata
 * - Tradeoff: Framework-specific wrappers vs generic approach; Express/gRPC coupling
 */

import { Request, Response, NextFunction, Router, RequestHandler } from 'express';
import {
  PipelineContext,
  PipelineRequest,
  PipelineResponse,
  RequestOrigin,
  RegisteredHandler,
  PipelineHandler,
} from './types';
import { PipelineExecutor, HandlerRegistry, buildContext } from './executor';

// ============================================================================
// HTTP Integration
// ============================================================================

/**
 * Express middleware that wraps a route to go through the pipeline.
 * This is the ONLY way to create HTTP routes in v2.1.
 */
export interface HttpRouteConfig {
  /** HTTP method */
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Route path */
  path: string;
  /** Intent to execute */
  intent: string;
  /** Risk class for this route */
  risk_class: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk';
  /** Required capabilities */
  required_capabilities?: string[];
  /** Extract oi_id from request */
  extractOiId: (req: Request) => string;
  /** Extract principal_id from request */
  extractPrincipalId: (req: Request) => string;
  /** Extract payload from request */
  extractPayload: (req: Request) => unknown;
}

/**
 * Create an HTTP router that enforces pipeline execution.
 * All routes added through this router MUST go through the pipeline.
 */
export class PipelineRouter {
  private executor: PipelineExecutor;
  private router: Router;
  private routes: HttpRouteConfig[] = [];

  constructor(executor: PipelineExecutor) {
    this.executor = executor;
    this.router = Router();
  }

  /**
   * Add a route that goes through the pipeline
   */
  addRoute(config: HttpRouteConfig): void {
    this.routes.push(config);
    const handler = this.createRouteHandler(config);

    switch (config.method) {
      case 'get':
        this.router.get(config.path, handler);
        break;
      case 'post':
        this.router.post(config.path, handler);
        break;
      case 'put':
        this.router.put(config.path, handler);
        break;
      case 'patch':
        this.router.patch(config.path, handler);
        break;
      case 'delete':
        this.router.delete(config.path, handler);
        break;
    }
  }

  /**
   * Get the Express router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Create a route handler that executes through the pipeline
   */
  private createRouteHandler(config: HttpRouteConfig): RequestHandler {
    return async (req: Request, res: Response, _next: NextFunction) => {
      try {
        // Build context from request
        const context = buildContext({
          principal_id: config.extractPrincipalId(req),
          oi_id: config.extractOiId(req),
          intent: config.intent,
          requested_capabilities: config.required_capabilities || [],
          origin: {
            source: 'http',
            labels: this.extractLabels(req),
            purpose: config.intent,
            client_id: req.ip || req.socket.remoteAddress,
          },
          metadata: {
            http_method: req.method,
            http_path: req.path,
            http_headers: this.sanitizeHeaders(req.headers),
          },
        });

        // Build pipeline request
        const pipelineRequest: PipelineRequest = {
          context,
          payload: config.extractPayload(req),
        };

        // Execute through pipeline
        const response = await this.executor.execute(pipelineRequest);

        // Send response
        if (response.success) {
          res.status(200).json({
            success: true,
            data: response.data,
            trace_id: response.trace_id,
          });
        } else {
          const statusCode = this.errorToStatusCode(response.error!.code);
          res.status(statusCode).json({
            success: false,
            error: {
              code: response.error!.code,
              message: response.error!.message,
            },
            trace_id: response.trace_id,
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An internal error occurred',
          },
        });
      }
    };
  }

  /**
   * Extract taint labels from request
   */
  private extractLabels(req: Request): string[] {
    const labels: string[] = [];

    // Add origin labels
    if (req.headers['x-forwarded-for']) {
      labels.push('proxied');
    }

    if (req.headers['x-api-key']) {
      labels.push('api_key_auth');
    }

    if (req.headers['authorization']) {
      labels.push('bearer_auth');
    }

    return labels;
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'x-auth-token'];

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Map error codes to HTTP status codes
   */
  private errorToStatusCode(code: string): number {
    switch (code) {
      case 'INVALID_CONTEXT':
      case 'CIF_VALIDATION_FAILED':
        return 400;
      case 'ACTION_DENIED':
      case 'CAPSULE_INVALID':
      case 'CAPSULE_MISSING':
        return 403;
      case 'UNKNOWN_INTENT':
        return 404;
      case 'HANDLER_ERROR':
        return 500;
      default:
        return 500;
    }
  }
}

// ============================================================================
// gRPC Integration
// ============================================================================

/**
 * gRPC interceptor configuration
 */
export interface GrpcInterceptorConfig {
  /** Extract oi_id from gRPC metadata */
  extractOiId: (metadata: Record<string, string>) => string;
  /** Extract principal_id from gRPC metadata */
  extractPrincipalId: (metadata: Record<string, string>) => string;
}

/**
 * Create a gRPC interceptor that enforces pipeline execution.
 * This wraps gRPC service methods to go through the pipeline.
 */
export function createGrpcInterceptor(
  executor: PipelineExecutor,
  config: GrpcInterceptorConfig
) {
  return function grpcPipelineInterceptor(
    call: any,
    methodDescriptor: any,
    callback: any
  ) {
    return async (request: unknown, metadata: Record<string, string>) => {
      // Build context from gRPC call
      const context = buildContext({
        principal_id: config.extractPrincipalId(metadata),
        oi_id: config.extractOiId(metadata),
        intent: methodDescriptor.path || 'unknown',
        requested_capabilities: [],
        origin: {
          source: 'grpc',
          labels: [],
          purpose: methodDescriptor.path || 'unknown',
          client_id: call.getPeer?.() || 'unknown',
        },
        metadata: {
          grpc_method: methodDescriptor.path,
          grpc_metadata: metadata,
        },
      });

      // Build pipeline request
      const pipelineRequest: PipelineRequest = {
        context,
        payload: request,
      };

      // Execute through pipeline
      const response = await executor.execute(pipelineRequest);

      if (response.success) {
        return response.data;
      } else {
        const error = new Error(response.error!.message);
        (error as any).code = response.error!.code;
        throw error;
      }
    };
  };
}

// ============================================================================
// CLI Integration
// ============================================================================

/**
 * CLI command configuration
 */
export interface CliCommandConfig {
  /** Command name */
  name: string;
  /** Command description */
  description: string;
  /** Intent to execute */
  intent: string;
  /** Risk class */
  risk_class: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk';
  /** Required capabilities */
  required_capabilities?: string[];
  /** Extract payload from CLI args */
  extractPayload: (args: Record<string, unknown>) => unknown;
  /** Extract oi_id from CLI args or environment */
  extractOiId: (args: Record<string, unknown>) => string;
}

/**
 * CLI executor that enforces pipeline execution.
 * All CLI commands MUST go through this executor.
 */
export class CliPipelineExecutor {
  private executor: PipelineExecutor;
  private commands: Map<string, CliCommandConfig> = new Map();
  private principalId: string;

  constructor(executor: PipelineExecutor, principalId: string) {
    this.executor = executor;
    this.principalId = principalId;
  }

  /**
   * Register a CLI command
   */
  registerCommand(config: CliCommandConfig): void {
    this.commands.set(config.name, config);
  }

  /**
   * Execute a CLI command through the pipeline
   */
  async executeCommand(
    commandName: string,
    args: Record<string, unknown>
  ): Promise<PipelineResponse> {
    const command = this.commands.get(commandName);
    if (!command) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_COMMAND',
          message: `Unknown command: ${commandName}`,
          stage: 'context_normalization',
        },
        decision_meta: {
          allowed: false,
          reason: `Unknown command: ${commandName}`,
          risk_class: 'high_risk',
          capability_tokens: [],
          redaction_rules: [],
          required_confirmation: false,
          decided_at: new Date(),
        },
        trace_id: 'cli-error',
      };
    }

    // Build context from CLI invocation
    const context = buildContext({
      principal_id: this.principalId,
      oi_id: command.extractOiId(args),
      intent: command.intent,
      requested_capabilities: command.required_capabilities || [],
      origin: {
        source: 'cli',
        labels: ['interactive'],
        purpose: command.intent,
        client_id: process.env.USER || 'cli-user',
      },
      metadata: {
        command: commandName,
        args,
        pid: process.pid,
      },
    });

    // Build pipeline request
    const pipelineRequest: PipelineRequest = {
      context,
      payload: command.extractPayload(args),
    };

    // Execute through pipeline
    return this.executor.execute(pipelineRequest);
  }

  /**
   * List registered commands
   */
  listCommands(): CliCommandConfig[] {
    return Array.from(this.commands.values());
  }
}

// ============================================================================
// Worker Integration
// ============================================================================

/**
 * Worker job configuration
 */
export interface WorkerJobConfig {
  /** Job type */
  type: string;
  /** Intent to execute */
  intent: string;
  /** Risk class */
  risk_class: 'read_only' | 'low_risk' | 'medium_risk' | 'high_risk';
  /** Required capabilities */
  required_capabilities?: string[];
  /** Extract payload from job data */
  extractPayload: (jobData: unknown) => unknown;
  /** Extract oi_id from job data */
  extractOiId: (jobData: unknown) => string;
  /** Extract principal_id from job data */
  extractPrincipalId: (jobData: unknown) => string;
}

/**
 * Worker executor that enforces pipeline execution.
 * All worker jobs MUST go through this executor.
 */
export class WorkerPipelineExecutor {
  private executor: PipelineExecutor;
  private jobs: Map<string, WorkerJobConfig> = new Map();

  constructor(executor: PipelineExecutor) {
    this.executor = executor;
  }

  /**
   * Register a worker job type
   */
  registerJob(config: WorkerJobConfig): void {
    this.jobs.set(config.type, config);
  }

  /**
   * Process a worker job through the pipeline
   */
  async processJob(
    jobType: string,
    jobData: unknown,
    jobId: string
  ): Promise<PipelineResponse> {
    const jobConfig = this.jobs.get(jobType);
    if (!jobConfig) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN_JOB_TYPE',
          message: `Unknown job type: ${jobType}`,
          stage: 'context_normalization',
        },
        decision_meta: {
          allowed: false,
          reason: `Unknown job type: ${jobType}`,
          risk_class: 'high_risk',
          capability_tokens: [],
          redaction_rules: [],
          required_confirmation: false,
          decided_at: new Date(),
        },
        trace_id: jobId,
      };
    }

    // Build context from job
    const context = buildContext({
      principal_id: jobConfig.extractPrincipalId(jobData),
      oi_id: jobConfig.extractOiId(jobData),
      intent: jobConfig.intent,
      requested_capabilities: jobConfig.required_capabilities || [],
      origin: {
        source: 'worker',
        labels: ['background', 'scheduled'],
        purpose: jobConfig.intent,
        client_id: `worker-${process.pid}`,
      },
      metadata: {
        job_id: jobId,
        job_type: jobType,
      },
    });

    // Build pipeline request
    const pipelineRequest: PipelineRequest = {
      context,
      payload: jobConfig.extractPayload(jobData),
    };

    // Execute through pipeline
    return this.executor.execute(pipelineRequest);
  }
}
