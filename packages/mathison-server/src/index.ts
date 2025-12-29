/**
 * Mathison Server
 * Main entry point for the Mathison OI + graph/hypergraph memory system
 */

import { MemoryGraph } from 'mathison-memory';
import { OIEngine } from 'mathison-oi';
import { GovernanceEngine, CDI, CIF } from 'mathison-governance';
import http from 'http';

export interface MathisonServerConfig {
  port?: number;
  host?: string;
  cdiStrictMode?: boolean;
  cifMaxRequestSize?: number;
  cifMaxResponseSize?: number;
}

export class MathisonServer {
  private memory: MemoryGraph;
  private oi: OIEngine;
  private governance: GovernanceEngine;
  private cdi: CDI;
  private cif: CIF;
  private httpServer?: http.Server;
  private config: Required<MathisonServerConfig>;

  constructor(config: MathisonServerConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      host: config.host ?? '0.0.0.0',
      cdiStrictMode: config.cdiStrictMode ?? true,
      cifMaxRequestSize: config.cifMaxRequestSize ?? 1048576,
      cifMaxResponseSize: config.cifMaxResponseSize ?? 1048576
    };

    this.memory = new MemoryGraph();
    this.oi = new OIEngine();
    this.governance = new GovernanceEngine();
    this.cdi = new CDI({ strictMode: this.config.cdiStrictMode });
    this.cif = new CIF({
      maxRequestSize: this.config.cifMaxRequestSize,
      maxResponseSize: this.config.cifMaxResponseSize
    });
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Mathison Server...');
    console.log(`📍 Governance: Tiriti o te Kai v1.0`);

    // Initialize governance layer first (fail-closed)
    await this.governance.initialize();
    await this.cdi.initialize();
    await this.cif.initialize();

    // Then initialize application layer
    await this.memory.initialize();
    await this.oi.initialize();

    // Start HTTP server
    await this.startHttpServer();

    console.log('✅ Mathison Server started successfully');
    console.log(`🌐 Listening on http://${this.config.host}:${this.config.port}`);
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Mathison Server...');

    // Stop HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }

    // Shutdown in reverse order
    await this.oi.shutdown();
    await this.memory.shutdown();
    await this.cif.shutdown();
    await this.cdi.shutdown();
    await this.governance.shutdown();

    console.log('✅ Mathison Server stopped');
  }

  private async startHttpServer(): Promise<void> {
    this.httpServer = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    return new Promise((resolve) => {
      this.httpServer!.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Route handling
      if (req.url === '/health' && req.method === 'GET') {
        await this.handleHealth(req, res);
      } else if (req.url === '/api/interpret' && req.method === 'POST') {
        await this.handleInterpret(req, res);
      } else if (req.url === '/api/memory/query' && req.method === 'POST') {
        await this.handleMemoryQuery(req, res);
      } else if (req.url === '/api/governance/status' && req.method === 'GET') {
        await this.handleGovernanceStatus(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('Request handler error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private async handleHealth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      treaty: {
        version: this.governance.getTreatyVersion(),
        authority: this.governance.getTreatyAuthority()
      },
      components: {
        governance: 'active',
        cdi: 'active',
        cif: 'active',
        memory: 'active',
        oi: 'active'
      }
    }));
  }

  private async handleInterpret(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const clientId = req.socket.remoteAddress || 'unknown';

    // CIF Ingress
    const ingressResult = await this.cif.ingress({
      clientId,
      endpoint: '/api/interpret',
      payload: body,
      timestamp: Date.now()
    });

    if (!ingressResult.allowed) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Request blocked by CIF',
        violations: ingressResult.violations
      }));
      return;
    }

    // CDI Action Check
    const actionResult = await this.cdi.checkAction({
      actor: clientId,
      action: 'interpret',
      payload: ingressResult.sanitizedPayload
    });

    if (actionResult.verdict !== 'allow') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Action denied by CDI',
        reason: actionResult.reason,
        alternative: actionResult.suggestedAlternative
      }));
      return;
    }

    // Perform interpretation
    const result = await this.oi.interpret({
      input: ingressResult.sanitizedPayload,
      metadata: { clientId }
    });

    // CDI Output Check
    const outputCheck = await this.cdi.checkOutput({
      content: JSON.stringify(result)
    });

    if (!outputCheck.allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Output blocked by CDI',
        violations: outputCheck.violations
      }));
      return;
    }

    // CIF Egress
    const egressResult = await this.cif.egress({
      clientId,
      endpoint: '/api/interpret',
      payload: result
    });

    if (!egressResult.allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Response blocked by CIF',
        violations: egressResult.violations,
        leaks: egressResult.leaksDetected
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(egressResult.sanitizedPayload));
  }

  private async handleMemoryQuery(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const clientId = req.socket.remoteAddress || 'unknown';

    // CIF Ingress
    const ingressResult = await this.cif.ingress({
      clientId,
      endpoint: '/api/memory/query',
      payload: body,
      timestamp: Date.now()
    });

    if (!ingressResult.allowed) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Request blocked by CIF',
        violations: ingressResult.violations
      }));
      return;
    }

    // CDI Action Check
    const actionResult = await this.cdi.checkAction({
      actor: clientId,
      action: 'query_memory',
      payload: ingressResult.sanitizedPayload
    });

    if (actionResult.verdict !== 'allow') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Action denied by CDI',
        reason: actionResult.reason
      }));
      return;
    }

    // Query memory graph
    const queryResult = this.memory.query(ingressResult.sanitizedPayload as any);

    // CIF Egress
    const egressResult = await this.cif.egress({
      clientId,
      endpoint: '/api/memory/query',
      payload: queryResult
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(egressResult.sanitizedPayload));
  }

  private async handleGovernanceStatus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      treaty: {
        version: this.governance.getTreatyVersion(),
        authority: this.governance.getTreatyAuthority(),
        path: './docs/tiriti.md'
      },
      rules: this.governance.getRules().map(r => ({
        id: r.id,
        title: r.title,
        description: r.description
      })),
      cdi: {
        strictMode: this.config.cdiStrictMode
      },
      cif: {
        maxRequestSize: this.config.cifMaxRequestSize,
        maxResponseSize: this.config.cifMaxResponseSize
      }
    }));
  }

  private readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }
}

// CLI entry point
if (require.main === module) {
  const server = new MathisonServer();
  server.start().catch(console.error);

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

export default MathisonServer;
