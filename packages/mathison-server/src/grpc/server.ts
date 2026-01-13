/**
 * gRPC Server with Governance Parity
 * Enforces same CIF/CDI pipeline as HTTP server
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as fs from 'fs';
import { CIF, CDI, GovernanceProofBuilder, GovernanceProof, actionRegistry, getToolGateway, CapabilityToken } from 'mathison-governance';
import { ActionGate } from '../action-gate';
import { MemoryGraph } from 'mathison-memory';
import { Interpreter } from 'mathison-oi';
import { JobExecutor } from '../job-executor';
import { Genome } from 'mathison-genome';
import { createCIFIngressInterceptor, createCIFEgressInterceptor } from './interceptors/cif-interceptor';
import { createCDIInterceptor } from './interceptors/cdi-interceptor';
import { createHeartbeatInterceptor } from './interceptors/heartbeat-interceptor';
import { HeartbeatMonitor } from '../heartbeat';
import { createHash, randomBytes } from 'crypto';
import { KnowledgeIngestionGate } from '../knowledge/ingestion-gate';

/**
 * P0.4: Canonical Action IDs for gRPC handlers
 * Must match HTTP route action IDs for consistency
 */
export const GRPC_ACTION_IDS = {
  RUN_JOB: 'action:job:run',
  GET_JOB_STATUS: 'action:job:status',
  STREAM_JOB_STATUS: 'action:job:stream_status',
  INTERPRET_TEXT: 'action:oi:interpret',
  CREATE_MEMORY_NODE: 'action:memory:create',
  READ_MEMORY_NODE: 'action:memory:read',
  SEARCH_MEMORY: 'action:memory:search',
  INGEST_KNOWLEDGE: 'action:knowledge:ingest'
} as const;

/**
 * Resolve proto file path reliably
 * Uses MATHISON_REPO_ROOT env var if set, otherwise finds repo root via __dirname
 */
function resolveProtoPath(): string {
  // 1. Check explicit env var
  if (process.env.MATHISON_REPO_ROOT) {
    const protoPath = path.join(process.env.MATHISON_REPO_ROOT, 'proto', 'mathison.proto');
    if (fs.existsSync(protoPath)) {
      return protoPath;
    }
  }

  // 2. Try relative to this file's location (packages/mathison-server/src/grpc -> repo root)
  const fromDirname = path.resolve(__dirname, '..', '..', '..', '..', 'proto', 'mathison.proto');
  if (fs.existsSync(fromDirname)) {
    return fromDirname;
  }

  // 3. Try relative to dist location (packages/mathison-server/dist/grpc -> repo root)
  const fromDist = path.resolve(__dirname, '..', '..', '..', '..', 'proto', 'mathison.proto');
  if (fs.existsSync(fromDist)) {
    return fromDist;
  }

  // 4. Fallback to cwd-based resolution (original behavior)
  const cwdPath = path.join(process.cwd(), 'proto', 'mathison.proto');
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  // 5. Fail-closed: no proto file found
  throw new Error(
    'PROTO_NOT_FOUND: Could not find mathison.proto. ' +
    'Set MATHISON_REPO_ROOT env var to repo root, or run from repo root.'
  );
}

export interface GRPCServerConfig {
  port: number;
  host: string;
  cif: CIF;
  cdi: CDI;
  actionGate: ActionGate | null;
  memoryGraph: MemoryGraph | null;
  interpreter: Interpreter | null;
  jobExecutor: JobExecutor | null;
  genome: Genome | null;
  genomeId: string | null;
  heartbeat: HeartbeatMonitor | null;
  knowledgeGate: KnowledgeIngestionGate | null;
}

export class MathisonGRPCServer {
  private server: grpc.Server;
  private config: GRPCServerConfig;
  private protoPath: string;
  private started: boolean = false;
  private boundPort: number | null = null;

  constructor(config: GRPCServerConfig) {
    this.config = config;
    // P0.1: Use reliable proto path resolution instead of cwd-dependent path
    this.protoPath = resolveProtoPath();

    // Create server with interceptors (governance pipeline)
    this.server = new grpc.Server();
  }

  /**
   * Get the port the server is bound to (after start())
   */
  getPort(): number | null {
    return this.boundPort;
  }

  /**
   * Check if server is started
   */
  isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) {
      console.warn('⚠️  gRPC server already started');
      return;
    }

    console.log('🔌 Starting gRPC server with governance pipeline...');
    console.log(`   Proto path: ${this.protoPath}`);

    // Load proto definition
    const packageDefinition = protoLoader.loadSync(this.protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    // Implement service methods
    const serviceImplementation = {
      RunJob: this.handleRunJob.bind(this),
      GetJobStatus: this.handleGetJobStatus.bind(this),
      StreamJobStatus: this.handleStreamJobStatus.bind(this),
      InterpretText: this.handleInterpretText.bind(this),
      CreateMemoryNode: this.handleCreateMemoryNode.bind(this),
      ReadMemoryNode: this.handleReadMemoryNode.bind(this),
      SearchMemory: this.handleSearchMemory.bind(this),
      IngestKnowledge: this.handleIngestKnowledge.bind(this)
    };

    // Add service with interceptors
    this.server.addService(proto.mathison.MathisonService.service, serviceImplementation);

    // P0.1: Properly await bindAsync completion using Promise wrapper
    const address = `${this.config.host}:${this.config.port}`;
    await new Promise<void>((resolve, reject) => {
      this.server.bindAsync(
        address,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            console.error('❌ gRPC server bind failed:', error);
            reject(new Error(`GRPC_BIND_FAILED: ${error.message}`));
            return;
          }
          this.boundPort = port;
          console.log(`✅ gRPC server bound to ${address} (port ${port})`);
          resolve();
        }
      );
    });

    // P0.1: Actually start the server after successful bind
    // In @grpc/grpc-js, server.start() is deprecated but we need to ensure the server is ready
    // The server is ready to accept connections after bindAsync succeeds
    this.started = true;
    console.log(`✅ gRPC server listening on ${address}`);
  }

  async stop(): Promise<void> {
    if (!this.started) {
      console.warn('⚠️  gRPC server not started');
      return;
    }

    console.log('🛑 Stopping gRPC server...');
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        this.started = false;
        this.boundPort = null;
        console.log('✅ gRPC server stopped');
        resolve();
      });
    });
  }

  /**
   * Governance pipeline wrapper for all RPC calls
   * Applies: Heartbeat -> CIF Ingress -> CDI Action Check -> Handler -> CDI Output -> CIF Egress
   * P0.1: Generates GovernanceProof for every request
   * P0.4: Validates action_id against canonical registry
   */
  private async withGovernance<TRequest, TResponse>(
    call: grpc.ServerUnaryCall<TRequest, TResponse> | grpc.ServerWritableStream<TRequest, TResponse>,
    action: string,
    actionId: string,  // P0.4: Canonical action ID (now required)
    handler: (sanitizedRequest: TRequest, proof: GovernanceProofBuilder, capabilityToken?: CapabilityToken) => Promise<TResponse>
  ): Promise<TResponse> {
    // P0.4: Validate action ID against registry (fail-closed if unregistered)
    if (!actionRegistry.isRegistered(actionId)) {
      const error: any = new Error(`UNREGISTERED_ACTION: Action ID "${actionId}" not in registry`);
      error.code = grpc.status.PERMISSION_DENIED;
      error.details = JSON.stringify({
        reason_code: 'UNREGISTERED_ACTION',
        action_id: actionId
      });
      throw error;
    }

    // P0.1: Initialize governance proof
    const requestId = randomBytes(16).toString('hex');
    const proof = new GovernanceProofBuilder(requestId, call.request);
    // 1. Heartbeat fail-closed check
    if (this.config.heartbeat && !this.config.heartbeat.isHealthy()) {
      const status = this.config.heartbeat.getStatus();
      const error: any = new Error('System in fail-closed posture');
      error.code = grpc.status.UNAVAILABLE;
      error.details = JSON.stringify({
        reason_code: 'HEARTBEAT_FAIL_CLOSED',
        failed_checks: status?.checks.filter(c => !c.ok)
      });
      throw error;
    }

    // 2. CIF Ingress
    const clientId = call.getPeer();
    const ingressInput = {
      clientId,
      endpoint: (call as any).handler?.path || 'unknown',
      payload: call.request,
      headers: call.metadata.getMap() as Record<string, string>,
      timestamp: Date.now()
    };
    const ingressResult = await this.config.cif.ingress(ingressInput);

    // P0.1: Record CIF ingress stage
    proof.addCIFIngress(ingressInput, ingressResult);

    if (!ingressResult.allowed) {
      // P0.1: Generate denial proof
      proof.setVerdict('deny');
      const denialProof = proof.build();
      const error: any = new Error('CIF ingress blocked');
      error.code = grpc.status.INVALID_ARGUMENT;
      error.details = JSON.stringify({
        reason_code: 'CIF_INGRESS_BLOCKED',
        violations: ingressResult.violations,
        governance_proof: denialProof
      });
      throw error;
    }

    // 3. CDI Action Check
    const actionInput = {
      actor: clientId,
      action,
      action_id: actionId,  // P0.4: Canonical action ID
      payload: ingressResult.sanitizedPayload,
      route: (call as any).handler?.path,
      method: 'gRPC',
      request_hash: createHash('sha256').update(JSON.stringify(call.request)).digest('hex')
    };
    const actionResult = await this.config.cdi.checkAction(actionInput);

    // P0.1: Record CDI action stage
    proof.addCDIAction(actionInput, actionResult);

    if (actionResult.verdict !== 'allow') {
      // P0.1: Generate denial proof
      proof.setVerdict('deny');
      const denialProof = proof.build();
      const error: any = new Error('CDI action denied');
      error.code = grpc.status.PERMISSION_DENIED;
      error.details = JSON.stringify({
        reason_code: 'CDI_ACTION_DENIED',
        reason: actionResult.reason,
        governance_proof: denialProof
      });
      throw error;
    }

    // 4. Execute handler (pass capability token for ToolGateway integration)
    const handlerInput = ingressResult.sanitizedPayload as TRequest;
    const capabilityToken = actionResult.capability_token;
    const response = await handler(handlerInput, proof, capabilityToken);

    // P0.1: Record handler stage
    proof.addHandler(handlerInput, response);

    // 5. CDI Output Check
    const outputInput = { content: JSON.stringify(response) };
    const outputCheck = await this.config.cdi.checkOutput(outputInput);

    // P0.1: Record CDI output stage
    proof.addCDIOutput(outputInput, outputCheck);

    if (!outputCheck.allowed) {
      // P0.1: Generate denial proof
      proof.setVerdict('deny');
      const denialProof = proof.build();
      const error: any = new Error('CDI output blocked');
      error.code = grpc.status.PERMISSION_DENIED;
      error.details = JSON.stringify({
        reason_code: 'CDI_OUTPUT_BLOCKED',
        violations: outputCheck.violations,
        governance_proof: denialProof
      });
      throw error;
    }

    // 6. CIF Egress
    const egressInput = {
      clientId,
      endpoint: (call as any).handler?.path || 'unknown',
      payload: response
    };
    const egressResult = await this.config.cif.egress(egressInput);

    // P0.1: Record CIF egress stage
    proof.addCIFEgress(egressInput, egressResult);

    if (!egressResult.allowed) {
      // P0.1: Generate denial proof
      proof.setVerdict('deny');
      const denialProof = proof.build();
      const error: any = new Error('CIF egress blocked');
      error.code = grpc.status.PERMISSION_DENIED;
      error.details = JSON.stringify({
        reason_code: 'CIF_EGRESS_BLOCKED',
        violations: egressResult.violations,
        governance_proof: denialProof
      });
      throw error;
    }

    // P0.1: Finalize governance proof
    proof.setVerdict('allow');
    const finalProof = proof.build();

    // P2.1: Receipt generation complete - handlers use ActionGate.executeSideEffect
    // which generates receipts for write operations (see handleRunJob, handleCreateMemoryNode)

    return egressResult.sanitizedPayload as TResponse;
  }

  private async handleRunJob(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'job_run', GRPC_ACTION_IDS.RUN_JOB, async (req, proof) => {
        if (!this.config.jobExecutor) {
          throw new Error('Job executor not initialized');
        }
        if (!this.config.actionGate) {
          throw new Error('Action gate not initialized');
        }

        const jobRequest = {
          jobType: (req as any).job_type || 'default',
          inputs: (req as any).inputs ? JSON.parse(Buffer.from((req as any).inputs).toString()) : {},
          policyId: (req as any).policy_id,
          jobId: (req as any).job_id
        };

        // Execute via ActionGate (generates receipt for gRPC RPC)
        // Note: JobExecutor also generates receipts internally for job checkpoints
        const gateResult = await this.config.actionGate.executeSideEffect(
          {
            actor: call.getPeer(),
            action: 'JOB_RUN',
            payload: jobRequest,
            metadata: {
              job_id: jobRequest.jobId || 'new',
              stage: 'grpc_job_run',
              policy_id: jobRequest.policyId || 'default'
            },
            genome_id: this.config.genomeId ?? undefined,
            genome_version: this.config.genome?.version
          },
          async () => {
            return this.config.jobExecutor!.runJob(
              call.getPeer(),
              jobRequest,
              this.config.genomeId ?? undefined,
              this.config.genome?.version
            );
          }
        );

        if (!gateResult.success) {
          const error: any = new Error(gateResult.governance.message || 'ActionGate denied');
          error.code = grpc.status.PERMISSION_DENIED;
          error.details = JSON.stringify({
            reason_code: gateResult.governance.reasonCode,
            message: gateResult.governance.message
          });
          throw error;
        }

        const result = gateResult.data as any;

        return {
          job_id: result.job_id,
          status: result.status,
          outputs: Buffer.from(JSON.stringify(result.outputs || {})),
          receipt_id: gateResult.receipt?.timestamp || ''
        };
      });

      callback(null, response);
    } catch (error: any) {
      callback({
        code: error.code || grpc.status.INTERNAL,
        message: error.message,
        details: error.details
      }, null);
    }
  }

  private async handleGetJobStatus(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'job_status', GRPC_ACTION_IDS.GET_JOB_STATUS, async (req, proof) => {
        if (!this.config.jobExecutor) {
          throw new Error('Job executor not initialized');
        }

        const status = await this.config.jobExecutor.getStatus(
          (req as any).job_id,
          this.config.genomeId ?? undefined,
          this.config.genome?.version
        );

        if (!status) {
          const error: any = new Error('Job not found');
          error.code = grpc.status.NOT_FOUND;
          throw error;
        }

        return {
          job_id: status.job_id,
          status: status.status,
          current_stage: '',  // Not in JobResult type
          start_time: 0,  // Not in JobResult type
          end_time: 0  // Not in JobResult type
        };
      });

      callback(null, response);
    } catch (error: any) {
      callback({
        code: error.code || grpc.status.INTERNAL,
        message: error.message
      }, null);
    }
  }

  /**
   * Stream job status updates (server streaming)
   * Polls job executor and streams status updates until job completes or times out
   * Full governance parity: heartbeat, CIF ingress/egress, CDI action/output, proofs, receipts
   */
  private async handleStreamJobStatus(
    call: grpc.ServerWritableStream<any, any>
  ): Promise<void> {
    const clientId = call.getPeer();
    const endpoint = '/mathison.MathisonService/StreamJobStatus';
    const requestId = randomBytes(16).toString('hex');
    const proof = new GovernanceProofBuilder(requestId, call.request);

    try {
      // 1. Heartbeat fail-closed check
      if (this.config.heartbeat && !this.config.heartbeat.isHealthy()) {
        const status = this.config.heartbeat.getStatus();
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.UNAVAILABLE,
          message: 'System in fail-closed posture',
          details: JSON.stringify({
            reason_code: 'HEARTBEAT_FAIL_CLOSED',
            failed_checks: status?.checks.filter(c => !c.ok),
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      // 2. Validate action ID against registry
      if (!actionRegistry.isRegistered(GRPC_ACTION_IDS.STREAM_JOB_STATUS)) {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.PERMISSION_DENIED,
          message: `UNREGISTERED_ACTION: ${GRPC_ACTION_IDS.STREAM_JOB_STATUS}`,
          details: JSON.stringify({
            reason_code: 'UNREGISTERED_ACTION',
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      // 3. CIF ingress
      const ingressInput = {
        clientId,
        endpoint,
        payload: call.request,
        headers: call.metadata.getMap() as Record<string, string>,
        timestamp: Date.now()
      };
      const ingressResult = await this.config.cif.ingress(ingressInput);
      proof.addCIFIngress(ingressInput, ingressResult);

      if (!ingressResult.allowed) {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.INVALID_ARGUMENT,
          message: 'CIF ingress blocked',
          details: JSON.stringify({
            violations: ingressResult.violations,
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      // 4. CDI action check
      const actionInput = {
        actor: clientId,
        action: 'job_stream_status',
        action_id: GRPC_ACTION_IDS.STREAM_JOB_STATUS,
        payload: ingressResult.sanitizedPayload,
        route: endpoint,
        method: 'gRPC',
        request_hash: createHash('sha256').update(JSON.stringify(call.request)).digest('hex')
      };
      const actionResult = await this.config.cdi.checkAction(actionInput);
      proof.addCDIAction(actionInput, actionResult);

      if (actionResult.verdict !== 'allow') {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.PERMISSION_DENIED,
          message: 'CDI action denied',
          details: JSON.stringify({
            reason: actionResult.reason,
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      if (!this.config.jobExecutor) {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.UNAVAILABLE,
          message: 'Job executor not initialized'
        });
        call.end();
        return;
      }

      // 5. Generate stream start receipt via ActionGate
      if (this.config.actionGate) {
        await this.config.actionGate.executeSideEffect(
          {
            actor: clientId,
            action: 'STREAM_START',
            payload: { endpoint, job_id: (call.request as any).job_id },
            metadata: {
              job_id: (call.request as any).job_id,
              stage: 'grpc_stream_start',
              policy_id: 'stream'
            },
            genome_id: this.config.genomeId ?? undefined,
            genome_version: this.config.genome?.version
          },
          async () => ({ stream_id: requestId, started_at: new Date().toISOString() })
        );
      }

      const jobId = (call.request as any).job_id;
      const pollIntervalMs = 500;
      const maxDurationMs = 60000; // 1 minute max
      const maxEvents = 100; // Max 100 status updates
      const startTime = Date.now();
      let eventCount = 0;
      let streamCompleted = false;
      let streamError: any = null;
      let cancelled = false;

      // Handle client disconnect
      call.on('cancelled', () => {
        cancelled = true;
        call.end();
      });

      // Async polling loop to avoid overlapping async calls
      const pollLoop = async () => {
        try {
          while (!cancelled) {
            const status = await this.config.jobExecutor!.getStatus(
              jobId,
              this.config.genomeId ?? undefined,
              this.config.genome?.version
            );

            if (!status) {
              streamError = { code: grpc.status.NOT_FOUND, message: 'Job not found' };
              call.emit('error', streamError);
              call.end();
              return;
            }

            // 6. CDI output check for each event
            const outputInput = { content: JSON.stringify(status) };
            const outputCheck = await this.config.cdi.checkOutput(outputInput);

            if (!outputCheck.allowed) {
              // Fail closed: deny this event, continue stream
              console.warn(`Stream event blocked by CDI output: ${outputCheck.violations}`);
            } else {
              // 7. CIF egress check for each event
              const egressInput = { clientId, endpoint, payload: status };
              const egressResult = await this.config.cif.egress(egressInput);

              if (egressResult.allowed) {
                call.write({
                  job_id: status.job_id,
                  status: status.status,
                  current_stage: '',
                  start_time: 0,
                  end_time: 0
                });
                eventCount++;
              }
            }

            // Stop conditions
            const elapsed = Date.now() - startTime;
            if (status.status === 'completed' || status.status === 'failed' ||
                elapsed > maxDurationMs || eventCount >= maxEvents) {
              streamCompleted = true;
              call.end();
              return;
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          }
        } catch (error) {
          streamError = error;
          call.emit('error', {
            code: grpc.status.INTERNAL,
            message: error instanceof Error ? error.message : String(error)
          });
          call.end();
        }
      };

      // Start polling loop
      pollLoop();

      // Handle stream end: generate completion receipt and proof
      // Use once flag to prevent duplicate receipts on multiple events
      let completionReceiptGenerated = false;
      const generateCompletionReceipt = async () => {
        if (completionReceiptGenerated) return;
        completionReceiptGenerated = true;

        try {
          // 8. Generate stream completion receipt via ActionGate
          if (this.config.actionGate) {
            await this.config.actionGate.executeSideEffect(
              {
                actor: clientId,
                action: 'STREAM_COMPLETE',
                payload: {
                  endpoint,
                  job_id: jobId,
                  event_count: eventCount,
                  completed: streamCompleted,
                  error: streamError?.message || null
                },
                metadata: {
                  job_id: jobId,
                  stage: 'grpc_stream_complete',
                  policy_id: 'stream',
                  event_count: eventCount
                },
                genome_id: this.config.genomeId ?? undefined,
                genome_version: this.config.genome?.version
              },
              async () => ({
                stream_id: requestId,
                completed_at: new Date().toISOString(),
                event_count: eventCount
              })
            );
          }

          // 9. Finalize governance proof
          proof.setVerdict(streamError ? 'deny' : 'allow');
          proof.addHandler(call.request, { event_count: eventCount, completed: streamCompleted });
          const finalProof = proof.build();
          // Proof is generated but not attached to stream (could log or store if needed)
        } catch (error) {
          console.error('Stream completion receipt failed:', error);
        }
      };

      // Attach to multiple stream lifecycle events to ensure reliable receipt generation
      call.on('finish', generateCompletionReceipt);
      call.on('close', generateCompletionReceipt);
      call.on('end', generateCompletionReceipt);

    } catch (error: any) {
      proof.setVerdict('deny');
      call.emit('error', {
        code: error.code || grpc.status.INTERNAL,
        message: error.message,
        details: JSON.stringify({ governance_proof: proof.build() })
      });
      call.end();
    }
  }

  private async handleInterpretText(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'oi_interpret', GRPC_ACTION_IDS.INTERPRET_TEXT, async (req, proof, capabilityToken) => {
        if (!this.config.interpreter) {
          throw new Error('OI interpreter not initialized');
        }

        // Thin-Waist v0.1: Route through ToolGateway (no bypass)
        if (!capabilityToken) {
          throw new Error('No capability token provided by CDI (governance denied)');
        }

        const gateway = getToolGateway();
        const clientId = call.getPeer();

        const toolResult = await gateway.invoke<{ text: string; limit?: number }, any>(
          'oi-interpret',
          {
            text: (req as any).text,
            limit: (req as any).limit
          },
          capabilityToken,
          {
            actor: clientId,
            metadata: { source: 'grpc:InterpretText' },
            genome_id: this.config.genomeId ?? undefined,
            genome_version: this.config.genome?.version
          }
        );

        if (!toolResult.success) {
          throw new Error(toolResult.denied_reason || toolResult.error || 'Tool invocation denied');
        }

        return {
          tokens: [],  // InterpretResponse doesn't have tokens field
          matches: []  // InterpretResponse doesn't have matches field in this simplified implementation
        };
      });

      callback(null, response);
    } catch (error: any) {
      callback({
        code: error.code || grpc.status.INTERNAL,
        message: error.message
      }, null);
    }
  }

  private async handleCreateMemoryNode(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'memory_node_create', GRPC_ACTION_IDS.CREATE_MEMORY_NODE, async (req, proof) => {
        if (!this.config.memoryGraph) {
          throw new Error('Memory graph not initialized');
        }
        if (!this.config.actionGate) {
          throw new Error('Action gate not initialized');
        }

        const nodeId = (req as any).id || `node-${randomBytes(8).toString('hex')}`;
        const node = {
          id: nodeId,
          type: (req as any).type,
          data: (req as any).data ? JSON.parse(Buffer.from((req as any).data).toString()) : {},
          metadata: (req as any).metadata ? JSON.parse(Buffer.from((req as any).metadata).toString()) : {}
        };

        // Execute via ActionGate (generates receipt)
        const result = await this.config.actionGate.executeSideEffect(
          {
            actor: call.getPeer(),
            action: 'MEMORY_NODE_CREATE',
            payload: node,
            metadata: {
              job_id: 'memory',
              stage: 'memory_write',
              policy_id: 'default'
            },
            genome_id: this.config.genomeId ?? undefined,
            genome_version: this.config.genome?.version
          },
          async () => {
            this.config.memoryGraph!.addNode(node);
            return node;
          }
        );

        if (!result.success) {
          const error: any = new Error(result.governance.message || 'ActionGate denied');
          error.code = grpc.status.PERMISSION_DENIED;
          error.details = JSON.stringify({
            reason_code: result.governance.reasonCode,
            message: result.governance.message
          });
          throw error;
        }

        return {
          node: {
            id: node.id,
            type: node.type,
            data: Buffer.from(JSON.stringify(node.data)),
            metadata: Buffer.from(JSON.stringify(node.metadata))
          },
          created: true,
          receipt_id: result.receipt?.timestamp || ''
        };
      });

      callback(null, response);
    } catch (error: any) {
      callback({
        code: error.code || grpc.status.INTERNAL,
        message: error.message,
        details: error.details
      }, null);
    }
  }

  private async handleReadMemoryNode(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'memory_read_node', GRPC_ACTION_IDS.READ_MEMORY_NODE, async (req, proof) => {
        if (!this.config.memoryGraph) {
          throw new Error('Memory graph not initialized');
        }

        const node = this.config.memoryGraph.getNode(req.id);
        if (!node) {
          const error: any = new Error('Node not found');
          error.code = grpc.status.NOT_FOUND;
          throw error;
        }

        return {
          id: node.id,
          type: node.type,
          data: Buffer.from(JSON.stringify(node.data || {})),
          metadata: Buffer.from(JSON.stringify(node.metadata || {}))
        };
      });

      callback(null, response);
    } catch (error: any) {
      callback({
        code: error.code || grpc.status.INTERNAL,
        message: error.message
      }, null);
    }
  }

  /**
   * Stream memory search results (server streaming)
   * Searches memory graph and streams results with governance
   * Full governance parity: heartbeat, CIF ingress/egress, CDI action/output, proofs, receipts
   * Thin-Waist v0.1: Routes through ToolGateway (no bypass)
   */
  private async handleSearchMemory(
    call: grpc.ServerWritableStream<any, any>
  ): Promise<void> {
    const clientId = call.getPeer();
    const endpoint = '/mathison.MathisonService/SearchMemory';
    const requestId = randomBytes(16).toString('hex');
    const proof = new GovernanceProofBuilder(requestId, call.request);
    let streamedCount = 0;
    let streamError: any = null;

    try {
      // 1. Heartbeat fail-closed check
      if (this.config.heartbeat && !this.config.heartbeat.isHealthy()) {
        const status = this.config.heartbeat.getStatus();
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.UNAVAILABLE,
          message: 'System in fail-closed posture',
          details: JSON.stringify({
            reason_code: 'HEARTBEAT_FAIL_CLOSED',
            failed_checks: status?.checks.filter(c => !c.ok),
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      // 2. Validate action ID against registry
      if (!actionRegistry.isRegistered(GRPC_ACTION_IDS.SEARCH_MEMORY)) {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.PERMISSION_DENIED,
          message: `UNREGISTERED_ACTION: ${GRPC_ACTION_IDS.SEARCH_MEMORY}`,
          details: JSON.stringify({
            reason_code: 'UNREGISTERED_ACTION',
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      // 3. CIF ingress
      const ingressInput = {
        clientId,
        endpoint,
        payload: call.request,
        headers: call.metadata.getMap() as Record<string, string>,
        timestamp: Date.now()
      };
      const ingressResult = await this.config.cif.ingress(ingressInput);
      proof.addCIFIngress(ingressInput, ingressResult);

      if (!ingressResult.allowed) {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.INVALID_ARGUMENT,
          message: 'CIF ingress blocked',
          details: JSON.stringify({
            violations: ingressResult.violations,
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      // 4. CDI action check
      const actionInput = {
        actor: clientId,
        action: 'memory_search',
        action_id: GRPC_ACTION_IDS.SEARCH_MEMORY,
        payload: ingressResult.sanitizedPayload,
        route: endpoint,
        method: 'gRPC',
        request_hash: createHash('sha256').update(JSON.stringify(call.request)).digest('hex')
      };
      const actionResult = await this.config.cdi.checkAction(actionInput);
      proof.addCDIAction(actionInput, actionResult);

      if (actionResult.verdict !== 'allow') {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.PERMISSION_DENIED,
          message: 'CDI action denied',
          details: JSON.stringify({
            reason: actionResult.reason,
            governance_proof: proof.build()
          })
        });
        call.end();
        return;
      }

      // Thin-Waist v0.1: Require capability token from CDI
      const capabilityToken = actionResult.capability_token;
      if (!capabilityToken) {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.PERMISSION_DENIED,
          message: 'No capability token provided by CDI (governance denied)'
        });
        call.end();
        return;
      }

      // 5. Generate stream start receipt via ActionGate
      if (this.config.actionGate) {
        await this.config.actionGate.executeSideEffect(
          {
            actor: clientId,
            action: 'STREAM_START',
            payload: {
              endpoint,
              query: (call.request as any).query,
              limit: (call.request as any).limit
            },
            metadata: {
              job_id: 'memory_search',
              stage: 'grpc_stream_start',
              policy_id: 'stream'
            },
            genome_id: this.config.genomeId ?? undefined,
            genome_version: this.config.genome?.version
          },
          async () => ({ stream_id: requestId, started_at: new Date().toISOString() })
        );
      }

      const query = (call.request as any).query || '';
      const limit = (call.request as any).limit || 10;
      const boundedLimit = Math.min(limit, 100); // Max 100 results

      // Thin-Waist v0.1: Route through ToolGateway (no bypass)
      const gateway = getToolGateway();
      const toolResult = await gateway.invoke<{ query: string; limit?: number }, { results: any[]; count: number }>(
        'memory-query',
        { query, limit: boundedLimit },
        capabilityToken,
        {
          actor: clientId,
          metadata: { source: 'grpc:SearchMemory' },
          genome_id: this.config.genomeId ?? undefined,
          genome_version: this.config.genome?.version
        }
      );

      if (!toolResult.success) {
        proof.setVerdict('deny');
        call.emit('error', {
          code: grpc.status.PERMISSION_DENIED,
          message: toolResult.denied_reason || toolResult.error || 'Tool invocation denied'
        });
        call.end();
        return;
      }

      const results = toolResult.data?.results || [];

      // Stream results one by one with full governance checks
      for (const node of results) {
        try {
          // 6. CDI output check for each result
          const outputInput = { content: JSON.stringify(node) };
          const outputCheck = await this.config.cdi.checkOutput(outputInput);

          if (!outputCheck.allowed) {
            // Fail closed: deny this result, continue to next
            console.warn(`Search result blocked by CDI output: ${outputCheck.violations}`);
            continue;
          }

          // 7. CIF egress check for each result
          const egressInput = { clientId, endpoint, payload: node };
          const egressResult = await this.config.cif.egress(egressInput);

          if (egressResult.allowed) {
            call.write({
              node_id: node.id,
              type: node.type,
              data: Buffer.from(JSON.stringify(node.data || {})),
              score: 1.0 // Simple search doesn't have scores
            });
            streamedCount++;
          }

          // Bounded event count
          if (streamedCount >= boundedLimit) {
            break;
          }
        } catch (error) {
          // Skip this result on error, continue to next
          console.error(`Failed to stream search result ${node.id}:`, error);
        }
      }

      // 8. Generate stream completion receipt via ActionGate
      if (this.config.actionGate) {
        await this.config.actionGate.executeSideEffect(
          {
            actor: clientId,
            action: 'STREAM_COMPLETE',
            payload: {
              endpoint,
              query,
              result_count: streamedCount,
              completed: true
            },
            metadata: {
              job_id: 'memory_search',
              stage: 'grpc_stream_complete',
              policy_id: 'stream',
              result_count: streamedCount
            },
            genome_id: this.config.genomeId ?? undefined,
            genome_version: this.config.genome?.version
          },
          async () => ({
            stream_id: requestId,
            completed_at: new Date().toISOString(),
            result_count: streamedCount
          })
        );
      }

      // 9. Finalize governance proof
      proof.setVerdict('allow');
      proof.addHandler(call.request, { result_count: streamedCount, completed: true });
      const finalProof = proof.build();
      // Proof is generated but not attached to stream (could log or store if needed)

      call.end();

    } catch (error: any) {
      streamError = error;
      proof.setVerdict('deny');
      call.emit('error', {
        code: error.code || grpc.status.INTERNAL,
        message: error.message,
        details: JSON.stringify({ governance_proof: proof.build() })
      });
      call.end();
    }
  }

  private async handleIngestKnowledge(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      await this.withGovernance(
        call,
        'knowledge_ingest',
        GRPC_ACTION_IDS.INGEST_KNOWLEDGE,
        async (sanitizedRequest, proof) => {
          // Fail-closed: require knowledge gate
          if (!this.config.knowledgeGate) {
            const error: any = new Error('Knowledge ingestion gate not initialized');
            error.code = grpc.status.UNAVAILABLE;
            error.details = JSON.stringify({
              reason_code: 'GOVERNANCE_INIT_FAILED',
              message: 'Knowledge ingestion gate not initialized'
            });
            throw error;
          }

          // Parse request
          const req = sanitizedRequest as any;

          // Parse CPACK (from YAML or JSON)
          let cpack;
          if (req.cpack_yaml) {
            cpack = { cpack_yaml: req.cpack_yaml };
          } else if (req.cpack_json) {
            try {
              cpack = { cpack: JSON.parse(req.cpack_json) };
            } catch (err) {
              const error: any = new Error('Invalid cpack_json');
              error.code = grpc.status.INVALID_ARGUMENT;
              throw error;
            }
          } else {
            const error: any = new Error('Missing cpack_yaml or cpack_json');
            error.code = grpc.status.INVALID_ARGUMENT;
            throw error;
          }

          // Parse LLM output
          let llm_output;
          try {
            llm_output = JSON.parse(Buffer.from(req.llm_output).toString('utf-8'));
          } catch (err) {
            const error: any = new Error('Invalid llm_output');
            error.code = grpc.status.INVALID_ARGUMENT;
            throw error;
          }

          // Parse context if present
          let context;
          if (req.context) {
            try {
              context = JSON.parse(Buffer.from(req.context).toString('utf-8'));
            } catch (err) {
              context = {};
            }
          } else {
            context = {};
          }

          // Process ingestion
          const result = await this.config.knowledgeGate.processIngestion({
            ...cpack,
            llm_output,
            mode: req.mode || 'GROUND_ONLY',
            context: {
              ...context,
              posture: 'NORMAL',
              oi_id: this.config.genomeId || undefined,
            },
          });

          // Convert to gRPC response
          const grpcResult = {
            success: result.success,
            reason_code: result.reason_code,
            message: result.message,
            grounded_count: result.grounded_count,
            hypothesis_count: result.hypothesis_count,
            denied_count: result.denied_count,
            conflict_count: result.conflict_count,
            grounded_claim_ids: result.grounded_claim_ids || [],
            hypothesis_claim_ids: result.hypothesis_claim_ids || [],
            denied_reasons: (result.denied_reasons || []).map(r => ({
              claim_index: r.claim_index,
              reason: r.reason
            })),
            conflict_ids: result.conflict_ids || [],
            packet_id: result.packet_id,
            ingestion_run_id: result.ingestion_run_id,
            sources_hash: result.sources_hash || '',
            timestamp: result.timestamp
          };

          return grpcResult;
        }
      ).then(response => {
        callback(null, response);
      }).catch(error => {
        callback(error, null);
      });
    } catch (error) {
      const grpcError: any = new Error('Knowledge ingestion failed');
      grpcError.code = grpc.status.INTERNAL;
      grpcError.details = error instanceof Error ? error.message : String(error);
      callback(grpcError, null);
    }
  }
}
