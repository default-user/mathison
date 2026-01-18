// WHY: Main server entrypoint

import express from 'express';
import dotenv from 'dotenv';
import { loadAuthorityConfig } from '@mathison/governance';
import { PostgresStore } from '@mathison/memory';
import { requestIdMiddleware } from './middleware/request-id';
import { loggingMiddleware } from './middleware/logging';
import { cifMiddleware } from './middleware/cif';
import healthRouter from './routes/health';
import threadsRouter, { setStore } from './routes/threads';

// Load environment
dotenv.config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Load authority config (fail closed if missing)
  const authorityConfigPath = process.env.AUTHORITY_CONFIG_PATH || './config/authority.json';
  console.log(`Loading authority config from ${authorityConfigPath}`);
  loadAuthorityConfig(authorityConfigPath);
  console.log('Authority config loaded');

  // Initialize database store
  const connectionString = process.env.DATABASE_URL || 
    `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;
  
  const store = new PostgresStore(connectionString);
  setStore(store);
  console.log('Database store initialized');

  // Create Express app
  const app = express();

  // Middleware stack
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(loggingMiddleware);
  app.use(cifMiddleware);

  // Routes
  app.use(healthRouter);
  app.use(threadsRouter);

  // Start server
  app.listen(Number(PORT), HOST, () => {
    console.log(`Mathison server v2.0.0 listening on ${HOST}:${PORT}`);
  });
}

// Run server
main().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});
