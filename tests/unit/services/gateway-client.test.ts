import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockScrapeResult, jsonResponse } from '../../mocks/index.js';

describe('GatewayClient', () => {
  let GatewayClient: any;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.resetModules();
    originalFetch = globalThis.fetch;

    const module = await import('../../../src/services/gateway-client.js');
    GatewayClient = module.GatewayClient;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('scrape', () => {
    it('should successfully scrape a URL', async () => {
      const mockResult = createMockScrapeResult();

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: mockResult,
        })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');
      const result = await client.scrape('https://example.com');

      expect(result.markdown).toBe(mockResult.markdown);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/scrape',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should include change tracking options when enabled', async () => {
      const mockResult = createMockScrapeResult({
        changeTracking: {
          changeStatus: 'new',
          previousScrapeAt: null,
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        jsonResponse({ success: true, data: mockResult })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');
      await client.scrape('https://example.com', {
        changeTracking: true,
        changeTrackingTag: 'test-tag',
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"changeTracking":true'),
        })
      );
    });

    it('should throw GatewayError on non-200 response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');

      await expect(client.scrape('https://example.com')).rejects.toThrow('Gateway error: 500');
    });

    it('should throw GatewayError on unsuccessful response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          success: false,
          error: { code: 'SCRAPE_FAILED', message: 'Failed to scrape' },
        })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');

      await expect(client.scrape('https://example.com')).rejects.toThrow('Failed to scrape');
    });

    it('should throw TimeoutError on abort', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const client = new GatewayClient('http://localhost:3000', 'test-token');

      await expect(client.scrape('https://example.com', { timeout: 100 })).rejects.toThrow(
        'timed out'
      );
    });
  });

  describe('startBatchScrape', () => {
    it('should start a batch scrape job', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { jobId: 'job-123', status: 'pending' },
        })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');
      const jobId = await client.startBatchScrape(['https://example.com/1', 'https://example.com/2']);

      expect(jobId).toBe('job-123');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/batch/scrape',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should include webhook options when provided', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { jobId: 'job-123', status: 'pending' },
        })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');
      await client.startBatchScrape(['https://example.com'], {
        webhookUrl: 'https://callback.example.com/webhook',
        webhookEvents: ['page', 'completed'],
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"webhookUrl"'),
        })
      );
    });

    it('should throw GatewayError when job creation fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          success: false,
          error: { code: 'JOB_FAILED', message: 'Failed to create job' },
        })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');

      await expect(client.startBatchScrape(['https://example.com'])).rejects.toThrow(
        'Failed to create job'
      );
    });
  });

  describe('getBatchScrapeStatus', () => {
    it('should get batch scrape status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            jobId: 'job-123',
            status: 'completed',
            totalCount: 2,
            completedCount: 2,
            results: [createMockScrapeResult(), createMockScrapeResult()],
          },
        })
      );

      const client = new GatewayClient('http://localhost:3000', 'test-token');
      const result = await client.getBatchScrapeStatus('job-123');

      expect(result.status).toBe('completed');
      expect(result.completedCount).toBe(2);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/batch/scrape/job-123',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });
});
