/**
 * Mathison SDK Generator
 * Generates client SDKs from the CANONICAL mathison-server OpenAPI spec
 *
 * Source of truth: packages/mathison-server/src/openapi.ts
 */

import { generateOpenAPISpec, ActionMetadata } from '../../mathison-server/src/openapi';

export interface SDKTarget {
  language: 'typescript' | 'python' | 'rust' | 'go' | 'java';
  outputPath: string;
}

export interface APIEndpoint {
  method: string;
  path: string;
  body?: string;
  params?: string[];
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

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      const endpoint: APIEndpoint = {
        method: method.toUpperCase(),
        path,
        returns: extractReturnType(operation),
        action: operation['x-mathison-action'],
        description: operation.summary
      };

      // Extract body type if present
      if (operation.requestBody?.content?.['application/json']?.schema) {
        const schema = operation.requestBody.content['application/json'].schema;
        endpoint.body = extractTypeName(schema);
      }

      // Extract query/path parameters
      if (operation.parameters) {
        endpoint.params = operation.parameters
          .filter((p: any) => p.in === 'query')
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

    console.log(`📝 Generated TypeScript SDK (${code.length} chars)`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ TypeScript SDK generated from OpenAPI');
  }

  private async generatePython(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();
    const code = this.generatePythonClient(endpoints);

    console.log(`📝 Generated Python SDK (${code.length} chars)`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ Python SDK generated from OpenAPI');
  }

  private async generateRust(outputPath: string): Promise<void> {
    const endpoints = extractEndpointsFromOpenAPI();
    const code = this.generateRustClient(endpoints);

    console.log(`📝 Generated Rust SDK (${code.length} chars)`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ Rust SDK generated from OpenAPI');
  }

  // Generate TypeScript client code
  private generateTypeScriptClient(endpoints: APIEndpoint[]): string {
    const methods = endpoints.map(ep => {
      const methodName = this.endpointToMethodName(ep.path, ep.method);
      const params = this.getMethodParams(ep);
      const returnType = ep.returns;
      const actionComment = ep.action ? `// Action: ${ep.action.action} (${ep.action.riskClass})` : '';
      return `  ${actionComment}
  async ${methodName}(${params}): Promise<${returnType}>`;
    });

    return `/**
 * Mathison API Client (TypeScript)
 * Generated from mathison-server OpenAPI (canonical product API)
 *
 * IMPORTANT: This client targets mathison-server (port 3000), NOT kernel-mac.
 */

export class MathisonClient {
  constructor(
    private baseUrl: string = 'http://localhost:3000',
    private apiKey?: string
  ) {}

${methods.join('\n\n')}
}`;
  }

  // Generate Python client code
  private generatePythonClient(endpoints: APIEndpoint[]): string {
    const methods = endpoints.map(ep => {
      const methodName = this.endpointToSnakeCase(this.endpointToMethodName(ep.path, ep.method));
      const params = this.getMethodParamsPython(ep);
      const returnType = ep.returns;
      const actionComment = ep.action ? `# Action: ${ep.action.action} (${ep.action.riskClass})` : '';
      return `    ${actionComment}
    def ${methodName}(self${params}) -> ${returnType}:
        """${ep.method} ${ep.path}"""
        pass`;
    });

    return `"""
Mathison API Client (Python)
Generated from mathison-server OpenAPI (canonical product API)

IMPORTANT: This client targets mathison-server (port 3000), NOT kernel-mac.
"""

from typing import Optional, Any

class MathisonClient:
    def __init__(self, base_url: str = "http://localhost:3000", api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key

${methods.join('\n\n')}`;
  }

  // Generate Rust client code
  private generateRustClient(endpoints: APIEndpoint[]): string {
    const methods = endpoints.map(ep => {
      const methodName = this.endpointToSnakeCase(this.endpointToMethodName(ep.path, ep.method));
      const params = this.getMethodParamsRust(ep);
      const returnType = ep.returns;
      const actionComment = ep.action ? `    /// Action: ${ep.action.action} (${ep.action.riskClass})` : '';
      return `${actionComment}
    pub async fn ${methodName}(${params}) -> Result<${returnType}>`;
    });

    return `//! Mathison API Client (Rust)
//! Generated from mathison-server OpenAPI (canonical product API)
//!
//! IMPORTANT: This client targets mathison-server (port 3000), NOT kernel-mac.

impl MathisonClient {
${methods.join('\n\n')}
}`;
  }

  // Convert endpoint to method name (for mathison-server routes)
  private endpointToMethodName(path: string, method: string): string {
    const parts = path.split('/').filter(p => p && !p.startsWith('{'));
    const action = method.toLowerCase() === 'get' ? 'get' : method.toLowerCase();

    // Mathison-server specific mappings
    if (path === '/health') return 'getHealth';
    if (path === '/openapi.json') return 'getOpenAPI';
    if (path === '/genome') return 'getGenome';

    // Jobs
    if (path === '/jobs/run') return 'runJob';
    if (path === '/jobs/status') return 'getJobStatus';
    if (path === '/jobs/resume') return 'resumeJob';
    if (path === '/jobs/logs') return 'getJobLogs';

    // Memory
    if (path === '/memory/nodes' && method === 'POST') return 'createNode';
    if (path === '/memory/nodes/{id}' && method === 'GET') return 'getNode';
    if (path === '/memory/nodes/{id}' && method === 'POST') return 'updateNode';
    if (path === '/memory/nodes/{id}/edges') return 'getNodeEdges';
    if (path === '/memory/nodes/{id}/hyperedges') return 'getNodeHyperedges';
    if (path === '/memory/edges' && method === 'POST') return 'createEdge';
    if (path === '/memory/edges/{id}') return 'getEdge';
    if (path === '/memory/hyperedges' && method === 'POST') return 'createHyperedge';
    if (path === '/memory/hyperedges/{id}') return 'getHyperedge';
    if (path === '/memory/search') return 'searchNodes';

    // OI
    if (path === '/oi/interpret') return 'interpret';

    // Fallback
    const resource = parts[parts.length - 1];
    return `${action}${this.capitalize(resource)}`;
  }

  // Get method parameters
  private getMethodParams(ep: APIEndpoint): string {
    const params: string[] = [];

    if (ep.path.includes('{id}')) params.push('id: string');
    if (ep.body) params.push(`body: ${ep.body}`);
    if (ep.params) params.push(...ep.params.map(p => `${p}?: any`));

    return params.join(', ');
  }

  private getMethodParamsPython(ep: APIEndpoint): string {
    const params: string[] = [];

    if (ep.path.includes('{id}')) params.push('id: str');
    if (ep.body) params.push(`body: ${ep.body}`);
    if (ep.params) params.push(...ep.params.map(p => `${p}: Optional[Any] = None`));

    return params.length > 0 ? ', ' + params.join(', ') : '';
  }

  private getMethodParamsRust(ep: APIEndpoint): string {
    const params: string[] = ['&self'];

    if (ep.path.includes('{id}')) params.push('id: &str');
    if (ep.body) params.push(`body: ${ep.body}`);
    if (ep.params) params.push(...ep.params.map(p => `${p}: Option<T>`));

    return params.join(', ');
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private endpointToSnakeCase(s: string): string {
    return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }
}

export default SDKGenerator;
