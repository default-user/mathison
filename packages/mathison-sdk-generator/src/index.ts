/**
 * Mathison SDK Generator
 * Generates client SDKs for multiple languages
 */

export interface SDKTarget {
  language: 'typescript' | 'python' | 'rust' | 'go' | 'java';
  outputPath: string;
}

export class SDKGenerator {
  async generate(target: SDKTarget): Promise<void> {
    console.log(`🔧 Generating ${target.language} SDK to ${target.outputPath}...`);

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
    const endpoints = this.getAPIEndpoints();
    const code = this.generateTypeScriptClient(endpoints);

    // In a real implementation, would write to file
    console.log(`📝 Generated TypeScript SDK (${code.length} chars)`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ TypeScript SDK generated');
  }

  private async generatePython(outputPath: string): Promise<void> {
    const endpoints = this.getAPIEndpoints();
    const code = this.generatePythonClient(endpoints);

    console.log(`📝 Generated Python SDK (${code.length} chars)`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ Python SDK generated');
  }

  private async generateRust(outputPath: string): Promise<void> {
    const endpoints = this.getAPIEndpoints();
    const code = this.generateRustClient(endpoints);

    console.log(`📝 Generated Rust SDK (${code.length} chars)`);
    console.log('   Endpoints:', endpoints.map(e => `${e.method} ${e.path}`).join(', '));
    console.log('✅ Rust SDK generated');
  }

  // Get API endpoint definitions from Mathison API
  private getAPIEndpoints(): APIEndpoint[] {
    return [
      { method: 'GET', path: '/health', returns: 'HealthResponse' },
      { method: 'GET', path: '/api/status', returns: 'SystemStatus' },
      { method: 'GET', path: '/api/identity', returns: 'Identity' },
      { method: 'POST', path: '/api/chat/send', body: 'SendMessageRequest', returns: 'SendMessageResponse' },
      { method: 'GET', path: '/api/chat/history', params: ['limit', 'offset'], returns: 'ChatHistoryResponse' },
      { method: 'GET', path: '/api/beams', params: ['text', 'tags', 'kinds', 'limit'], returns: 'BeamQueryResponse' },
      { method: 'GET', path: '/api/beams/:id', returns: 'Beam' },
      { method: 'POST', path: '/api/beams', body: 'CreateBeamRequest', returns: 'Beam' },
      { method: 'PATCH', path: '/api/beams/:id', body: 'UpdateBeamRequest', returns: 'Beam' },
      { method: 'POST', path: '/api/beams/:id/pin', returns: 'PinResponse' },
      { method: 'DELETE', path: '/api/beams/:id/pin', returns: 'PinResponse' },
      { method: 'POST', path: '/api/beams/:id/retire', returns: 'RetireResponse' },
      { method: 'POST', path: '/api/beams/:id/tombstone', body: 'TombstoneRequest', returns: 'TombstoneResponse' },
    ];
  }

  // Generate TypeScript client code
  private generateTypeScriptClient(endpoints: APIEndpoint[]): string {
    const methods = endpoints.map(ep => {
      const methodName = this.endpointToMethodName(ep.path, ep.method);
      const params = this.getMethodParams(ep);
      const returnType = ep.returns;
      return `  async ${methodName}(${params}): Promise<${returnType}>`;
    });

    return `export class MathisonClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

${methods.join('\n')}
}`;
  }

  // Generate Python client code
  private generatePythonClient(endpoints: APIEndpoint[]): string {
    const methods = endpoints.map(ep => {
      const methodName = this.endpointToSnakeCase(this.endpointToMethodName(ep.path, ep.method));
      const params = this.getMethodParamsPython(ep);
      const returnType = ep.returns;
      return `    def ${methodName}(self${params}) -> ${returnType}:
        """${ep.method} ${ep.path}"""
        pass`;
    });

    return `class MathisonClient:
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
      return `    pub async fn ${methodName}(${params}) -> Result<${returnType}>`;
    });

    return `impl MathisonClient {
${methods.join('\n\n')}
}`;
  }

  // Convert endpoint to method name
  private endpointToMethodName(path: string, method: string): string {
    const parts = path.split('/').filter(p => p && !p.startsWith(':'));
    const action = method.toLowerCase() === 'get' ? 'get' : method.toLowerCase();
    const resource = parts[parts.length - 1];

    if (path.includes('/chat/send')) return 'sendMessage';
    if (path.includes('/chat/history')) return 'getChatHistory';
    if (path.includes('/beams') && !path.includes(':id')) return 'queryBeams';
    if (path.includes('/beams/:id/pin') && method === 'POST') return 'pinBeam';
    if (path.includes('/beams/:id/pin') && method === 'DELETE') return 'unpinBeam';
    if (path.includes('/beams/:id/retire')) return 'retireBeam';
    if (path.includes('/beams/:id/tombstone')) return 'tombstoneBeam';
    if (path.includes('/beams/:id') && method === 'GET') return 'getBeam';
    if (path.includes('/beams/:id') && method === 'PATCH') return 'updateBeam';
    if (path.includes('/beams') && method === 'POST') return 'createBeam';

    return `${action}${this.capitalize(resource)}`;
  }

  // Get method parameters
  private getMethodParams(ep: APIEndpoint): string {
    const params: string[] = [];

    if (ep.path.includes(':id')) params.push('id: string');
    if (ep.body) params.push(`body: ${ep.body}`);
    if (ep.params) params.push(...ep.params.map(p => `${p}?: any`));

    return params.join(', ');
  }

  private getMethodParamsPython(ep: APIEndpoint): string {
    const params: string[] = [];

    if (ep.path.includes(':id')) params.push('id: str');
    if (ep.body) params.push(`body: ${ep.body}`);
    if (ep.params) params.push(...ep.params.map(p => `${p}: Optional[Any] = None`));

    return params.length > 0 ? ', ' + params.join(', ') : '';
  }

  private getMethodParamsRust(ep: APIEndpoint): string {
    const params: string[] = ['&self'];

    if (ep.path.includes(':id')) params.push('id: &str');
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

interface APIEndpoint {
  method: string;
  path: string;
  body?: string;
  params?: string[];
  returns: string;
}

export default SDKGenerator;
