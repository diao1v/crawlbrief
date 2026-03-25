import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { bearerAuthMiddleware } from '../middleware/auth.js';
import { getMonitorById } from '../monitors.config.js';
import { triggerMonitorRun, runMonitorSync } from '../cron.js';
import type { AppEnv } from '../types/hono.js';

const trigger = new Hono<AppEnv>();

const triggerParamsSchema = z.object({
  monitorId: z.string().min(1),
});

const triggerQuerySchema = z.object({
  sync: z.enum(['true', 'false']).optional(),
});

// Apply authentication to all routes in this router
trigger.use('/*', bearerAuthMiddleware);

trigger.post(
  '/:monitorId',
  zValidator('param', triggerParamsSchema),
  zValidator('query', triggerQuerySchema),
  async (c) => {
    const { monitorId } = c.req.valid('param');
    const { sync } = c.req.valid('query');
    const requestId = c.get('requestId') as string | undefined;

    const monitor = getMonitorById(monitorId);
    if (!monitor) {
      return c.json({ success: false, error: `Monitor not found: ${monitorId}` }, 404);
    }

    if (!monitor.enabled) {
      return c.json({ success: false, error: `Monitor is disabled: ${monitorId}` }, 400);
    }

    if (sync === 'true') {
      // Run synchronously and wait for completion
      await runMonitorSync(monitorId, requestId);
      return c.json({
        success: true,
        message: 'Monitor run completed',
        monitorId,
      });
    }

    // Async run (default) - submit job and return immediately
    const { runId, jobId } = await triggerMonitorRun(monitorId, requestId);

    return c.json({
      success: true,
      message: 'Monitor run started',
      data: {
        monitorId,
        runId,
        jobId,
      },
    });
  }
);

export default trigger;
