import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { getLLMProvider } from '../services/llm/index.js';
import { gatewayClient } from '../services/gateway-client.js';
import { getMonitorById } from '../monitors.config.js';
import { config } from '../config.js';
import type { AppEnv } from '../types/hono.js';

/**
 * Verify webhook signature using HMAC-SHA256.
 * Gateway sends signature in X-Webhook-Signature header with format: sha256=<hex>
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  // Strip 'sha256=' prefix if present
  const actualSignature = signature.startsWith('sha256=')
    ? signature.slice(7)
    : signature;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(actualSignature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

type ChildLogger = typeof logger;

const webhooks = new Hono<AppEnv>();

interface FirecrawlWebhookPayload {
  type: 'page' | 'completed' | 'started';
  jobId: string;
  data?: {
    url: string;
    markdown?: string;
    metadata?: Record<string, unknown>;
    changeTracking?: {
      changeStatus: 'new' | 'same' | 'changed' | 'removed';
      previousScrapeAt: string | null;
    };
  };
  error?: string;
}

webhooks.post('/firecrawl', async (c) => {
  const requestId = c.get('requestId') as string | undefined;
  const childLogger = logger.child({ requestId, service: 'webhook' });

  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Verify webhook signature if secret is configured
  if (config.CRAWLBRIEF_WEBHOOK_SECRET) {
    const signature = c.req.header('X-Webhook-Signature') || c.req.header('x-webhook-signature');

    if (!verifyWebhookSignature(rawBody, signature, config.CRAWLBRIEF_WEBHOOK_SECRET)) {
      childLogger.warn('Invalid webhook signature');
      return c.json({ success: false, error: 'Invalid signature' }, 401);
    }
  }

  let payload: FirecrawlWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ success: false, error: 'Invalid JSON payload' }, 400);
  }

  childLogger.info(
    { jobId: payload.jobId, type: payload.type },
    'Received Firecrawl webhook'
  );

  // Look up the scrape job
  const scrapeJob = await db.query.scrapeJobs.findFirst({
    where: eq(schema.scrapeJobs.jobId, payload.jobId),
    with: {
      crawlRun: true,
    },
  });

  if (!scrapeJob) {
    childLogger.warn({ jobId: payload.jobId }, 'Scrape job not found');
    return c.json({ success: false, error: 'Job not found' }, 404);
  }

  const monitor = getMonitorById(scrapeJob.monitorId);
  if (!monitor) {
    childLogger.error({ monitorId: scrapeJob.monitorId }, 'Monitor not found');
    return c.json({ success: false, error: 'Monitor not found' }, 404);
  }

  switch (payload.type) {
    case 'page':
      await handlePageEvent(scrapeJob, monitor, payload, requestId, childLogger);
      break;

    case 'completed':
      await handleCompletedEvent(scrapeJob, childLogger);
      break;

    case 'started':
      childLogger.info({ jobId: payload.jobId }, 'Job started');
      await db
        .update(schema.scrapeJobs)
        .set({ status: 'processing' })
        .where(eq(schema.scrapeJobs.id, scrapeJob.id));
      break;
  }

  return c.json({ success: true });
});

async function handlePageEvent(
  scrapeJob: typeof schema.scrapeJobs.$inferSelect & { crawlRun: typeof schema.crawlRuns.$inferSelect | null },
  monitor: ReturnType<typeof getMonitorById>,
  payload: FirecrawlWebhookPayload,
  requestId: string | undefined,
  childLogger: ChildLogger
): Promise<void> {
  if (!payload.data || !monitor) return;

  if (scrapeJob.jobType === 'listing') {
    // Handle listing page result
    childLogger.info(
      { changeStatus: payload.data.changeTracking?.changeStatus },
      'Processing listing page result'
    );

    // Store listing content
    await db.insert(schema.listingContent).values({
      crawlRunId: scrapeJob.crawlRunId,
      markdown: payload.data.markdown || '',
      metadata: payload.data.metadata || null,
    }).onConflictDoNothing();

    // Check if content changed
    if (payload.data.changeTracking?.changeStatus === 'same') {
      childLogger.info('No changes detected, completing run');
      await completeRun(scrapeJob.crawlRunId, 0, 0);
      return;
    }

    // Extract article URLs using LLM
    const llm = getLLMProvider();
    const extractedArticles = await llm.extractArticles(
      payload.data.markdown || '',
      monitor.listingUrl,
      monitor.extractionPrompt
    );

    if (extractedArticles.articles.length === 0) {
      childLogger.info('No articles found on listing page');
      await completeRun(scrapeJob.crawlRunId, 0, 0);
      return;
    }

    // Filter out already-seen URLs
    const existingArticles = await db.query.articles.findMany({
      where: eq(schema.articles.monitorId, monitor.id),
      columns: { url: true },
    });
    const existingUrls = new Set(existingArticles.map((a) => a.url));
    const newUrls = extractedArticles.articles
      .map((a) => a.url)
      .filter((url) => !existingUrls.has(url));

    if (newUrls.length === 0) {
      childLogger.info(
        { articlesFound: extractedArticles.articles.length },
        'No new articles found'
      );
      await completeRun(scrapeJob.crawlRunId, extractedArticles.articles.length, 0);
      return;
    }

    childLogger.info({ newUrls: newUrls.length }, 'Found new articles, starting batch scrape');

    // Build webhook URL
    const webhookUrl = config.CRAWLBRIEF_BASE_URL
      ? `${config.CRAWLBRIEF_BASE_URL}/webhooks/firecrawl`
      : undefined;

    // Submit batch scrape for new articles
    const jobId = await gatewayClient.startBatchScrape(
      newUrls,
      {
        formats: ['markdown'],
        webhookUrl,
        webhookEvents: ['page', 'completed'],
      },
      requestId
    );

    // Store new scrape job
    await db.insert(schema.scrapeJobs).values({
      jobId,
      monitorId: monitor.id,
      crawlRunId: scrapeJob.crawlRunId,
      jobType: 'articles',
      urls: newUrls,
      status: 'pending',
      totalCount: newUrls.length,
    });

    // Update articles found count
    await db
      .update(schema.crawlRuns)
      .set({ articlesFound: extractedArticles.articles.length })
      .where(eq(schema.crawlRuns.id, scrapeJob.crawlRunId));
  } else if (scrapeJob.jobType === 'articles') {
    // Handle individual article result
    // Firecrawl puts the URL in metadata.sourceURL, not at the top level
    const articleUrl = payload.data.url
      || (payload.data.metadata?.sourceURL as string | undefined)
      || (payload.data.metadata?.url as string | undefined);
    childLogger.info({ url: articleUrl }, 'Processing article');

    if (!articleUrl) {
      childLogger.warn('No URL found in article data, skipping');
      return;
    }

    try {
      const extractedTitle = payload.data.metadata?.title as string | undefined;

      // Insert article record (onConflictDoNothing handles duplicates)
      const [article] = await db
        .insert(schema.articles)
        .values({
          monitorId: monitor.id,
          url: articleUrl,
          title: extractedTitle || null,
          crawlRunId: scrapeJob.crawlRunId,
        })
        .onConflictDoNothing()
        .returning();

      if (article) {
        // Store article content
        await db.insert(schema.articleContent).values({
          articleId: article.id,
          markdown: payload.data.markdown || '',
          metadata: payload.data.metadata || null,
        });

        // Generate summary
        const llm = getLLMProvider();
        const summary = await llm.summarizeArticle(
          payload.data.markdown || '',
          payload.data.url,
          monitor.summaryPrompt
        );

        // Store summary
        const [summaryRecord] = await db
          .insert(schema.summaries)
          .values({
            articleId: article.id,
            headline: summary.headline,
            summary: summary.summary,
            keyFeatures: summary.keyFeatures,
            category: summary.category,
            relevanceScore: summary.relevanceScore,
            llmProvider: llm.name,
            llmModel: llm.model,
          })
          .returning();

        if (summaryRecord) {
          // Queue notification
          await db.insert(schema.notifications).values({
            articleId: article.id,
            summaryId: summaryRecord.id,
            channel: 'slack',
            status: 'pending',
          });
        }

        childLogger.info(
          { articleId: article.id, headline: summary.headline },
          'Article processed'
        );
      } else {
        childLogger.debug({ url: payload.data.url }, 'Article already exists, skipping');
      }
    } catch (error) {
      childLogger.error({ url: payload.data.url, error }, 'Failed to process article');
    }

    // Update completed count atomically
    await db
      .update(schema.scrapeJobs)
      .set({ completedCount: sql`${schema.scrapeJobs.completedCount} + 1` })
      .where(eq(schema.scrapeJobs.id, scrapeJob.id));
  }
}

async function handleCompletedEvent(
  scrapeJob: typeof schema.scrapeJobs.$inferSelect & { crawlRun: typeof schema.crawlRuns.$inferSelect | null },
  childLogger: ChildLogger
): Promise<void> {
  childLogger.info({ jobId: scrapeJob.jobId, jobType: scrapeJob.jobType }, 'Job completed');

  await db
    .update(schema.scrapeJobs)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(schema.scrapeJobs.id, scrapeJob.id));

  // Check if all jobs for this run are complete
  const pendingJobs = await db.query.scrapeJobs.findMany({
    where: eq(schema.scrapeJobs.crawlRunId, scrapeJob.crawlRunId),
  });

  const allComplete = pendingJobs.every(
    (job) => job.status === 'completed' || job.status === 'failed'
  );

  if (allComplete) {
    // Count new articles for this run
    const newArticles = await db.query.articles.findMany({
      where: eq(schema.articles.crawlRunId, scrapeJob.crawlRunId),
    });

    await completeRun(
      scrapeJob.crawlRunId,
      scrapeJob.crawlRun?.articlesFound || 0,
      newArticles.length
    );
  }
}

async function completeRun(
  crawlRunId: number,
  articlesFound: number,
  newArticles: number
): Promise<void> {
  await db
    .update(schema.crawlRuns)
    .set({
      status: 'completed',
      completedAt: new Date(),
      articlesFound,
      newArticles,
    })
    .where(eq(schema.crawlRuns.id, crawlRunId));

  logger.info({ crawlRunId, articlesFound, newArticles }, 'Crawl run completed');
}

export default webhooks;
