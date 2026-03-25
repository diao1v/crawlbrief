import { logger } from './logger.js';
import { TimeoutError, GatewayError } from './errors.js';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  requestId?: string;
}

const defaultOptions: Required<Omit<RetryOptions, 'requestId' | 'shouldRetry'>> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export function isRetryableError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (error instanceof GatewayError) {
    const status = error.details?.status;
    return status === 502 || status === 503 || status === 504;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('econnrefused')
    );
  }
  return false;
}

function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff with jitter
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = defaultOptions.maxAttempts,
    baseDelayMs = defaultOptions.baseDelayMs,
    maxDelayMs = defaultOptions.maxDelayMs,
    shouldRetry = isRetryableError,
    requestId,
  } = options;

  const childLogger = logger.child({ requestId, component: 'retry' });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      childLogger.warn(
        {
          attempt,
          maxAttempts,
          delayMs: Math.round(delay),
          error: error instanceof Error ? error.message : String(error),
        },
        'Retrying after transient failure'
      );

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected end of retry loop');
}
