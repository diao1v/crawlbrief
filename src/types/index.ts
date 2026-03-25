import type { Context } from 'hono';

// App context types
export interface AppVariables {
  requestId: string;
}

export type AppContext = Context<{ Variables: AppVariables }>;

// Change Tracking types (from gateway)
export type ChangeStatus = 'new' | 'same' | 'changed' | 'removed';

export interface ChangeTrackingResult {
  changeStatus: ChangeStatus;
  previousScrapeAt: string | null;
  diff?: string;
}

// Scrape result types
export interface ScrapeMetadata {
  title?: string;
  description?: string;
  language?: string;
  sourceURL: string;
  statusCode?: number;
  [key: string]: unknown;
}

export interface ScrapeResult {
  url: string;
  markdown?: string;
  html?: string;
  rawHtml?: string;
  links?: string[];
  screenshot?: string;
  metadata: ScrapeMetadata;
  changeTracking?: ChangeTrackingResult;
}

// Batch Scrape types
export type BatchScrapeStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface BatchScrapePageResult {
  url: string;
  markdown?: string;
  html?: string;
  metadata: ScrapeMetadata;
  changeTracking?: ChangeTrackingResult;
}

export interface BatchScrapeJobResult {
  jobId: string;
  status: BatchScrapeStatus;
  total: number;
  completed: number;
  pages?: BatchScrapePageResult[];
}

// LLM types
export interface ExtractedArticle {
  url: string;
  title: string;
  publishedDate?: string;
  excerpt?: string;
}

export interface ExtractedArticles {
  articles: ExtractedArticle[];
}

export type ArticleCategory = 'feature' | 'improvement' | 'announcement' | 'other';

export interface ArticleSummary {
  headline: string;
  summary: string;
  keyFeatures: string[];
  category: ArticleCategory;
  relevanceScore: number;
}

// Monitor types
export interface MonitorConfig {
  id: string;
  name: string;
  listingUrl: string;
  schedule: string;
  enabled: boolean;
  extractionPrompt?: string;
  summaryPrompt?: string;
}

// Run status types
export type CrawlRunStatus = 'running' | 'completed' | 'failed';
export type NotificationStatus = 'pending' | 'sent' | 'failed';
export type ScrapeJobType = 'listing' | 'articles';
export type ScrapeJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
