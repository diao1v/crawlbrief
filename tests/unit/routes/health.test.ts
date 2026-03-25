import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock the database
vi.mock('../../../src/db/index.js', () => ({
  db: {
    execute: vi.fn(),
  },
}));

describe('Health Route', () => {
  let app: Hono;
  let dbMock: any;

  beforeEach(async () => {
    vi.resetModules();

    const dbModule = await import('../../../src/db/index.js');
    dbMock = dbModule.db;

    const healthRoute = (await import('../../../src/routes/health.js')).default;
    app = new Hono();
    app.route('/health', healthRoute);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return healthy status when database is connected', async () => {
    dbMock.execute.mockResolvedValueOnce([{ '?column?': 1 }]);

    const res = await app.request('/health');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks.server).toBe('ok');
    expect(body.checks.database).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('should return unhealthy status when database is down', async () => {
    dbMock.execute.mockRejectedValueOnce(new Error('Connection failed'));

    const res = await app.request('/health');
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.server).toBe('ok');
    expect(body.checks.database).toBe('error');
  });

  it('should include timestamp in response', async () => {
    dbMock.execute.mockResolvedValueOnce([{ '?column?': 1 }]);

    const before = new Date().toISOString();
    const res = await app.request('/health');
    const body = await res.json();
    const after = new Date().toISOString();

    expect(body.timestamp).toBeDefined();
    expect(body.timestamp >= before).toBe(true);
    expect(body.timestamp <= after).toBe(true);
  });
});
