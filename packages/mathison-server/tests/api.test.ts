// WHY: Test HTTP API endpoints

import request from 'supertest';
import express from 'express';
import healthRouter from '../src/routes/health';

describe('API', () => {
  const app = express();
  app.use(express.json());
  app.use(healthRouter);

  test('GET /health should return 200', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('GET /health should include version', async () => {
    const response = await request(app).get('/health');
    expect(response.body.version).toBe('2.0.0');
  });
});
