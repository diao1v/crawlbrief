import type { Context, Next } from 'hono';
import { logger } from '../lib/logger.js';

export async function loggerMiddleware(c: Context, next: Next): Promise<void> {
  const startTime = Date.now();
  const requestId = c.get('requestId') as string | undefined;

  const childLogger = logger.child({ requestId });

  childLogger.info(
    {
      method: c.req.method,
      path: c.req.path,
      query: c.req.query(),
    },
    'Request started'
  );

  await next();

  const duration = Date.now() - startTime;
  const status = c.res.status;

  childLogger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status,
      duration,
    },
    'Request completed'
  );
}
