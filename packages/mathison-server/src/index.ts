/**
 * Mathison Server
 * Main entry point for the Mathison OI + graph/hypergraph memory system
 */

import { MemoryGraph } from 'mathison-memory';
import { OIEngine } from 'mathison-oi';
import { GovernanceEngine } from 'mathison-governance';

export class MathisonServer {
  private memory: MemoryGraph;
  private oi: OIEngine;
  private governance: GovernanceEngine;

  constructor() {
    this.memory = new MemoryGraph();
    this.oi = new OIEngine();
    this.governance = new GovernanceEngine();
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Mathison Server...');
    await this.memory.initialize();
    await this.oi.initialize();
    await this.governance.initialize();
    console.log('✅ Mathison Server started successfully');

    // TODO: Implement server lifecycle management
    // TODO: Add HTTP/gRPC API endpoints
    // TODO: Add WebSocket support for real-time updates
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Mathison Server...');
    await this.governance.shutdown();
    await this.oi.shutdown();
    await this.memory.shutdown();
    console.log('✅ Mathison Server stopped');
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
