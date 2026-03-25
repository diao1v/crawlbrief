import { Hono } from 'hono';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

const health = new Hono();

health.get('/', async (c) => {
  const checks: Record<string, 'ok' | 'error'> = {
    server: 'ok',
    database: 'ok',
  };

  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    checks.database = 'error';
  }

  const isHealthy = Object.values(checks).every((status) => status === 'ok');

  return c.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    },
    isHealthy ? 200 : 503
  );
});

export default health;
