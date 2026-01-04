/**
 * Mathison SDK Generator
 * Generates client SDKs from the CANONICAL mathison-server OpenAPI spec
 *
 * Source of truth: mathison-server public API (generateOpenAPISpec)
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateOpenAPISpec, ActionMetadata } from 'mathison-server';

export interface SDKTarget {
  language: 'typescript' | 'python' | 'rust' | 'go' | 'java';
  outputPath: string;
}

export interface APIEndpoint {
  method: string;
  path: string;
  body?: string;
  params?: string[];
  pathParams?: string[];
  returns: string;
  action?: ActionMetadata;
  description?: string;
}

/**
 * Extract endpoints from OpenAPI spec
 */
function extractEndpointsFromOpenAPI(): APIEndpoint[] {
  const spec = generateOpenAPISpec();
  const endpoints: APIEndpoint[] = [];

  for (const [apiPath, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      const endpoint: APIEndpoint = {
        method: method.toUpperCase(),
        path: apiPath,
        returns: extractReturnType(operation),
        action: operation['x-mathison-action'],
        description: operation.summary
      };

      // Extract body type if present
      if (operation.requestBody?.content?.['application/json']?.schema) {
        const schema = operation.requestBody.content['application/json'].schema;
        endpoint.body = extractTypeName(schema);
      }

      // Extract parameters
      if (operation.parameters) {
        endpoint.params = operation.parameters
          .filter((p: any) => p.in === 'query')
          .map((p: any) => p.name);
        endpoint.pathParams = operation.parameters
          .filter((p: any) => p.in === 'path')
          .map((p: any) => p.name);
      }

      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

function extractReturnType(operation: any): string {
  const successResponse = operation.responses?.['200'] || operation.responses?.['201'];
  if (successResponse?.content?.['application/json']?.schema) {
    return extractTypeName(successResponse.content['application/json'].schema);
  }
  return 'void';
}

function extractTypeName(schema: any): string {
  if (schema.$ref) {
    return schema.$ref.split('/').pop() || 'unknown';
  }
  if (schema.type === 'object') {
    return 'object';
  }
  return schema.type || 'unknown';
}

export class SDKGenerator {
  async generate(target: SDKTarget): Promise<void> {
    console.log(`🔧 Generating ${target.language} SDK to ${target.outputPath}...`);
    console.log('   Source: mathison-server OpenAPI (canonical product API)');

    switch (target.language) {
      case 'typescript':
        await this.generateTypeScript(target.outputPath);
        break;
      case 'python':
        await this.generatePython(target.outputPath);
        break;
      case 'rust':
        await this.generateRust(target.outputPath);
        break;
      default:
        throw new Error(`Unsupported language: ${target.language}`);
    }
  }

  private async generateTypeScript(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();
    const code = this.generateTypeScriptClient(endpoints);

    // Ensure directory exists
    const srcPath = path.join(outputPath, 'src');
    fs.mkdirSync(srcPath, { recursive: true });

    // Write the client file
    const clientPath = path.join(srcPath, 'index.ts');
    fs.writeFileSync(clientPath, code, 'utf-8');

    console.log(`📝 Generated TypeScript SDK (${code.length} chars)`);
    console.log(`   Output: ${clientPath}`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ TypeScript SDK generated from OpenAPI');
  }

  private async generatePython(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();

    // Write a stub README for Python
    fs.mkdirSync(outputPath, { recursive: true });
    const readmePath = path.join(outputPath, 'README.md');
    const readme = `# Mathison Python SDK

**Status:** Not yet implemented

This SDK will be generated from the mathison-server OpenAPI spec.
See \`packages/mathison-sdk-generator\` for the generator.

## Planned Endpoints

${endpoints.map(e => `- \`${e.method} ${e.path}\` - ${e.description || 'No description'}`).join('\n')}
`;
    fs.writeFileSync(readmePath, readme, 'utf-8');

    console.log(`📝 Generated Python SDK stub`);
    console.log(`   Output: ${readmePath}`);
    console.log('✅ Python SDK stub generated');
  }

  private async generateRust(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();

    // Write a stub README for Rust
    fs.mkdirSync(outputPath, { recursive: true });
    const readmePath = path.join(outputPath, 'README.md');
    const readme = `# Mathison Rust SDK

**Status:** Not yet implemented

This SDK will be generated from the mathison-server OpenAPI spec.
See \`packages/mathison-sdk-generator\` for the generator.

## Planned Endpoints

${endpoints.map(e => `- \`${e.method} ${e.path}\` - ${e.description || 'No description'}`).join('\n')}
`;
    fs.writeFileSync(readmePath, readme, 'utf-8');

    console.log(`📝 Generated Rust SDK stub`);
    console.log(`   Output: ${readmePath}`);
    console.log('✅ Rust SDK stub generated');
  }

  // Generate TypeScript client code - DETERMINISTIC output (sorted endpoints)
  private generateTypeScriptClient(endpoints: APIEndpoint[]): string {
    // Sort endpoints for deterministic output
    const sortedEndpoints = [...endpoints].sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.method.localeCompare(b.method);
    });

    const methods = sortedEndpoints.map(ep => {
      const methodName = this.endpointToMethodName(ep.path, ep.method);
      const params = this.getMethodParams(ep);
      const returnType = this.mapReturnType(ep.returns);
      const actionComment = ep.action ? `  // Action: ${ep.action.action} (${ep.action.riskClass})` : '';
      const descComment = ep.description ? `  // ${ep.description}` : '';
      const impl = this.generateMethodImpl(ep);

      return `${descComment}
${actionComment}
  async ${methodName}(${params}): Promise<${returnType}> {
${impl}
  }`;
    });

    return `/**
 * Mathison TypeScript SDK
 * Generated from mathison-server OpenAPI (canonical product API)
 *
 * IMPORTANT: This client targets mathison-server (port 3000), NOT kernel-mac.
 */

export interface MathisonClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  bootStatus: 'booting' | 'ready' | 'failed';
  governance: {
    treaty: { version: string; authority: string };
    genome: { name: string; version: string; genome_id: string; initialized: boolean };
  };
}

export interface GenomeMetadata {
  genome_id: string;
  name: string;
  version: string;
  parents: string[];
  created_at: string;
  invariants: Array<{ id: string; severity: string; testable_claim: string }>;
  capabilities: Array<{ cap_id: string; risk_class: string; allow_count: number; deny_count: number }>;
}

export interface JobRunRequest {
  jobType: string;
  inputs?: Record<string, unknown>;
  policyId?: string;
  jobId?: string;
}

export interface JobResult {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'suspended';
  outputs?: Record<string, unknown>;
  genome_id?: string;
  genome_version?: string;
}

export interface JobLogsResponse {
  job_id: string;
  count: number;
  receipts: Receipt[];
}

export interface Receipt {
  timestamp: string;
  job_id: string;
  stage: string;
  action: string;
  decision: 'ALLOW' | 'DENY';
  policy_id?: string;
  genome_id?: string;
  genome_version?: string;
}

export interface Node {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateNodeRequest {
  idempotency_key: string;
  id?: string;
  type: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateEdgeRequest {
  idempotency_key: string;
  from: string;
  to: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface CreateHyperedgeRequest {
  idempotency_key: string;
  id?: string;
  nodes: string[];
  type: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  limit: number;
  count: number;
  results: Node[];
}

export interface InterpretRequest {
  text: string;
  limit?: number;
}

export interface InterpretResponse {
  interpretation: string;
  confidence: number;
  citations: Array<{ node_id: string; why: string }>;
  genome: { id: string; version: string };
}

export class MathisonClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(options: MathisonClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = \`Bearer \${this.apiKey}\`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
        throw new Error(error.error || \`HTTP \${response.status}: \${response.statusText}\`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

${methods.join('\n\n')}
}

export default MathisonClient;
`;
  }

  private generateMethodImpl(ep: APIEndpoint): string {
    const pathWithParams = ep.path.replace(/\{(\w+)\}/g, '${$1}');
    const hasPathParams = ep.path.includes('{');
    const pathExpr = hasPathParams ? `\`${pathWithParams}\`` : `'${ep.path}'`;

    if (ep.method === 'GET') {
      if (ep.params && ep.params.length > 0) {
        const queryObj = ep.params.map(p => `${p}`).join(', ');
        return `    return this.request('GET', ${pathExpr}, undefined, { ${queryObj} });`;
      }
      return `    return this.request('GET', ${pathExpr});`;
    } else if (ep.method === 'POST') {
      if (ep.body) {
        return `    return this.request('POST', ${pathExpr}, body);`;
      }
      return `    return this.request('POST', ${pathExpr});`;
    }
    return `    return this.request('${ep.method}', ${pathExpr});`;
  }

  // Convert endpoint to method name (for mathison-server routes)
  private endpointToMethodName(apiPath: string, method: string): string {
    // Mathison-server specific mappings
    if (apiPath === '/health') return 'getHealth';
    if (apiPath === '/openapi.json') return 'getOpenAPI';
    if (apiPath === '/genome') return 'getGenome';

    // Jobs
    if (apiPath === '/jobs/run') return 'runJob';
    if (apiPath === '/jobs/status') return 'getJobStatus';
    if (apiPath === '/jobs/resume') return 'resumeJob';
    if (apiPath === '/jobs/logs') return 'getJobLogs';

    // Memory
    if (apiPath === '/memory/nodes' && method === 'POST') return 'createNode';
    if (apiPath === '/memory/nodes/{id}' && method === 'GET') return 'getNode';
    if (apiPath === '/memory/nodes/{id}' && method === 'POST') return 'updateNode';
    if (apiPath === '/memory/nodes/{id}/edges') return 'getNodeEdges';
    if (apiPath === '/memory/nodes/{id}/hyperedges') return 'getNodeHyperedges';
    if (apiPath === '/memory/edges' && method === 'POST') return 'createEdge';
    if (apiPath === '/memory/edges/{id}') return 'getEdge';
    if (apiPath === '/memory/hyperedges' && method === 'POST') return 'createHyperedge';
    if (apiPath === '/memory/hyperedges/{id}') return 'getHyperedge';
    if (apiPath === '/memory/search') return 'searchNodes';

    // OI
    if (apiPath === '/oi/interpret') return 'interpret';

    // Fallback
    const parts = apiPath.split('/').filter(p => p && !p.startsWith('{'));
    const resource = parts[parts.length - 1];
    const action = method.toLowerCase() === 'get' ? 'get' : method.toLowerCase();
    return `${action}${this.capitalize(resource)}`;
  }

  // Get method parameters
  private getMethodParams(ep: APIEndpoint): string {
    const params: string[] = [];

    if (ep.pathParams && ep.pathParams.length > 0) {
      params.push(...ep.pathParams.map(p => `${p}: string`));
    }
    if (ep.body) {
      params.push(`body: ${this.mapBodyType(ep)}`);
    }
    if (ep.params && ep.params.length > 0) {
      params.push(...ep.params.map(p => `${p}?: string`));
    }

    return params.join(', ');
  }

  private mapBodyType(ep: APIEndpoint): string {
    if (ep.path === '/jobs/run') return 'JobRunRequest';
    if (ep.path === '/jobs/resume') return '{ job_id: string }';
    if (ep.path === '/memory/nodes' && ep.method === 'POST') return 'CreateNodeRequest';
    if (ep.path.startsWith('/memory/nodes/') && ep.method === 'POST') return 'Partial<CreateNodeRequest>';
    if (ep.path === '/memory/edges') return 'CreateEdgeRequest';
    if (ep.path === '/memory/hyperedges') return 'CreateHyperedgeRequest';
    if (ep.path === '/oi/interpret') return 'InterpretRequest';
    return 'unknown';
  }

  private mapReturnType(returnType: string): string {
    if (returnType === 'HealthResponse') return 'HealthResponse';
    if (returnType === 'GenomeMetadata') return 'GenomeMetadata';
    if (returnType === 'JobResult') return 'JobResult';
    if (returnType === 'Node') return 'Node';
    if (returnType === 'CreateNodeResponse') return '{ node: Node; created: boolean }';
    if (returnType === 'NodeUpdateResponse') return '{ node: Node; updated: boolean }';
    if (returnType === 'SearchResponse') return 'SearchResponse';
    if (returnType === 'InterpretResponse') return 'InterpretResponse';
    if (returnType === 'void') return 'void';
    return 'unknown';
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

export default SDKGenerator;
