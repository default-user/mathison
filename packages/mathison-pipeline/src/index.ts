/**
 * Mathison v2.1 Pipeline
 *
 * Unified governed request pipeline for all entrypoints.
 * Every request MUST flow through: CIF ingress → CDI action check → handler → CDI output check → CIF egress
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
