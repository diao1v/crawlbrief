import { describe, it, expect } from 'vitest';
import {
  formatExtractionPrompt,
  formatSummaryPrompt,
  DEFAULT_EXTRACTION_PROMPT,
  DEFAULT_SUMMARY_PROMPT,
} from '../../../src/services/llm/prompts.js';

describe('LLM Prompts', () => {
  describe('formatExtractionPrompt', () => {
    it('should replace base URL placeholder in default prompt', () => {
      const baseUrl = 'https://example.com/blog';
      const result = formatExtractionPrompt(baseUrl);

      expect(result).toContain('Base URL: https://example.com/blog');
      expect(result).not.toContain('{{BASE_URL}}');
    });

    it('should use custom prompt when provided', () => {
      const baseUrl = 'https://example.com/blog';
      const customPrompt = 'Extract URLs from {{BASE_URL}} page';
      const result = formatExtractionPrompt(baseUrl, customPrompt);

      expect(result).toBe('Extract URLs from https://example.com/blog page');
    });

    it('should use default prompt when custom prompt is undefined', () => {
      const baseUrl = 'https://example.com';
      const result = formatExtractionPrompt(baseUrl, undefined);

      expect(result).toContain('Your task is to extract all article links');
    });
  });

  describe('formatSummaryPrompt', () => {
    it('should replace article URL placeholder in default prompt', () => {
      const articleUrl = 'https://example.com/blog/article-1';
      const result = formatSummaryPrompt(articleUrl);

      expect(result).toContain('Article URL: https://example.com/blog/article-1');
      expect(result).not.toContain('{{ARTICLE_URL}}');
    });

    it('should use custom prompt when provided', () => {
      const articleUrl = 'https://example.com/article';
      const customPrompt = 'Summarize the article at {{ARTICLE_URL}}';
      const result = formatSummaryPrompt(articleUrl, customPrompt);

      expect(result).toBe('Summarize the article at https://example.com/article');
    });
  });

  describe('Default prompts content', () => {
    it('should include JSON format instructions in extraction prompt', () => {
      expect(DEFAULT_EXTRACTION_PROMPT).toContain('"articles"');
      expect(DEFAULT_EXTRACTION_PROMPT).toContain('"url"');
      expect(DEFAULT_EXTRACTION_PROMPT).toContain('"title"');
    });

    it('should include JSON format instructions in summary prompt', () => {
      expect(DEFAULT_SUMMARY_PROMPT).toContain('"headline"');
      expect(DEFAULT_SUMMARY_PROMPT).toContain('"summary"');
      expect(DEFAULT_SUMMARY_PROMPT).toContain('"keyFeatures"');
      expect(DEFAULT_SUMMARY_PROMPT).toContain('"category"');
      expect(DEFAULT_SUMMARY_PROMPT).toContain('"relevanceScore"');
    });

    it('should specify category options in summary prompt', () => {
      expect(DEFAULT_SUMMARY_PROMPT).toContain('feature');
      expect(DEFAULT_SUMMARY_PROMPT).toContain('improvement');
      expect(DEFAULT_SUMMARY_PROMPT).toContain('announcement');
      expect(DEFAULT_SUMMARY_PROMPT).toContain('other');
    });
  });
});
