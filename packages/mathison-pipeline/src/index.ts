/**
 * WHY: index.ts - Pipeline module public API
 * -----------------------------------------------------------------------------
 * - Barrel export for executor, types, and entrypoint integrations (HTTP/gRPC/CLI/worker)
 * - Needed to provide single import point for governed pipeline functionality
 * - Enforces: all entrypoints must use provided integrations; no direct handler calls
 * - Tradeoff: Larger export surface vs convenience of single import
 *
 * ONE_PATH_LAW: All requests MUST flow through the governed pipeline.
 * CIF_INGRESS → CDI_ACTION → HANDLER → CDI_OUTPUT → CIF_EGRESS
 */

// Types
export * from './types';

// ONE_PATH_LAW - Core governance invariant (BUILD PRIORITY 0)
export {
  // Core types
  type CifIngressToken,
  type CdiActionToken,
  type CapabilityToken,
  type HandlerResultToken,
  type CdiOutputToken,
  type CifEgressToken,
  type PipelineStage,
  type DegradationLevel,
  type RiskClass,
  type StageReceipt,
  type ReceiptChain,
  type PipelineState,
  type PipelineError,
  // Constants
  PIPELINE_STAGES,
  VALID_TRANSITIONS,
  DEGRADATION_LADDER,
  // Functions
  generateReceipt,
  verifyReceiptChain,
  createPipelineState,
  canTransitionTo,
  transitionTo,
  completePipeline,
  failPipeline,
  // Singletons
  tokenStore,
  onePathLaw,
  // Classes
  OnePathLawEnforcer,
} from './one-path-law';

// Governed Executor - THE ONLY path for request execution
export {
  GovernedExecutor,
  HandlerRegistry as GovernedHandlerRegistry,
  createGovernedExecutor,
  buildContext as buildGovernedContext,
  type GovernedExecutorConfig,
  type GovernanceProvider as GovernedGovernanceProvider,
  type PipelineContext as GovernedPipelineContext,
  type PipelineRequest as GovernedPipelineRequest,
  type PipelineResponse as GovernedPipelineResponse,
  type DecisionMeta as GovernedDecisionMeta,
  type RedactionRule as GovernedRedactionRule,
  type RegisteredHandler as GovernedHandler,
  type RequestOrigin as GovernedRequestOrigin,
  type CapsuleStatus,
  type IngressResult,
  type ActionResult,
  type OutputResult,
  type EgressResult,
} from './governed-executor';

// Legacy Executor (to be migrated to GovernedExecutor)
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
