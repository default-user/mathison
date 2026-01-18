/**
 * WHY: index.ts - Pipeline module public API
 * -----------------------------------------------------------------------------
 * - Barrel export for executor, types, and entrypoint integrations (HTTP/gRPC/CLI/worker)
 * - Needed to provide single import point for governed pipeline functionality
 * - Enforces: all entrypoints must use provided integrations; no direct handler calls
 * - Tradeoff: Larger export surface vs convenience of single import
 */

// Types
export * from './types';

// Executor
export {
  PipelineExecutor,
  PipelineConfig,
  HandlerRegistry,
  buildContext,
  createPipeline,
} from './executor';

// Integrations
export {
  PipelineRouter,
  HttpRouteConfig,
  createGrpcInterceptor,
  GrpcInterceptorConfig,
  CliPipelineExecutor,
  CliCommandConfig,
  WorkerPipelineExecutor,
  WorkerJobConfig,
} from './integrations';
