import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db, schema } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { getLLMProvider } from '../services/llm/index.js';
import { gatewayClient } from '../services/gateway-client.js';
import { getSlackService } from '../services/slack.js';
import { classifyPage, normalizeTitle } from '../services/scrape-utils.js';
import { recordRunFailure } from '../services/run-failures.js';
import { getMonitorById } from '../monitors.config.js';
import { config } from '../config.js';
import type { AppEnv } from '../types/hono.js';
import type { PageFailure } from '../db/schema.js';

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

    const listingUrl =
      (payload.data.metadata?.sourceURL as string | undefined) || monitor.listingUrl;

    // Status-code guard: if the listing page itself failed, mark the run failed and stop
    const listingFailure = classifyPage(
      listingUrl,
      payload.data.markdown,
      payload.data.metadata as { statusCode?: number } | undefined
    );
    if (listingFailure) {
      childLogger.warn(
        { ...listingFailure, monitorId: monitor.id },
        'Listing page failed - marking run as failed'
      );
      await recordRunFailure(scrapeJob.crawlRunId, listingFailure);
      await db
        .update(schema.crawlRuns)
        .set({
          status: 'failed',
          completedAt: new Date(),
          error: `Listing scrape failed: ${listingFailure.reason}${listingFailure.statusCode ? ` (status ${listingFailure.statusCode})` : ''}`,
        })
        .where(eq(schema.crawlRuns.id, scrapeJob.crawlRunId));
      try {
        await getSlackService().sendRunFailureNotification({
          monitorName: monitor.name,
          runId: scrapeJob.crawlRunId,
          listingUrl: monitor.listingUrl,
          failedCount: 1,
          newArticles: 0,
          failures: [listingFailure],
          kind: 'listing',
        });
      } catch (err) {
        childLogger.error({ err }, 'Failed to send listing-failure Slack notification');
      }
      return;
    }

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

    // Extract article URLs using LLM. Use post-redirect URL so relative links resolve correctly
    // when a site has migrated (prevents hallucinating URLs against the old domain).
    const llm = getLLMProvider();
    const extractedArticles = await llm.extractArticles(
      payload.data.markdown || '',
      listingUrl,
      monitor.extractionPrompt
    );

    if (extractedArticles.articles.length === 0) {
      childLogger.info('No articles found on listing page');
      await completeRun(scrapeJob.crawlRunId, 0, 0);
      return;
    }

    // Filter out already-seen URLs (and titles, to catch domain migrations where URLs changed
    // but the article identity is the same).
    const existingArticles = await db.query.articles.findMany({
      where: eq(schema.articles.monitorId, monitor.id),
      columns: { url: true, titleNormalized: true },
    });
    const existingUrls = new Set(existingArticles.map((a) => a.url));
    const existingTitles = new Set(
      existingArticles
        .map((a) => a.titleNormalized)
        .filter((t): t is string => typeof t === 'string' && t.length > 0)
    );
    const newUrls = extractedArticles.articles
      .filter((a) => {
        if (existingUrls.has(a.url)) return false;
        const tn = normalizeTitle(a.title);
        if (tn && existingTitles.has(tn)) {
          childLogger.info(
            { url: a.url, title: a.title },
            'Skipping article: title already seen on different URL (likely domain migration)'
          );
          return false;
        }
        return true;
      })
      .map((a) => a.url);

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

    // Status-code guard: skip 4xx/5xx pages and empty content before LLM/DB work.
    // Do NOT insert into articles table - we want the URL to be retried on a future run
    // when it might work (e.g. transient outage, listing URL gets fixed).
    const failure = classifyPage(
      articleUrl,
      payload.data.markdown,
      payload.data.metadata as { statusCode?: number } | undefined
    );
    if (failure) {
      childLogger.warn({ ...failure }, 'Skipping article (failed classification)');
      await recordRunFailure(scrapeJob.crawlRunId, failure);
      await db
        .update(schema.scrapeJobs)
        .set({ completedCount: sql`${schema.scrapeJobs.completedCount} + 1` })
        .where(eq(schema.scrapeJobs.id, scrapeJob.id));
      return;
    }

    try {
      const extractedTitle = payload.data.metadata?.title as string | undefined;

      // Insert article record (onConflictDoNothing handles duplicates)
      const [article] = await db
        .insert(schema.articles)
        .values({
          monitorId: monitor.id,
          url: articleUrl!,
          title: extractedTitle || null,
          titleNormalized: normalizeTitle(extractedTitle),
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
          articleUrl!,
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
        childLogger.debug({ url: articleUrl }, 'Article already exists, skipping');
      }
    } catch (error) {
      childLogger.error({ url: articleUrl, error }, 'Failed to process article');
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

  // If any article failed, send a single aggregate Slack message
  const run = await db.query.crawlRuns.findFirst({
    where: eq(schema.crawlRuns.id, crawlRunId),
  });
  if (!run || run.failedCount === 0) return;

  const monitor = getMonitorById(run.monitorId);
  if (!monitor) return;

  const failures = (run.failureSummary || []) as PageFailure[];
  try {
    await getSlackService().sendRunFailureNotification({
      monitorName: monitor.name,
      runId: crawlRunId,
      listingUrl: monitor.listingUrl,
      failedCount: run.failedCount,
      newArticles,
      failures,
      kind: 'article',
    });
  } catch (err) {
    logger.error({ err, crawlRunId }, 'Failed to send run failure aggregate Slack message');
  }
}

export default webhooks;
