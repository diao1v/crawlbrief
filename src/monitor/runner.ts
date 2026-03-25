import { eq, and, lt, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { gatewayClient } from '../services/gateway-client.js';
import { getLLMProvider } from '../services/llm/index.js';
import { getMonitorById } from '../monitors.config.js';
import type { CrawlRunResult, MonitorConfig, ProcessedArticle } from './types.js';

const MAX_NOTIFICATION_RETRIES = 3;

export class MonitorRunner {
  private requestId?: string;

  constructor(requestId?: string) {
    this.requestId = requestId;
  }

  private get childLogger() {
    return logger.child({ requestId: this.requestId, service: 'monitor-runner' });
  }

  /**
   * Start a monitor run by submitting a batch scrape job for the listing page.
   * This is non-blocking - results will be processed via webhooks.
   */
  async startRun(monitorId: string): Promise<{ runId: number; jobId: string }> {
    const monitor = getMonitorById(monitorId);
    if (!monitor) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    this.childLogger.info({ monitorId, listingUrl: monitor.listingUrl }, 'Starting monitor run');

    // Ensure monitor exists in DB
    await this.ensureMonitorInDb(monitor);

    // Retry any failed notifications from previous runs
    await this.retryFailedNotifications(monitorId);

    // Create crawl run record
    const crawlRunResult = await db
      .insert(schema.crawlRuns)
      .values({
        monitorId,
        status: 'running',
      })
      .returning();

    const crawlRun = crawlRunResult[0];
    if (!crawlRun) {
      throw new Error('Failed to create crawl run record');
    }

    // Build webhook URL
    const webhookUrl = config.CRAWLBRIEF_BASE_URL
      ? `${config.CRAWLBRIEF_BASE_URL}/webhooks/firecrawl`
      : undefined;

    // Submit batch scrape for listing page
    const jobId = await gatewayClient.startBatchScrape(
      [monitor.listingUrl],
      {
        formats: ['markdown'],
        changeTracking: true,
        changeTrackingTag: `listing:${monitorId}`,
        webhookUrl,
        webhookEvents: ['page', 'completed'],
      },
      this.requestId
    );

    // Store scrape job record
    await db.insert(schema.scrapeJobs).values({
      jobId,
      monitorId,
      crawlRunId: crawlRun.id,
      jobType: 'listing',
      urls: [monitor.listingUrl],
      status: 'pending',
      totalCount: 1,
    });

    this.childLogger.info(
      { monitorId, runId: crawlRun.id, jobId },
      'Monitor run started, batch scrape submitted'
    );

    return { runId: crawlRun.id, jobId };
  }

  /**
   * Synchronous run (for testing or when webhooks aren't available).
   * Polls for job completion instead of using webhooks.
   */
  async runSync(monitorId: string): Promise<CrawlRunResult> {
    const monitor = getMonitorById(monitorId);
    if (!monitor) {
      throw new Error(`Monitor not found: ${monitorId}`);
    }

    const startTime = new Date();
    this.childLogger.info({ monitorId }, 'Starting synchronous monitor run');

    // Ensure monitor exists in DB
    await this.ensureMonitorInDb(monitor);

    // Retry any failed notifications from previous runs
    await this.retryFailedNotifications(monitorId);

    // Create crawl run record
    const crawlRunResult = await db
      .insert(schema.crawlRuns)
      .values({
        monitorId,
        status: 'running',
      })
      .returning();

    const crawlRun = crawlRunResult[0];
    if (!crawlRun) {
      throw new Error('Failed to create crawl run record');
    }

    try {
      // Scrape listing page
      const listingResult = await gatewayClient.scrape(
        monitor.listingUrl,
        {
          formats: ['markdown'],
          changeTracking: true,
          changeTrackingTag: `listing:${monitorId}`,
        },
        this.requestId
      );

      // Store listing content
      await db.insert(schema.listingContent).values({
        crawlRunId: crawlRun.id,
        markdown: listingResult.markdown || '',
        metadata: listingResult.metadata || null,
      });

      // Check if content changed
      if (listingResult.changeTracking?.changeStatus === 'same') {
        this.childLogger.info({ monitorId }, 'No changes detected, skipping extraction');
        return this.completeRun(crawlRun.id, 0, 0, startTime);
      }

      // Extract article URLs using LLM
      const llm = getLLMProvider();
      const extractedArticles = await llm.extractArticles(
        listingResult.markdown || '',
        monitor.listingUrl,
        monitor.extractionPrompt
      );

      const articlesFound = extractedArticles.articles.length;

      if (articlesFound === 0) {
        this.childLogger.info({ monitorId }, 'No articles found on listing page');
        return this.completeRun(crawlRun.id, 0, 0, startTime);
      }

      // Filter out already-seen URLs
      const newUrls = await this.filterNewUrls(
        monitorId,
        extractedArticles.articles.map((a) => a.url)
      );

      if (newUrls.length === 0) {
        this.childLogger.info({ monitorId, articlesFound }, 'No new articles found');
        return this.completeRun(crawlRun.id, articlesFound, 0, startTime);
      }

      this.childLogger.info(
        { monitorId, articlesFound, newUrls: newUrls.length },
        'Processing new articles'
      );

      // Process each new article
      const processedArticles: ProcessedArticle[] = [];

      for (const url of newUrls) {
        try {
          const article = await this.processArticle(
            monitor,
            crawlRun.id,
            url,
            extractedArticles.articles.find((a) => a.url === url)?.title
          );
          if (article) {
            processedArticles.push(article);
          }
        } catch (error) {
          this.childLogger.error({ url, error }, 'Failed to process article');
        }
      }

      return this.completeRun(crawlRun.id, articlesFound, processedArticles.length, startTime);
    } catch (error) {
      this.childLogger.error({ monitorId, error }, 'Monitor run failed');

      await db
        .update(schema.crawlRuns)
        .set({
          status: 'failed',
          completedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        })
        .where(eq(schema.crawlRuns.id, crawlRun.id));

      return {
        runId: crawlRun.id,
        monitorId,
        status: 'failed',
        articlesFound: 0,
        newArticles: 0,
        error: error instanceof Error ? error.message : String(error),
        startedAt: startTime,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Process a single article: scrape, summarize, and queue notification.
   * Returns null if article already exists (instead of throwing).
   */
  async processArticle(
    monitor: MonitorConfig,
    crawlRunId: number,
    url: string,
    title?: string | null
  ): Promise<ProcessedArticle | null> {
    this.childLogger.info({ monitorId: monitor.id, url }, 'Processing article');

    // Scrape article content first (outside transaction - external call)
    const scrapeResult = await gatewayClient.scrape(
      url,
      { formats: ['markdown'] },
      this.requestId
    );

    // Generate summary (outside transaction - external LLM call)
    const llm = getLLMProvider();
    const summary = await llm.summarizeArticle(
      scrapeResult.markdown || '',
      url,
      monitor.summaryPrompt
    );

    // Wrap all DB operations in a transaction for consistency
    const result = await db.transaction(async (tx) => {
      // Insert article record
      const [article] = await tx
        .insert(schema.articles)
        .values({
          monitorId: monitor.id,
          url,
          title: title || null,
          crawlRunId,
        })
        .onConflictDoNothing()
        .returning();

      // If article already exists (conflict), skip it
      if (!article) {
        this.childLogger.debug({ url }, 'Article already exists, skipping');
        return null;
      }

      // Store article content
      await tx.insert(schema.articleContent).values({
        articleId: article.id,
        markdown: scrapeResult.markdown || '',
        metadata: scrapeResult.metadata || null,
      });

      // Store summary
      const [summaryRecord] = await tx
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

      if (!summaryRecord) {
        throw new Error('Failed to create summary record');
      }

      // Queue notification
      await tx.insert(schema.notifications).values({
        articleId: article.id,
        summaryId: summaryRecord.id,
        channel: 'slack',
        status: 'pending',
      });

      return {
        id: article.id,
        url,
        title: article.title,
        headline: summary.headline,
        summary: summary.summary,
        category: summary.category,
        relevanceScore: summary.relevanceScore,
      };
    });

    if (result) {
      this.childLogger.info(
        { articleId: result.id, headline: result.headline },
        'Article processed and queued for notification'
      );
    }

    return result;
  }

  private async ensureMonitorInDb(monitor: MonitorConfig): Promise<void> {
    await db
      .insert(schema.monitors)
      .values({
        id: monitor.id,
        name: monitor.name,
        listingUrl: monitor.listingUrl,
        schedule: monitor.schedule,
        extractionPrompt: monitor.extractionPrompt || null,
        summaryPrompt: monitor.summaryPrompt || null,
        enabled: monitor.enabled,
      })
      .onConflictDoUpdate({
        target: schema.monitors.id,
        set: {
          name: monitor.name,
          listingUrl: monitor.listingUrl,
          schedule: monitor.schedule,
          extractionPrompt: monitor.extractionPrompt || null,
          summaryPrompt: monitor.summaryPrompt || null,
          enabled: monitor.enabled,
          updatedAt: new Date(),
        },
      });
  }

  private async filterNewUrls(monitorId: string, urls: string[]): Promise<string[]> {
    if (urls.length === 0) return [];

    const existingArticles = await db.query.articles.findMany({
      where: and(
        eq(schema.articles.monitorId, monitorId),
        inArray(schema.articles.url, urls)
      ),
      columns: { url: true },
    });

    const existingUrls = new Set(existingArticles.map((a) => a.url));
    return urls.filter((url) => !existingUrls.has(url));
  }

  private async retryFailedNotifications(monitorId: string): Promise<void> {
    // Use a subquery to find notifications for this monitor's articles
    // This is more efficient than fetching all failed notifications and filtering in JS
    const failedNotifications = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .innerJoin(schema.articles, eq(schema.notifications.articleId, schema.articles.id))
      .where(
        and(
          eq(schema.notifications.status, 'failed'),
          lt(schema.notifications.attempts, MAX_NOTIFICATION_RETRIES),
          eq(schema.articles.monitorId, monitorId)
        )
      );

    if (failedNotifications.length > 0) {
      this.childLogger.info(
        { count: failedNotifications.length },
        'Retrying failed notifications'
      );

      // Mark as pending to be picked up by notification processor
      const notificationIds = failedNotifications.map((n) => n.id);
      await db
        .update(schema.notifications)
        .set({ status: 'pending' })
        .where(inArray(schema.notifications.id, notificationIds));
    }
  }

  private async completeRun(
    runId: number,
    articlesFound: number,
    newArticles: number,
    startTime: Date
  ): Promise<CrawlRunResult> {
    const monitorRun = await db.query.crawlRuns.findFirst({
      where: eq(schema.crawlRuns.id, runId),
    });

    await db
      .update(schema.crawlRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        articlesFound,
        newArticles,
      })
      .where(eq(schema.crawlRuns.id, runId));

    this.childLogger.info(
      { runId, articlesFound, newArticles },
      'Monitor run completed'
    );

    return {
      runId,
      monitorId: monitorRun?.monitorId || '',
      status: 'completed',
      articlesFound,
      newArticles,
      startedAt: startTime,
      completedAt: new Date(),
    };
  }
}
