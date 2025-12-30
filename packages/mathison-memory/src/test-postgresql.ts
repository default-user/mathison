/**
 * PostgreSQL Backend Integration Test
 * Verifies persistence, CRUD operations, and search functionality
 */

import { MemoryGraph, Node, Edge, Hyperedge } from './index';
import { PostgreSQLBackend } from './backends/postgresql';
import { MigrationRunner } from './migrations/runner';

const DB_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'mathison',
  user: process.env.PGUSER || 'mathison',
  password: process.env.PGPASSWORD || 'mathison_dev'
};

async function testPostgreSQLBackend() {
  console.log('🧪 Testing PostgreSQL backend...\n');

  // Step 1: Run migrations
  console.log('📊 Running migrations...');
  const runner = new MigrationRunner(DB_CONFIG);
  await runner.initialize();
  await runner.runMigrations(__dirname + '/../migrations');
  await runner.shutdown();
  console.log('✓ Migrations complete\n');

  // Step 2: Initialize backend
  console.log('🔌 Initializing PostgreSQL backend...');
  const backend = new PostgreSQLBackend(DB_CONFIG);
  await backend.initialize();
  const memoryGraph = new MemoryGraph(backend);
  await memoryGraph.initialize();
  console.log('✓ Backend initialized\n');

  try {
    // Step 3: Test node operations
    console.log('📝 Testing node operations...');

    const node1: Node = {
      id: 'test-node-1',
      type: 'concept',
      data: {
        name: 'Artificial Intelligence',
        description: 'Study of intelligent agents',
        tags: ['AI', 'machine learning', 'cognitive science']
      },
      metadata: { confidence: 0.95 }
    };

    const node2: Node = {
      id: 'test-node-2',
      type: 'concept',
      data: {
        name: 'Machine Learning',
        description: 'Subset of AI focused on learning from data'
      }
    };

    await backend.addNode(node1);
    await backend.addNode(node2);
    console.log('  ✓ Added 2 nodes');

    const retrieved = await backend.getNode('test-node-1');
    if (!retrieved || retrieved.id !== 'test-node-1') {
      throw new Error('Node retrieval failed');
    }
    console.log('  ✓ Retrieved node by ID');

    const allNodes = await backend.getAllNodes();
    if (allNodes.length < 2) {
      throw new Error(`Expected at least 2 nodes, got ${allNodes.length}`);
    }
    console.log(`  ✓ Retrieved all nodes (${allNodes.length} total)`);

    // Step 4: Test edge operations
    console.log('\n🔗 Testing edge operations...');

    const edge1: Edge = {
      id: 'test-edge-1',
      source: 'test-node-1',
      target: 'test-node-2',
      type: 'contains',
      metadata: { strength: 0.8 }
    };

    await backend.addEdge(edge1);
    console.log('  ✓ Added edge');

    const nodeEdges = await backend.getNodeEdges('test-node-1');
    if (nodeEdges.length === 0) {
      throw new Error('Edge retrieval failed');
    }
    console.log(`  ✓ Retrieved node edges (${nodeEdges.length} found)`);

    // Step 5: Test hyperedge operations
    console.log('\n🕸️  Testing hyperedge operations...');

    const hyperedge1: Hyperedge = {
      id: 'test-hyperedge-1',
      nodes: ['test-node-1', 'test-node-2'],
      type: 'semantic-cluster',
      metadata: { theme: 'AI/ML' }
    };

    await backend.addHyperedge(hyperedge1);
    console.log('  ✓ Added hyperedge');

    const retrievedHyperedge = await backend.getHyperedge('test-hyperedge-1');
    if (!retrievedHyperedge || retrievedHyperedge.nodes.length !== 2) {
      throw new Error('Hyperedge retrieval failed');
    }
    console.log('  ✓ Retrieved hyperedge');

    // Step 6: Test search
    console.log('\n🔍 Testing search functionality...');

    const searchResults = await backend.search('machine learning', 10);
    if (searchResults.length === 0) {
      throw new Error('Search returned no results');
    }
    console.log(`  ✓ Search found ${searchResults.length} result(s)`);
    console.log(`    → "${searchResults[0].data.name}"`);

    // Step 7: Test persistence (reconnect)
    console.log('\n💾 Testing persistence...');
    await memoryGraph.shutdown();
    await backend.shutdown();
    console.log('  ✓ Closed connection');

    const backend2 = new PostgreSQLBackend(DB_CONFIG);
    await backend2.initialize();
    const persistedNode = await backend2.getNode('test-node-1');
    if (!persistedNode || persistedNode.data.name !== 'Artificial Intelligence') {
      throw new Error('Persistence verification failed');
    }
    console.log('  ✓ Data persisted across reconnection');

    // Cleanup
    await backend2.deleteNode('test-node-1');
    await backend2.deleteNode('test-node-2');
    await backend2.shutdown();
    console.log('  ✓ Cleanup complete');

    console.log('\n✅ All PostgreSQL tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await memoryGraph.shutdown();
    await backend.shutdown();
    process.exit(1);
  }
}

// Run tests
testPostgreSQLBackend();
