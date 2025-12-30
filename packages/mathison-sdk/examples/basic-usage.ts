/**
 * Mathison SDK - Basic Usage Example
 *
 * This example demonstrates how to use the Mathison SDK to interact
 * with a Mathison server for memory graph operations.
 */

import { MathisonClient, GovernanceError } from '../src';

async function main() {
  // Initialize the client
  const client = new MathisonClient({
    baseURL: process.env.MATHISON_URL || 'http://localhost:3000',
    timeout: 30000
  });

  console.log('🚀 Mathison SDK Example\n');

  // 1. Check server health
  console.log('1. Checking server health...');
  try {
    const health = await client.health();
    console.log('   ✓ Server status:', health.status);
    console.log('   ✓ Boot status:', health.bootStatus);
    if (health.governance) {
      console.log('   ✓ Treaty version:', health.governance.treaty.version);
      console.log('   ✓ Treaty authority:', health.governance.treaty.authority);
    }
  } catch (error) {
    console.error('   ✗ Health check failed:', error);
    process.exit(1);
  }

  // 2. Wait for server to be ready
  console.log('\n2. Waiting for server to be ready...');
  const ready = await client.isReady();
  if (!ready) {
    console.error('   ✗ Server is not ready');
    process.exit(1);
  }
  console.log('   ✓ Server is ready');

  // 3. Create a concept node
  console.log('\n3. Creating concept nodes...');
  try {
    const tsNode = await client.createNode({
      idempotency_key: MathisonClient.generateIdempotencyKey(),
      type: 'concept',
      data: {
        name: 'TypeScript',
        description: 'A typed superset of JavaScript'
      }
    });
    console.log('   ✓ Created node:', tsNode.node.id);
    console.log('   ✓ Created:', tsNode.created);
    if (tsNode.receipt) {
      console.log('   ✓ Receipt ID:', tsNode.receipt.receipt_id);
    }

    const jsNode = await client.createNode({
      idempotency_key: MathisonClient.generateIdempotencyKey(),
      type: 'concept',
      data: {
        name: 'JavaScript',
        description: 'A dynamic programming language'
      }
    });
    console.log('   ✓ Created node:', jsNode.node.id);

    // 4. Create an edge between nodes
    console.log('\n4. Creating edge between nodes...');
    const edge = await client.createEdge({
      idempotency_key: MathisonClient.generateIdempotencyKey(),
      from: tsNode.node.id,
      to: jsNode.node.id,
      type: 'extends',
      metadata: {
        relationship: 'TypeScript extends JavaScript'
      }
    });
    console.log('   ✓ Created edge:', edge.edge.id);
    console.log('   ✓ From:', edge.edge.source);
    console.log('   ✓ To:', edge.edge.target);

    // 5. Retrieve node
    console.log('\n5. Retrieving node...');
    const retrievedNode = await client.getNode(tsNode.node.id);
    console.log('   ✓ Node type:', retrievedNode.type);
    console.log('   ✓ Node data:', JSON.stringify(retrievedNode.data, null, 2));

    // 6. Get node edges
    console.log('\n6. Getting node edges...');
    const edges = await client.getNodeEdges(tsNode.node.id);
    console.log('   ✓ Edge count:', edges.count);
    edges.edges.forEach((e) => {
      console.log(`   ✓ Edge: ${e.source} --[${e.type}]--> ${e.target}`);
    });

    // 7. Search nodes
    console.log('\n7. Searching for "TypeScript"...');
    const results = await client.searchNodes('TypeScript', 10);
    console.log('   ✓ Found:', results.count, 'results');
    results.results.forEach((node) => {
      console.log(`   ✓ ${node.id}: ${node.data.name}`);
    });

    // 8. Test idempotency
    console.log('\n8. Testing idempotency...');
    const idempotencyKey = MathisonClient.generateIdempotencyKey();
    const node1 = await client.createNode({
      idempotency_key: idempotencyKey,
      type: 'test',
      data: { value: 'same' }
    });
    console.log('   ✓ First create:', node1.node.id, '(created:', node1.created, ')');

    // Same idempotency key should return existing node
    const node2 = await client.createNode({
      idempotency_key: idempotencyKey,
      type: 'test',
      data: { value: 'same' }
    });
    console.log('   ✓ Second create:', node2.node.id, '(created:', node2.created, ')');
    console.log('   ✓ IDs match:', node1.node.id === node2.node.id);

  } catch (error) {
    if ((error as any).name === 'GovernanceError') {
      const govError = error as GovernanceError;
      console.error('\n❌ Governance Error:');
      console.error('   Reason:', govError.reasonCode);
      console.error('   Message:', govError.message);
      if (govError.violations) {
        console.error('   Violations:', govError.violations);
      }
    } else {
      console.error('\n❌ Error:', error);
    }
    process.exit(1);
  }

  console.log('\n✅ Example completed successfully!');
}

// Run the example
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
