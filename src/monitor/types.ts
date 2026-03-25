export interface MonitorConfig {
  id: string;
  name: string;
  listingUrl: string;
  schedule: string; // Cron expression
  enabled: boolean;
  extractionPrompt?: string;
  summaryPrompt?: string;
}

export type CrawlRunStatus = 'running' | 'completed' | 'failed';

export interface CrawlRunResult {
  runId: number;
  monitorId: string;
  status: CrawlRunStatus;
  articlesFound: number;
  newArticles: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ProcessedArticle {
  id: number;
  url: string;
  title: string | null;
  headline: string;
  summary: string;
  category: string;
  relevanceScore: number | null;
}
