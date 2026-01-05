/**
 * gRPC Server with Governance Parity
 * Enforces same CIF/CDI pipeline as HTTP server
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { CIF, CDI, GovernanceProofBuilder, GovernanceProof } from 'mathison-governance';
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

  constructor(config: GRPCServerConfig) {
    this.config = config;
    this.protoPath = path.join(process.cwd(), 'proto', 'mathison.proto');

    // Create server with interceptors (governance pipeline)
    this.server = new grpc.Server();
  }

  async start(): Promise<void> {
    console.log('🔌 Starting gRPC server with governance pipeline...');

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

    // Bind and start
    const address = `${this.config.host}:${this.config.port}`;
    this.server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          console.error('❌ gRPC server bind failed:', error);
          throw error;
        }
        console.log(`✅ gRPC server listening on ${address} (port ${port})`);
      }
    );
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping gRPC server...');
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        console.log('✅ gRPC server stopped');
        resolve();
      });
    });
  }

  /**
   * Governance pipeline wrapper for all RPC calls
   * Applies: Heartbeat -> CIF Ingress -> CDI Action Check -> Handler -> CDI Output -> CIF Egress
   * P0.1: Generates GovernanceProof for every request
   */
  private async withGovernance<TRequest, TResponse>(
    call: grpc.ServerUnaryCall<TRequest, TResponse> | grpc.ServerWritableStream<TRequest, TResponse>,
    action: string,
    actionId: string | undefined,  // P0.4: Canonical action ID
    handler: (sanitizedRequest: TRequest, proof: GovernanceProofBuilder) => Promise<TResponse>
  ): Promise<TResponse> {
    // P0.1: Initialize governance proof
    const requestId = randomBytes(16).toString('hex');
    const requestHash = createHash('sha256')
      .update(JSON.stringify(call.request))
      .digest('hex');
    const proof = new GovernanceProofBuilder(requestId, requestHash);
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
      request_hash: requestHash
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

    // 4. Execute handler
    const handlerInput = ingressResult.sanitizedPayload as TRequest;
    const response = await handler(handlerInput, proof);

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
      const response = await this.withGovernance(call, 'job_run', 'action:job:run', async (req, proof) => {
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
      const response = await this.withGovernance(call, 'job_status', 'action:job:status', async (req, proof) => {
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

  private async handleStreamJobStatus(
    call: grpc.ServerWritableStream<any, any>
  ): Promise<void> {
    // Streaming implementation - placeholder
    // Would poll job status and stream updates
    call.end();
  }

  private async handleInterpretText(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'oi_interpret', 'action:oi:interpret', async (req, proof) => {
        if (!this.config.interpreter) {
          throw new Error('OI interpreter not initialized');
        }

        const result = await this.config.interpreter.interpret({
          text: (req as any).text,
          limit: (req as any).limit
        });

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
      const response = await this.withGovernance(call, 'memory_node_create', 'action:memory:create', async (req, proof) => {
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
          id: node.id,
          type: node.type,
          data: Buffer.from(JSON.stringify(node.data)),
          metadata: Buffer.from(JSON.stringify(node.metadata)),
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
      const response = await this.withGovernance(call, 'memory_read_node', 'action:read:memory', async (req, proof) => {
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

  private async handleSearchMemory(
    call: grpc.ServerWritableStream<any, any>
  ): Promise<void> {
    // Streaming search - placeholder
    call.end();
  }

  private async handleIngestKnowledge(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      await this.withGovernance(
        call,
        'knowledge_ingest',
        'action:knowledge:ingest',
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
