/**
 * Doctor command - Check storage backend readiness
 * P2-B: Verify backend configuration and health
 */

import { loadStorageConfig, createCheckpointStore, createReceiptStore, StorageConfigError } from 'mathison-storage';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function doctorCommand(): Promise<void> {
  console.log('🏥 Mathison Doctor - Storage Backend Check\n');

  let allChecks = true;

  // 1. Check storage configuration
  console.log('📋 Configuration Check:');
  try {
    const config = loadStorageConfig();
    console.log(`  ✅ Backend: ${config.backend}`);
    console.log(`  ✅ Path: ${config.path}`);
  } catch (error) {
    if (error instanceof StorageConfigError) {
      console.log(`  ❌ Configuration Error: ${error.message}`);
      console.log(`     Error Code: ${error.code}`);
      allChecks = false;
    } else {
      throw error;
    }
    console.log('');
    console.log('💡 Set environment variables:');
    console.log('   MATHISON_STORE_BACKEND=FILE or SQLITE');
    console.log('   MATHISON_STORE_PATH=<path-to-storage>');
    console.log('');
    process.exit(1);
  }

  const config = loadStorageConfig();
  console.log('');

  // 2. Check backend-specific requirements
  console.log('🔧 Backend-Specific Checks:');

  if (config.backend === 'FILE') {
    // Check if directory exists or can be created
    const checkpointDir = config.path;
    try {
      await fs.mkdir(checkpointDir, { recursive: true });
      console.log(`  ✅ Checkpoint directory accessible: ${checkpointDir}`);

      // Check write permissions
      const testFile = path.join(checkpointDir, '.mathison-doctor-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      console.log(`  ✅ Write permissions verified`);
    } catch (error: any) {
      console.log(`  ❌ Directory check failed: ${error.message}`);
      allChecks = false;
    }
  } else if (config.backend === 'SQLITE') {
    // Check if database can be opened and has correct pragmas
    try {
      const Database = require('better-sqlite3');
      const db = new Database(config.path);

      // Check WAL mode
      const walMode = db.pragma('journal_mode', { simple: true });
      if (walMode === 'wal') {
        console.log(`  ✅ WAL mode enabled`);
      } else {
        console.log(`  ⚠️  WAL mode not enabled (current: ${walMode})`);
      }

      // Check busy_timeout
      const busyTimeout = db.pragma('busy_timeout', { simple: true });
      console.log(`  ✅ Busy timeout: ${busyTimeout}ms`);

      // Check tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all() as Array<{ name: string }>;

      const hasCheckpoints = tables.some(t => t.name === 'checkpoints');
      const hasReceipts = tables.some(t => t.name === 'receipts');

      if (hasCheckpoints) {
        console.log(`  ✅ Checkpoints table exists`);
      } else {
        console.log(`  ⚠️  Checkpoints table does not exist (will be created on first use)`);
      }

      if (hasReceipts) {
        console.log(`  ✅ Receipts table exists`);

        // Check for append-only triggers
        const triggers = db.prepare(`
          SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='receipts'
        `).all() as Array<{ name: string }>;

        const hasUpdateTrigger = triggers.some(t => t.name === 'prevent_receipt_update');
        const hasDeleteTrigger = triggers.some(t => t.name === 'prevent_receipt_delete');

        if (hasUpdateTrigger && hasDeleteTrigger) {
          console.log(`  ✅ Append-only triggers enabled`);
        } else {
          console.log(`  ⚠️  Append-only triggers missing (will be created on first use)`);
        }
      } else {
        console.log(`  ⚠️  Receipts table does not exist (will be created on first use)`);
      }

      db.close();
    } catch (error: any) {
      console.log(`  ❌ SQLite check failed: ${error.message}`);
      allChecks = false;
    }
  }

  console.log('');

  // 3. Test store initialization
  console.log('🔌 Store Initialization Test:');
  try {
    const checkpointStore = createCheckpointStore(config);
    const receiptStore = createReceiptStore(config);

    await checkpointStore.initialize();
    await receiptStore.initialize();

    console.log('  ✅ CheckpointStore initialized successfully');
    console.log('  ✅ ReceiptStore initialized successfully');

    await checkpointStore.shutdown();
    await receiptStore.shutdown();
  } catch (error: any) {
    console.log(`  ❌ Store initialization failed: ${error.message}`);
    allChecks = false;
  }

  console.log('');

  // 4. Summary
  if (allChecks) {
    console.log('✅ All checks passed! Storage backend is ready.');
  } else {
    console.log('⚠️  Some checks failed. Please review the errors above.');
    process.exit(1);
  }
}
