import { describe, it, expect } from 'vitest';
import { extractedArticlesSchema, extractedArticleSchema } from '../../../src/schemas/extraction.js';

describe('Extraction Schemas', () => {
  describe('extractedArticleSchema', () => {
    it('should validate a complete article object', () => {
      const article = {
        url: 'https://example.com/article',
        title: 'Test Article',
        publishedDate: '2024-01-15',
        excerpt: 'This is a test excerpt.',
      };

      const result = extractedArticleSchema.parse(article);

      expect(result.url).toBe('https://example.com/article');
      expect(result.title).toBe('Test Article');
      expect(result.publishedDate).toBe('2024-01-15');
      expect(result.excerpt).toBe('This is a test excerpt.');
    });

    it('should validate article with only required fields', () => {
      const article = {
        url: 'https://example.com/article',
        title: 'Test Article',
      };

      const result = extractedArticleSchema.parse(article);

      expect(result.url).toBe('https://example.com/article');
      expect(result.title).toBe('Test Article');
      expect(result.publishedDate).toBeUndefined();
      expect(result.excerpt).toBeUndefined();
    });

    it('should reject invalid URL', () => {
      const article = {
        url: 'not-a-valid-url',
        title: 'Test Article',
      };

      expect(() => extractedArticleSchema.parse(article)).toThrow();
    });

    it('should reject missing required fields', () => {
      expect(() => extractedArticleSchema.parse({ url: 'https://example.com' })).toThrow();
      expect(() => extractedArticleSchema.parse({ title: 'Test' })).toThrow();
      expect(() => extractedArticleSchema.parse({})).toThrow();
    });
  });

  describe('extractedArticlesSchema', () => {
    it('should validate articles array', () => {
      const data = {
        articles: [
          { url: 'https://example.com/1', title: 'Article 1' },
          { url: 'https://example.com/2', title: 'Article 2' },
        ],
      };

      const result = extractedArticlesSchema.parse(data);

      expect(result.articles).toHaveLength(2);
    });

    it('should validate empty articles array', () => {
      const data = { articles: [] };

      const result = extractedArticlesSchema.parse(data);

      expect(result.articles).toHaveLength(0);
    });

    it('should reject missing articles field', () => {
      expect(() => extractedArticlesSchema.parse({})).toThrow();
    });

    it('should reject articles with invalid items', () => {
      const data = {
        articles: [
          { url: 'https://example.com/1', title: 'Valid' },
          { url: 'invalid-url', title: 'Invalid' },
        ],
      };

      expect(() => extractedArticlesSchema.parse(data)).toThrow();
    });
  });
});
