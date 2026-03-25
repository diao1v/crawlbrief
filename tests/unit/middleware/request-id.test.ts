import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { requestIdMiddleware } from '../../../src/middleware/request-id.js';
import type { AppEnv } from '../../../src/types/hono.js';

describe('Request ID Middleware', () => {
  let app: Hono<AppEnv>;

  beforeEach(() => {
    app = new Hono<AppEnv>();
    app.use('*', requestIdMiddleware);
    app.get('/test', (c) => {
      const requestId = c.get('requestId');
      return c.json({ requestId });
    });
  });

  it('should generate request ID when not provided', async () => {
    const res = await app.request('/test');
    const body = await res.json();

    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
  });

  it('should use provided request ID from header', async () => {
    const customId = 'custom-request-id-123';
    const res = await app.request('/test', {
      headers: {
        'X-Request-Id': customId,
      },
    });
    const body = await res.json();

    expect(body.requestId).toBe(customId);
  });

  it('should set request ID in response header', async () => {
    const res = await app.request('/test');

    expect(res.headers.get('X-Request-Id')).toBeDefined();
  });

  it('should echo provided request ID in response header', async () => {
    const customId = 'echo-test-id';
    const res = await app.request('/test', {
      headers: {
        'X-Request-Id': customId,
      },
    });

    expect(res.headers.get('X-Request-Id')).toBe(customId);
  });

  it('should generate UUID format request ID', async () => {
    const res = await app.request('/test');
    const body = await res.json();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(body.requestId).toMatch(uuidRegex);
  });
});
