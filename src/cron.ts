import cron from 'node-cron';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { getEnabledMonitors } from './monitors.config.js';
import { MonitorRunner } from './monitor/runner.js';
import { processNotifications } from './services/slack.js';

const scheduledJobs: cron.ScheduledTask[] = [];

// Track running monitors to prevent overlapping runs
const runningMonitors = new Set<string>();
let notificationProcessingInProgress = false;

/**
 * Start the cron scheduler for all enabled monitors.
 */
export function startScheduler(): void {
  const monitors = getEnabledMonitors();
  const timezone = config.CRAWLBRIEF_TIMEZONE;

  logger.info({ monitorCount: monitors.length, timezone }, 'Starting cron scheduler');

  for (const monitor of monitors) {
    if (!cron.validate(monitor.schedule)) {
      logger.error(
        { monitorId: monitor.id, schedule: monitor.schedule },
        'Invalid cron schedule'
      );
      continue;
    }

    const job = cron.schedule(
      monitor.schedule,
      async () => {
        // Prevent overlapping runs of the same monitor
        if (runningMonitors.has(monitor.id)) {
          logger.warn(
            { monitorId: monitor.id },
            'Skipping scheduled run - previous run still in progress'
          );
          return;
        }

        const requestId = `cron-${monitor.id}-${Date.now()}`;
        const runner = new MonitorRunner(requestId);

        logger.info({ monitorId: monitor.id, requestId }, 'Starting scheduled monitor run');

        runningMonitors.add(monitor.id);
        try {
          await runner.startRun(monitor.id);
        } catch (error) {
          logger.error(
            { monitorId: monitor.id, error },
            'Scheduled monitor run failed'
          );
        } finally {
          runningMonitors.delete(monitor.id);
        }
      },
      { timezone }
    );

    scheduledJobs.push(job);
    logger.info(
      { monitorId: monitor.id, schedule: monitor.schedule },
      'Scheduled monitor'
    );
  }

  // Schedule notification processing every minute
  const notificationJob = cron.schedule(
    '* * * * *',
    async () => {
      // Prevent overlapping notification processing
      if (notificationProcessingInProgress) {
        logger.debug('Skipping notification processing - previous batch still in progress');
        return;
      }

      notificationProcessingInProgress = true;
      try {
        await processNotifications();
      } catch (error) {
        logger.error({ error }, 'Notification processing failed');
      } finally {
        notificationProcessingInProgress = false;
      }
    },
    { timezone }
  );

  scheduledJobs.push(notificationJob);
  logger.info('Scheduled notification processor (every minute)');
}

/**
 * Stop all scheduled jobs.
 */
export function stopScheduler(): void {
  logger.info({ jobCount: scheduledJobs.length }, 'Stopping cron scheduler');

  for (const job of scheduledJobs) {
    job.stop();
  }

  scheduledJobs.length = 0;
}

/**
 * Manually trigger a monitor run (for testing or manual triggering).
 */
export async function triggerMonitorRun(
  monitorId: string,
  requestId?: string
): Promise<{ runId: number; jobId: string }> {
  const runner = new MonitorRunner(requestId);
  return runner.startRun(monitorId);
}

/**
 * Run a monitor synchronously (for testing or when webhooks aren't available).
 */
export async function runMonitorSync(
  monitorId: string,
  requestId?: string
): Promise<void> {
  const runner = new MonitorRunner(requestId);
  const result = await runner.runSync(monitorId);

  logger.info(
    {
      runId: result.runId,
      status: result.status,
      articlesFound: result.articlesFound,
      newArticles: result.newArticles,
    },
    'Synchronous monitor run completed'
  );

  // Process notifications immediately after sync run
  await processNotifications();
}
