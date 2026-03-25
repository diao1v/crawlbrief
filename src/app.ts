import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requestIdMiddleware } from './middleware/request-id.js';
import { loggerMiddleware } from './middleware/logger.js';
import { logger } from './lib/logger.js';
import healthRoutes from './routes/health.js';
import triggerRoutes from './routes/trigger.js';
import webhookRoutes from './routes/webhooks.js';
import type { AppEnv } from './types/hono.js';

const app = new Hono<AppEnv>();

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', loggerMiddleware);

// Routes
app.route('/health', healthRoutes);
app.route('/run', triggerRoutes);
app.route('/webhooks', webhookRoutes);

// Error handling
app.onError((err, c) => {
  const requestId = c.get('requestId') as string | undefined;

  if (err instanceof HTTPException) {
    return c.json(
      {
        success: false,
        error: err.message,
        requestId,
      },
      err.status
    );
  }

  logger.error({ error: err, requestId }, 'Unhandled error');

  return c.json(
    {
      success: false,
      error: 'Internal server error',
      requestId,
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Not found',
    },
    404
  );
});

export default app;
