import { describe, it, expect } from 'vitest';
import type { MonitorConfig, CrawlRunResult, CrawlRunStatus, ProcessedArticle } from '../../../src/monitor/types.js';

describe('Monitor Types', () => {
  describe('MonitorConfig', () => {
    it('should accept valid monitor config', () => {
      const config: MonitorConfig = {
        id: 'test-monitor',
        name: 'Test Monitor',
        listingUrl: 'https://example.com/blog',
        schedule: '0 */6 * * *',
        enabled: true,
      };

      expect(config.id).toBe('test-monitor');
      expect(config.enabled).toBe(true);
    });

    it('should accept optional prompts', () => {
      const config: MonitorConfig = {
        id: 'test',
        name: 'Test',
        listingUrl: 'https://example.com',
        schedule: '0 0 * * *',
        enabled: true,
        extractionPrompt: 'Custom extraction prompt',
        summaryPrompt: 'Custom summary prompt',
      };

      expect(config.extractionPrompt).toBe('Custom extraction prompt');
      expect(config.summaryPrompt).toBe('Custom summary prompt');
    });
  });

  describe('CrawlRunStatus', () => {
    it('should accept valid status values', () => {
      const statuses: CrawlRunStatus[] = ['running', 'completed', 'failed'];

      for (const status of statuses) {
        expect(['running', 'completed', 'failed']).toContain(status);
      }
    });
  });

  describe('CrawlRunResult', () => {
    it('should accept valid crawl run result', () => {
      const result: CrawlRunResult = {
        runId: 1,
        monitorId: 'test-monitor',
        status: 'completed',
        articlesFound: 5,
        newArticles: 2,
        startedAt: new Date(),
        completedAt: new Date(),
      };

      expect(result.runId).toBe(1);
      expect(result.status).toBe('completed');
      expect(result.articlesFound).toBe(5);
      expect(result.newArticles).toBe(2);
    });

    it('should accept result with error', () => {
      const result: CrawlRunResult = {
        runId: 1,
        monitorId: 'test-monitor',
        status: 'failed',
        articlesFound: 0,
        newArticles: 0,
        error: 'Failed to scrape listing page',
        startedAt: new Date(),
      };

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Failed to scrape listing page');
    });
  });

  describe('ProcessedArticle', () => {
    it('should accept valid processed article', () => {
      const article: ProcessedArticle = {
        id: 1,
        url: 'https://example.com/article',
        title: 'Test Article',
        headline: 'New Feature Announced',
        summary: 'A new feature was announced today.',
        category: 'feature',
        relevanceScore: 8,
      };

      expect(article.id).toBe(1);
      expect(article.headline).toBe('New Feature Announced');
      expect(article.relevanceScore).toBe(8);
    });

    it('should accept null title and relevance score', () => {
      const article: ProcessedArticle = {
        id: 1,
        url: 'https://example.com/article',
        title: null,
        headline: 'Test',
        summary: 'Test summary',
        category: 'other',
        relevanceScore: null,
      };

      expect(article.title).toBeNull();
      expect(article.relevanceScore).toBeNull();
    });
  });
});
