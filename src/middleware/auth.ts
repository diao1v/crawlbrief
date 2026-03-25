import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { config } from '../config.js';

export async function bearerAuthMiddleware(c: Context, next: Next): Promise<void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);

  if (token !== config.CRAWLBRIEF_API_TOKEN) {
    throw new HTTPException(403, { message: 'Invalid API token' });
  }

  await next();
}
