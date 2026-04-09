import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { startScheduler, stopScheduler } from './cron.js';

const port = config.CRAWLBRIEF_PORT;

// Start the HTTP server
const server = serve({
  fetch: app.fetch,
  port,
});

logger.info({ port }, 'CrawlBrief server started');

// Warn about missing optional but recommended configuration
if (!config.CRAWLBRIEF_BASE_URL) {
  logger.warn(
    'CRAWLBRIEF_BASE_URL is not set. Webhook-based async scraping will not work. ' +
    'The system will fall back to synchronous polling mode.'
  );
}

if (!config.CRAWLBRIEF_WEBHOOK_SECRET) {
  logger.warn(
    'CRAWLBRIEF_WEBHOOK_SECRET is not set. Webhook endpoint will accept requests without signature verification. ' +
    'This is a security risk in production environments.'
  );
}

// Start the cron scheduler
startScheduler();

// Graceful shutdown
function shutdown() {
  logger.info('Shutting down...');
  stopScheduler();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
