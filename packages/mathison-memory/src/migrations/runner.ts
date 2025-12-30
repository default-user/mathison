/**
 * Database Migration Runner
 * Applies SQL migrations to PostgreSQL
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Pool } from 'pg';

export interface MigrationConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export class MigrationRunner {
  private pool: Pool;

  constructor(config: MigrationConfig) {
    this.pool = new Pool(
      config.connectionString
        ? { connectionString: config.connectionString }
        : {
            host: config.host ?? 'localhost',
            port: config.port ?? 5432,
            database: config.database ?? 'mathison',
            user: config.user ?? 'postgres',
            password: config.password
          }
    );
  }

  async initialize(): Promise<void> {
    // Create migrations tracking table
    const query = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await this.pool.query(query);
  }

  async getAppliedMigrations(): Promise<string[]> {
    const query = 'SELECT version FROM schema_migrations ORDER BY version';
    const result = await this.pool.query(query);
    return result.rows.map(row => row.version);
  }

  async applyMigration(version: string, sql: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Apply migration
      await client.query(sql);

      // Record migration
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);

      await client.query('COMMIT');
      console.log(`✓ Applied migration: ${version}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Failed to apply migration ${version}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runMigrations(migrationsPath: string): Promise<void> {
    console.log('🔄 Running database migrations...');

    await this.initialize();

    // Get applied migrations
    const applied = await this.getAppliedMigrations();
    console.log(`📊 ${applied.length} migrations already applied`);

    // Read migration files
    const files = await fs.readdir(migrationsPath);
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    let newMigrations = 0;
    for (const file of migrationFiles) {
      const version = path.basename(file, '.sql');

      if (applied.includes(version)) {
        continue;
      }

      const filePath = path.join(migrationsPath, file);
      const sql = await fs.readFile(filePath, 'utf-8');

      await this.applyMigration(version, sql);
      newMigrations++;
    }

    if (newMigrations === 0) {
      console.log('✓ Database schema is up to date');
    } else {
      console.log(`✅ Applied ${newMigrations} new migration(s)`);
    }
  }

  async shutdown(): Promise<void> {
    await this.pool.end();
  }
}

// CLI entry point
if (require.main === module) {
  const config: MigrationConfig = {
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
  };

  const migrationsPath = path.join(__dirname, '../../migrations');

  const runner = new MigrationRunner(config);
  runner
    .runMigrations(migrationsPath)
    .then(() => runner.shutdown())
    .then(() => {
      console.log('✅ Migrations complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

export default MigrationRunner;
