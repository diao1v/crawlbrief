import { eq, and, lt, inArray, or } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { gatewayClient } from '../services/gateway-client.js';
import { getLLMProvider } from '../services/llm/index.js';
import { getSlackService } from '../services/slack.js';
import { classifyPage, normalizeTitle } from '../services/scrape-utils.js';
import { recordRunFailure } from '../services/run-failures.js';
import { getMonitorById } from '../monitors.config.js';
import type { PageFailure } from '../db/schema.js';
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
    // waitFor gives JS category filters time to apply
    const jobId = await gatewayClient.startBatchScrape(
      [monitor.listingUrl],
      {
        formats: ['markdown'],
        changeTracking: true,
        changeTrackingTag: `listing:${monitorId}`,
        webhookUrl,
        webhookEvents: ['page', 'completed'],
        waitFor: 3000,
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

      const effectiveListingUrl = listingResult.metadata?.sourceURL || monitor.listingUrl;

      // Status-code guard on the listing itself
      const listingFailure = classifyPage(
        effectiveListingUrl,
        listingResult.markdown,
        listingResult.metadata
      );
      if (listingFailure) {
        this.childLogger.warn(
          { ...listingFailure, monitorId },
          'Listing page failed - marking run as failed'
        );
        await recordRunFailure(crawlRun.id, listingFailure);
        await db
          .update(schema.crawlRuns)
          .set({
            status: 'failed',
            completedAt: new Date(),
            error: `Listing scrape failed: ${listingFailure.reason}${listingFailure.statusCode ? ` (status ${listingFailure.statusCode})` : ''}`,
          })
          .where(eq(schema.crawlRuns.id, crawlRun.id));
        try {
          await getSlackService().sendRunFailureNotification({
            monitorName: monitor.name,
            runId: crawlRun.id,
            listingUrl: monitor.listingUrl,
            failedCount: 1,
            newArticles: 0,
            failures: [listingFailure],
            kind: 'listing',
          });
        } catch (err) {
          this.childLogger.error({ err }, 'Failed to send listing-failure Slack notification');
        }
        return {
          runId: crawlRun.id,
          monitorId,
          status: 'failed',
          articlesFound: 0,
          newArticles: 0,
          error: `Listing scrape failed: ${listingFailure.reason}`,
          startedAt: startTime,
          completedAt: new Date(),
        };
      }

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

      // Extract article URLs using LLM. Use post-redirect URL so relative links resolve correctly
      // when a site has migrated (prevents hallucinating URLs against the old domain).
      const llm = getLLMProvider();
      const extractedArticles = await llm.extractArticles(
        listingResult.markdown || '',
        effectiveListingUrl,
        monitor.extractionPrompt
      );

      const articlesFound = extractedArticles.articles.length;

      if (articlesFound === 0) {
        this.childLogger.info({ monitorId }, 'No articles found on listing page');
        return this.completeRun(crawlRun.id, 0, 0, startTime);
      }

      // Filter out already-seen URLs (and titles, to catch domain migrations)
      const newUrls = await this.filterNewUrls(monitorId, extractedArticles.articles);

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

    // Status-code guard: skip 4xx/5xx pages and empty content before LLM/DB work.
    // Do NOT insert into articles table - we want the URL to be retried later.
    const failure = classifyPage(url, scrapeResult.markdown, scrapeResult.metadata);
    if (failure) {
      this.childLogger.warn({ ...failure }, 'Skipping article (failed classification)');
      await recordRunFailure(crawlRunId, failure);
      return null;
    }

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
          titleNormalized: normalizeTitle(title),
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

  private async filterNewUrls(
    monitorId: string,
    articles: Array<{ url: string; title?: string | null }>
  ): Promise<string[]> {
    if (articles.length === 0) return [];

    const urls = articles.map((a) => a.url);
    const normalizedTitles = articles
      .map((a) => normalizeTitle(a.title))
      .filter((t): t is string => typeof t === 'string' && t.length > 0);

    // One query that finds existing matches by URL OR by normalized title.
    const matchClauses = [inArray(schema.articles.url, urls)];
    if (normalizedTitles.length > 0) {
      matchClauses.push(inArray(schema.articles.titleNormalized, normalizedTitles));
    }
    const existingArticles = await db.query.articles.findMany({
      where: and(eq(schema.articles.monitorId, monitorId), or(...matchClauses)),
      columns: { url: true, titleNormalized: true },
    });

    const existingUrls = new Set(existingArticles.map((a) => a.url));
    const existingTitles = new Set(
      existingArticles
        .map((a) => a.titleNormalized)
        .filter((t): t is string => typeof t === 'string' && t.length > 0)
    );

    return articles
      .filter((a) => {
        if (existingUrls.has(a.url)) return false;
        const tn = normalizeTitle(a.title);
        if (tn && existingTitles.has(tn)) {
          this.childLogger.info(
            { url: a.url, title: a.title },
            'Skipping article: title already seen on different URL (likely domain migration)'
          );
          return false;
        }
        return true;
      })
      .map((a) => a.url);
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
      { runId, articlesFound, newArticles, failedCount: monitorRun?.failedCount },
      'Monitor run completed'
    );

    // If any article failed, send a single aggregate Slack message
    if (monitorRun && monitorRun.failedCount > 0) {
      const monitor = getMonitorById(monitorRun.monitorId);
      if (monitor) {
        const failures = (monitorRun.failureSummary || []) as PageFailure[];
        try {
          await getSlackService().sendRunFailureNotification({
            monitorName: monitor.name,
            runId,
            listingUrl: monitor.listingUrl,
            failedCount: monitorRun.failedCount,
            newArticles,
            failures,
            kind: 'article',
          });
        } catch (err) {
          this.childLogger.error({ err, runId }, 'Failed to send run failure aggregate Slack');
        }
      }
    }

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
