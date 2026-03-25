import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';

// monitors - Source configuration (synced from config file on startup)
export const monitors = pgTable('monitors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  listingUrl: text('listing_url').notNull(),
  schedule: text('schedule').notNull(),
  extractionPrompt: text('extraction_prompt'),
  summaryPrompt: text('summary_prompt'),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// crawl_runs - Execution history
export const crawlRuns = pgTable('crawl_runs', {
  id: serial('id').primaryKey(),
  monitorId: text('monitor_id')
    .references(() => monitors.id, { onDelete: 'cascade' })
    .notNull(),
  status: text('status').notNull(), // 'running' | 'completed' | 'failed'
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  articlesFound: integer('articles_found').default(0).notNull(),
  newArticles: integer('new_articles').default(0).notNull(),
  error: text('error'),
});

// listing_content - Raw listing page content (for debugging/reprocessing)
export const listingContent = pgTable('listing_content', {
  id: serial('id').primaryKey(),
  crawlRunId: integer('crawl_run_id')
    .references(() => crawlRuns.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  markdown: text('markdown').notNull(),
  metadata: jsonb('metadata'),
  scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
});

// articles - Discovered article identities (for deduplication)
export const articles = pgTable(
  'articles',
  {
    id: serial('id').primaryKey(),
    monitorId: text('monitor_id')
      .references(() => monitors.id, { onDelete: 'cascade' })
      .notNull(),
    url: text('url').notNull(),
    title: text('title'),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    crawlRunId: integer('crawl_run_id').references(() => crawlRuns.id, { onDelete: 'set null' }),
  },
  (table) => ({
    uniqueMonitorUrl: unique().on(table.monitorId, table.url),
  })
);

// article_content - Raw scraped content
export const articleContent = pgTable('article_content', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id')
    .references(() => articles.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  markdown: text('markdown').notNull(),
  metadata: jsonb('metadata'),
  scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
});

// summaries - AI-generated summaries
export const summaries = pgTable('summaries', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id')
    .references(() => articles.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  headline: text('headline').notNull(),
  summary: text('summary').notNull(),
  keyFeatures: jsonb('key_features').notNull().$type<string[]>(),
  category: text('category').notNull(), // 'feature' | 'improvement' | 'announcement' | 'other'
  relevanceScore: integer('relevance_score'),
  llmProvider: text('llm_provider').notNull(),
  llmModel: text('llm_model').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// notifications - Slack delivery history
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id')
    .references(() => articles.id, { onDelete: 'cascade' })
    .notNull(),
  summaryId: integer('summary_id').references(() => summaries.id, { onDelete: 'set null' }),
  channel: text('channel').notNull(),
  status: text('status').notNull(), // 'pending' | 'sent' | 'failed'
  slackMessageTs: text('slack_message_ts'),
  sentAt: timestamp('sent_at'),
  error: text('error'),
  attempts: integer('attempts').default(0).notNull(),
});

// scrape_jobs - Track async batch scrape jobs
export const scrapeJobs = pgTable('scrape_jobs', {
  id: serial('id').primaryKey(),
  jobId: text('job_id').unique().notNull(),
  monitorId: text('monitor_id')
    .references(() => monitors.id, { onDelete: 'cascade' })
    .notNull(),
  crawlRunId: integer('crawl_run_id')
    .references(() => crawlRuns.id, { onDelete: 'cascade' })
    .notNull(),
  jobType: text('job_type').notNull(), // 'listing' | 'articles'
  urls: jsonb('urls').notNull().$type<string[]>(),
  status: text('status').notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
  completedCount: integer('completed_count').default(0).notNull(),
  totalCount: integer('total_count').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// Relations for Drizzle relational query API
export const monitorsRelations = relations(monitors, ({ many }) => ({
  crawlRuns: many(crawlRuns),
  articles: many(articles),
  scrapeJobs: many(scrapeJobs),
}));

export const crawlRunsRelations = relations(crawlRuns, ({ one, many }) => ({
  monitor: one(monitors, {
    fields: [crawlRuns.monitorId],
    references: [monitors.id],
  }),
  listingContent: one(listingContent),
  articles: many(articles),
  scrapeJobs: many(scrapeJobs),
}));

export const listingContentRelations = relations(listingContent, ({ one }) => ({
  crawlRun: one(crawlRuns, {
    fields: [listingContent.crawlRunId],
    references: [crawlRuns.id],
  }),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  monitor: one(monitors, {
    fields: [articles.monitorId],
    references: [monitors.id],
  }),
  crawlRun: one(crawlRuns, {
    fields: [articles.crawlRunId],
    references: [crawlRuns.id],
  }),
  content: one(articleContent),
  summary: one(summaries),
  notifications: many(notifications),
}));

export const articleContentRelations = relations(articleContent, ({ one }) => ({
  article: one(articles, {
    fields: [articleContent.articleId],
    references: [articles.id],
  }),
}));

export const summariesRelations = relations(summaries, ({ one }) => ({
  article: one(articles, {
    fields: [summaries.articleId],
    references: [articles.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  article: one(articles, {
    fields: [notifications.articleId],
    references: [articles.id],
  }),
  summary: one(summaries, {
    fields: [notifications.summaryId],
    references: [summaries.id],
  }),
}));

export const scrapeJobsRelations = relations(scrapeJobs, ({ one }) => ({
  monitor: one(monitors, {
    fields: [scrapeJobs.monitorId],
    references: [monitors.id],
  }),
  crawlRun: one(crawlRuns, {
    fields: [scrapeJobs.crawlRunId],
    references: [crawlRuns.id],
  }),
}));

// Type exports for use in application code
export type Monitor = typeof monitors.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;

export type CrawlRun = typeof crawlRuns.$inferSelect;
export type NewCrawlRun = typeof crawlRuns.$inferInsert;

export type ListingContent = typeof listingContent.$inferSelect;
export type NewListingContent = typeof listingContent.$inferInsert;

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

export type ArticleContent = typeof articleContent.$inferSelect;
export type NewArticleContent = typeof articleContent.$inferInsert;

export type Summary = typeof summaries.$inferSelect;
export type NewSummary = typeof summaries.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type NewScrapeJob = typeof scrapeJobs.$inferInsert;
