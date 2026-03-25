import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockExtractedArticles, mockArticleSummary, mockListingMarkdown, mockArticleMarkdown } from '../../mocks/index.js';

const mockCreate = vi.fn();

// Mock OpenAI before importing the provider
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Mock config
vi.mock('../../../src/config.js', () => ({
  config: {
    CRAWLBRIEF_OPENAI_API_KEY: 'test-openai-key',
    CRAWLBRIEF_OPENAI_MODEL: 'gpt-4o-mini',
  },
}));

// Mock logger
vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OpenAI Provider', () => {
  let OpenAIProvider: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/llm/openai.js');
    OpenAIProvider = module.OpenAIProvider;
  });

  describe('extractArticles', () => {
    it('should extract articles from markdown content', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(mockExtractedArticles),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const provider = new OpenAIProvider();
      const result = await provider.extractArticles(mockListingMarkdown, 'https://example.com');

      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].url).toBe('https://example.com/blog/ai-feature');
      expect(result.articles[0].title).toBe('New AI Feature Launch');
    });

    it('should return empty articles array when none found', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ articles: [] }),
            },
          },
        ],
      });

      const provider = new OpenAIProvider();
      const result = await provider.extractArticles('No articles here', 'https://example.com');

      expect(result.articles).toHaveLength(0);
    });

    it('should use JSON response format', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(mockExtractedArticles) } }],
      });

      const provider = new OpenAIProvider();
      await provider.extractArticles(mockListingMarkdown, 'https://example.com');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: 'json_object' },
        })
      );
    });

    it('should throw LLMError on invalid JSON response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'not valid json' } }],
      });

      const provider = new OpenAIProvider();

      await expect(
        provider.extractArticles(mockListingMarkdown, 'https://example.com')
      ).rejects.toThrow('Failed to parse OpenAI response as JSON');
    });

    it('should throw LLMError on empty response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
      });

      const provider = new OpenAIProvider();

      await expect(
        provider.extractArticles(mockListingMarkdown, 'https://example.com')
      ).rejects.toThrow('OpenAI returned empty response');
    });
  });

  describe('summarizeArticle', () => {
    it('should summarize article content', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(mockArticleSummary),
            },
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
      });

      const provider = new OpenAIProvider();
      const result = await provider.summarizeArticle(
        mockArticleMarkdown,
        'https://example.com/article'
      );

      expect(result.headline).toBe('New AI-Powered Smart Assistant Feature');
      expect(result.category).toBe('feature');
      expect(result.relevanceScore).toBe(8);
      expect(result.keyFeatures).toHaveLength(3);
    });

    it('should validate summary schema', async () => {
      const invalidSummary = {
        headline: 'Test',
        summary: 'Test summary',
        keyFeatures: ['Feature 1'],
        category: 'invalid_category', // Invalid enum value
        relevanceScore: 8,
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(invalidSummary) } }],
      });

      const provider = new OpenAIProvider();

      await expect(
        provider.summarizeArticle(mockArticleMarkdown, 'https://example.com/article')
      ).rejects.toThrow();
    });

    it('should validate relevance score range', async () => {
      const invalidSummary = {
        ...mockArticleSummary,
        relevanceScore: 15, // Out of range (should be 1-10)
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(invalidSummary) } }],
      });

      const provider = new OpenAIProvider();

      await expect(
        provider.summarizeArticle(mockArticleMarkdown, 'https://example.com/article')
      ).rejects.toThrow();
    });
  });

  describe('provider properties', () => {
    it('should have correct name and model', () => {
      const provider = new OpenAIProvider();

      expect(provider.name).toBe('openai');
      expect(provider.model).toBe('gpt-4o-mini');
    });
  });
});
