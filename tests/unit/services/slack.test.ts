import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPostMessage = vi.fn();

// Mock Slack Web API
vi.mock('@slack/web-api', () => {
  return {
    WebClient: vi.fn().mockImplementation(() => ({
      chat: {
        postMessage: mockPostMessage,
      },
    })),
  };
});

// Mock config
vi.mock('../../../src/config.js', () => ({
  config: {
    CRAWLBRIEF_SLACK_BOT_TOKEN: 'xoxb-test-token',
    CRAWLBRIEF_SLACK_CHANNEL_ID: 'C12345678',
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

describe('SlackService', () => {
  let SlackService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../../src/services/slack.js');
    SlackService = module.SlackService;
  });

  describe('sendArticleNotification', () => {
    it('should send a notification with correct message format', async () => {
      mockPostMessage.mockResolvedValueOnce({
        ok: true,
        ts: '1234567890.123456',
        channel: 'C12345678',
      });

      const service = new SlackService();
      const result = await service.sendArticleNotification({
        monitorName: 'Ziflow',
        articleUrl: 'https://example.com/article',
        headline: 'New Feature Launch',
        summary: 'A new feature was launched.',
        keyFeatures: ['Feature 1', 'Feature 2', 'Feature 3'],
        category: 'feature',
        relevanceScore: 8,
      });

      expect(result).toBe('1234567890.123456');
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C12345678',
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'header' }),
            expect.objectContaining({ type: 'divider' }),
          ]),
        })
      );
    });

    it('should include key features in the message', async () => {
      mockPostMessage.mockResolvedValueOnce({
        ok: true,
        ts: '1234567890.123456',
      });

      const service = new SlackService();
      await service.sendArticleNotification({
        monitorName: 'Test',
        articleUrl: 'https://example.com/article',
        headline: 'Test Headline',
        summary: 'Test summary.',
        keyFeatures: ['First Feature', 'Second Feature'],
        category: 'improvement',
        relevanceScore: 7,
      });

      const call = mockPostMessage.mock.calls[0][0];
      const featuresBlock = call.blocks.find(
        (b: any) => b.type === 'section' && b.text?.text?.includes('Key Features')
      );

      expect(featuresBlock.text.text).toContain('First Feature');
      expect(featuresBlock.text.text).toContain('Second Feature');
    });

    it('should handle null relevance score', async () => {
      mockPostMessage.mockResolvedValueOnce({
        ok: true,
        ts: '1234567890.123456',
      });

      const service = new SlackService();
      await service.sendArticleNotification({
        monitorName: 'Test',
        articleUrl: 'https://example.com/article',
        headline: 'Test Headline',
        summary: 'Test summary.',
        keyFeatures: ['Feature'],
        category: 'announcement',
        relevanceScore: null,
      });

      expect(mockPostMessage).toHaveBeenCalled();
    });

    it('should throw SlackError when API call fails', async () => {
      mockPostMessage.mockRejectedValueOnce(new Error('API Error'));

      const service = new SlackService();

      await expect(
        service.sendArticleNotification({
          monitorName: 'Test',
          articleUrl: 'https://example.com/article',
          headline: 'Test',
          summary: 'Test',
          keyFeatures: [],
          category: 'other',
          relevanceScore: 5,
        })
      ).rejects.toThrow('Failed to send Slack message');
    });

    it('should use correct emoji for different categories', async () => {
      const categories = [
        { category: 'feature', emoji: ':rocket:' },
        { category: 'improvement', emoji: ':sparkles:' },
        { category: 'announcement', emoji: ':mega:' },
        { category: 'other', emoji: ':newspaper:' },
      ];

      for (const { category, emoji } of categories) {
        mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '123' });

        const service = new SlackService();
        await service.sendArticleNotification({
          monitorName: 'Test',
          articleUrl: 'https://example.com',
          headline: 'Test',
          summary: 'Test',
          keyFeatures: [],
          category: category as any,
          relevanceScore: 5,
        });

        const call = mockPostMessage.mock.calls[mockPostMessage.mock.calls.length - 1][0];
        const headerBlock = call.blocks.find((b: any) => b.type === 'header');

        expect(headerBlock.text.text).toContain(emoji);
      }
    });
  });
});
