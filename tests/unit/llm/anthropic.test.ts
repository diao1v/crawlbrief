import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockExtractedArticles, mockArticleSummary, mockListingMarkdown, mockArticleMarkdown } from '../../mocks/index.js';

const mockCreate = vi.fn();

// Mock Anthropic before importing the provider
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

// Mock config
vi.mock('../../../src/config.js', () => ({
  config: {
    CRAWLBRIEF_ANTHROPIC_API_KEY: 'test-anthropic-key',
    CRAWLBRIEF_ANTHROPIC_MODEL: 'claude-3-haiku-20240307',
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

describe('Anthropic Provider', () => {
  let AnthropicProvider: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/llm/anthropic.js');
    AnthropicProvider = module.AnthropicProvider;
  });

  describe('extractArticles', () => {
    it('should extract articles from markdown content', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockExtractedArticles),
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const provider = new AnthropicProvider();
      const result = await provider.extractArticles(mockListingMarkdown, 'https://example.com');

      expect(result.articles).toHaveLength(2);
      expect(result.articles[0].url).toBe('https://example.com/blog/ai-feature');
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '```json\n' + JSON.stringify(mockExtractedArticles) + '\n```',
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const provider = new AnthropicProvider();
      const result = await provider.extractArticles(mockListingMarkdown, 'https://example.com');

      expect(result.articles).toHaveLength(2);
    });

    it('should handle JSON wrapped in plain code blocks', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '```\n' + JSON.stringify(mockExtractedArticles) + '\n```',
          },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const provider = new AnthropicProvider();
      const result = await provider.extractArticles(mockListingMarkdown, 'https://example.com');

      expect(result.articles).toHaveLength(2);
    });

    it('should throw LLMError when no text content returned', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [],
        usage: { input_tokens: 100, output_tokens: 0 },
      });

      const provider = new AnthropicProvider();

      await expect(
        provider.extractArticles(mockListingMarkdown, 'https://example.com')
      ).rejects.toThrow('Anthropic returned no text content');
    });
  });

  describe('summarizeArticle', () => {
    it('should summarize article content', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockArticleSummary),
          },
        ],
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      const provider = new AnthropicProvider();
      const result = await provider.summarizeArticle(
        mockArticleMarkdown,
        'https://example.com/article'
      );

      expect(result.headline).toBe('New AI-Powered Smart Assistant Feature');
      expect(result.category).toBe('feature');
      expect(result.relevanceScore).toBe(8);
    });
  });

  describe('provider properties', () => {
    it('should have correct name and model', () => {
      const provider = new AnthropicProvider();

      expect(provider.name).toBe('anthropic');
      expect(provider.model).toBe('claude-3-haiku-20240307');
    });
  });
});
