/**
 * gRPC Server with Governance Parity
 * Enforces same CIF/CDI pipeline as HTTP server
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { CIF, CDI } from 'mathison-governance';
import { ActionGate } from '../action-gate';
import { MemoryGraph } from 'mathison-memory';
import { Interpreter } from 'mathison-oi';
import { JobExecutor } from '../job-executor';
import { Genome } from 'mathison-genome';
import { createCIFIngressInterceptor, createCIFEgressInterceptor } from './interceptors/cif-interceptor';
import { createCDIInterceptor } from './interceptors/cdi-interceptor';
import { createHeartbeatInterceptor } from './interceptors/heartbeat-interceptor';
import { HeartbeatMonitor } from '../heartbeat';

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
      SearchMemory: this.handleSearchMemory.bind(this)
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
   */
  private async withGovernance<TRequest, TResponse>(
    call: grpc.ServerUnaryCall<TRequest, TResponse> | grpc.ServerWritableStream<TRequest, TResponse>,
    action: string,
    handler: (sanitizedRequest: TRequest) => Promise<TResponse>
  ): Promise<TResponse> {
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
    const ingressResult = await this.config.cif.ingress({
      clientId,
      endpoint: (call as any).handler?.path || 'unknown',
      payload: call.request,
      headers: call.metadata.getMap() as Record<string, string>,
      timestamp: Date.now()
    });

    if (!ingressResult.allowed) {
      const error: any = new Error('CIF ingress blocked');
      error.code = grpc.status.INVALID_ARGUMENT;
      error.details = JSON.stringify({
        reason_code: 'CIF_INGRESS_BLOCKED',
        violations: ingressResult.violations
      });
      throw error;
    }

    // 3. CDI Action Check
    const actionResult = await this.config.cdi.checkAction({
      actor: clientId,
      action,
      payload: ingressResult.sanitizedPayload
    });

    if (actionResult.verdict !== 'allow') {
      const error: any = new Error('CDI action denied');
      error.code = grpc.status.PERMISSION_DENIED;
      error.details = JSON.stringify({
        reason_code: 'CDI_ACTION_DENIED',
        reason: actionResult.reason
      });
      throw error;
    }

    // 4. Execute handler
    const response = await handler(ingressResult.sanitizedPayload as TRequest);

    // 5. CDI Output Check
    const outputCheck = await this.config.cdi.checkOutput({
      content: JSON.stringify(response)
    });

    if (!outputCheck.allowed) {
      const error: any = new Error('CDI output blocked');
      error.code = grpc.status.PERMISSION_DENIED;
      error.details = JSON.stringify({
        reason_code: 'CDI_OUTPUT_BLOCKED',
        violations: outputCheck.violations
      });
      throw error;
    }

    // 6. CIF Egress
    const egressResult = await this.config.cif.egress({
      clientId,
      endpoint: (call as any).handler?.path || 'unknown',
      payload: response
    });

    if (!egressResult.allowed) {
      const error: any = new Error('CIF egress blocked');
      error.code = grpc.status.PERMISSION_DENIED;
      error.details = JSON.stringify({
        reason_code: 'CIF_EGRESS_BLOCKED',
        violations: egressResult.violations
      });
      throw error;
    }

    return egressResult.sanitizedPayload as TResponse;
  }

  private async handleRunJob(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'job_run', async (req) => {
        if (!this.config.jobExecutor) {
          throw new Error('Job executor not initialized');
        }

        const result = await this.config.jobExecutor.runJob(
          call.getPeer(),
          {
            jobType: (req as any).job_type || 'default',
            inputs: (req as any).inputs ? JSON.parse(Buffer.from((req as any).inputs).toString()) : {},
            policyId: (req as any).policy_id,
            jobId: (req as any).job_id
          },
          this.config.genomeId ?? undefined,
          this.config.genome?.version
        );

        return {
          job_id: result.job_id,
          status: result.status,
          outputs: Buffer.from(JSON.stringify(result.outputs || {})),
          receipt_id: ''  // Receipt ID not in JobResult type
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
      const response = await this.withGovernance(call, 'job_status', async (req) => {
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
      const response = await this.withGovernance(call, 'oi_interpret', async (req) => {
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
    // Placeholder - would integrate with ActionGate like HTTP endpoint
    callback({
      code: grpc.status.UNIMPLEMENTED,
      message: 'CreateMemoryNode not yet implemented'
    }, null);
  }

  private async handleReadMemoryNode(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      const response = await this.withGovernance(call, 'memory_read_node', async (req) => {
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
}
