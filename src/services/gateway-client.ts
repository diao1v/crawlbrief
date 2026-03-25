import { config } from '../config.js';
import { GatewayError, TimeoutError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { withRetry, isRetryableError } from '../lib/retry.js';
import type {
  ScrapeResult,
  BatchScrapeJobResult,
  ChangeTrackingResult,
} from '../types/index.js';

const DEFAULT_TIMEOUT = 30000;
const MAX_TIMEOUT = 60000;
const API_TIMEOUT = 30000;

interface ScrapeOptions {
  formats?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
  timeout?: number;
  changeTracking?: boolean;
  changeTrackingTag?: string;
}

interface BatchScrapeOptions {
  formats?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  changeTracking?: boolean;
  changeTrackingTag?: string;
  webhookUrl?: string;
  webhookEvents?: ('started' | 'page' | 'completed')[];
}

interface GatewayScrapeResponse {
  success: boolean;
  data?: ScrapeResult;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface GatewayBatchScrapeStartResponse {
  success: boolean;
  data?: {
    jobId: string;
    status: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface GatewayBatchScrapeStatusResponse {
  success: boolean;
  data?: BatchScrapeJobResult;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class GatewayClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || config.CRAWLBRIEF_GATEWAY_URL;
    this.token = token || config.CRAWLBRIEF_GATEWAY_TOKEN;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  async scrape(
    url: string,
    options: ScrapeOptions = {},
    requestId?: string
  ): Promise<ScrapeResult> {
    const timeout = Math.min(options.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);
    const startTime = Date.now();

    const childLogger = logger.child({ requestId, service: 'gateway-client' });
    childLogger.info({ url, timeout }, 'Starting scrape request');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const requestBody: Record<string, unknown> = {
        url,
        formats: options.formats || ['markdown'],
        includeTags: options.includeTags,
        excludeTags: options.excludeTags,
        waitFor: options.waitFor,
        timeout,
      };

      if (options.changeTracking) {
        requestBody.changeTracking = true;
        if (options.changeTrackingTag) {
          requestBody.changeTrackingOptions = {
            tag: options.changeTrackingTag,
          };
        }
      }

      const response = await fetch(`${this.baseUrl}/scrape`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        childLogger.error(
          { status: response.status, error: errorText, duration },
          'Gateway scrape request failed'
        );
        throw new GatewayError(`Gateway error: ${response.status}`, {
          status: response.status,
          body: errorText,
        });
      }

      const data = (await response.json()) as GatewayScrapeResponse;
      childLogger.info({ duration, success: data.success }, 'Scrape completed');

      if (!data.success || !data.data) {
        throw new GatewayError(
          data.error?.message || 'Gateway returned unsuccessful response'
        );
      }

      return data.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        childLogger.error({ timeout }, 'Scrape request timed out');
        throw new TimeoutError(`Request timed out after ${timeout}ms`);
      }

      if (error instanceof GatewayError || error instanceof TimeoutError) {
        throw error;
      }

      childLogger.error({ error }, 'Unexpected error during scrape');
      throw new GatewayError('Failed to connect to gateway', {
        cause: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async startBatchScrape(
    urls: string[],
    options: BatchScrapeOptions = {},
    requestId?: string
  ): Promise<string> {
    const childLogger = logger.child({ requestId, service: 'gateway-client' });
    childLogger.info(
      { urlCount: urls.length, webhookUrl: options.webhookUrl },
      'Starting batch scrape job'
    );

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          const requestBody: Record<string, unknown> = {
            urls,
            formats: options.formats || ['markdown'],
            includeTags: options.includeTags,
            excludeTags: options.excludeTags,
          };

          if (options.changeTracking) {
            requestBody.changeTracking = true;
            if (options.changeTrackingTag) {
              requestBody.changeTrackingOptions = {
                tag: options.changeTrackingTag,
              };
            }
          }

          if (options.webhookUrl) {
            requestBody.webhookUrl = options.webhookUrl;
            if (options.webhookEvents) {
              requestBody.webhookEvents = options.webhookEvents;
            }
          }

          const response = await fetch(`${this.baseUrl}/batch/scrape`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            childLogger.error(
              { status: response.status, error: errorText },
              'Gateway batch scrape start failed'
            );
            throw new GatewayError(`Gateway error: ${response.status}`, {
              status: response.status,
              body: errorText,
            });
          }

          const data = (await response.json()) as GatewayBatchScrapeStartResponse;

          if (!data.success || !data.data?.jobId) {
            throw new GatewayError(
              data.error?.message || 'Gateway failed to start batch scrape'
            );
          }

          childLogger.info({ jobId: data.data.jobId }, 'Batch scrape job started');
          return data.data.jobId;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            childLogger.error({ timeout: API_TIMEOUT }, 'Batch scrape start timed out');
            throw new TimeoutError(`Request timed out after ${API_TIMEOUT}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { requestId, shouldRetry: isRetryableError }
    );
  }

  async getBatchScrapeStatus(
    jobId: string,
    requestId?: string
  ): Promise<BatchScrapeJobResult> {
    const childLogger = logger.child({ requestId, service: 'gateway-client', jobId });
    childLogger.debug('Checking batch scrape status');

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        try {
          const response = await fetch(`${this.baseUrl}/batch/scrape/${jobId}`, {
            method: 'GET',
            headers: this.getHeaders(),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            childLogger.error(
              { status: response.status, error: errorText },
              'Gateway batch scrape status check failed'
            );
            throw new GatewayError(`Gateway error: ${response.status}`, {
              status: response.status,
              body: errorText,
            });
          }

          const data = (await response.json()) as GatewayBatchScrapeStatusResponse;

          if (!data.success || !data.data) {
            throw new GatewayError(
              data.error?.message || 'Gateway returned unsuccessful response'
            );
          }

          childLogger.debug({ status: data.data.status }, 'Batch scrape status retrieved');
          return data.data;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            childLogger.error({ timeout: API_TIMEOUT }, 'Batch scrape status timed out');
            throw new TimeoutError(`Request timed out after ${API_TIMEOUT}ms`);
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { requestId, shouldRetry: isRetryableError }
    );
  }
}

export const gatewayClient = new GatewayClient();
