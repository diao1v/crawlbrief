import type { Context, Next } from 'hono';
import { randomUUID } from 'crypto';

const REQUEST_ID_HEADER = 'X-Request-Id';

export async function requestIdMiddleware(c: Context, next: Next): Promise<void> {
  const requestId = c.req.header(REQUEST_ID_HEADER) || randomUUID();
  c.set('requestId', requestId);
  c.header(REQUEST_ID_HEADER, requestId);
  await next();
}
