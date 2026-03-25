import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableError } from '../../../src/lib/retry.js';
import { TimeoutError, GatewayError } from '../../../src/lib/errors.js';

// Custom shouldRetry that retries any error (for testing)
const alwaysRetry = () => true;

describe('Retry Utility', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1,
      maxDelayMs: 5,
      shouldRetry: alwaysRetry,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('should throw after max attempts exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 5,
        shouldRetry: alwaysRetry,
      })
    ).rejects.toThrow('Always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  }, 10000);

  it('should use custom shouldRetry function', async () => {
    const nonRetryableError = new Error('Non-retryable');

    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    const shouldRetry = (error: unknown) => {
      return error instanceof Error && error.message === 'Retryable';
    };

    await expect(
      withRetry(fn, { shouldRetry, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow('Non-retryable');

    expect(fn).toHaveBeenCalledTimes(1); // No retries for non-retryable error
  });

  it('should pass through custom options', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Retry me');
      }
      return 'finally';
    });

    const result = await withRetry(fn, {
      maxAttempts: 5,
      baseDelayMs: 1,
      maxDelayMs: 10,
      requestId: 'test-request',
      shouldRetry: alwaysRetry,
    });

    expect(result).toBe('finally');
    expect(callCount).toBe(3);
  }, 10000);

  it('should not retry when shouldRetry returns false by default for generic errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Generic error'));

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 })
    ).rejects.toThrow('Generic error');

    // Default shouldRetry doesn't retry generic errors
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('isRetryableError', () => {
  it('should return true for TimeoutError', () => {
    const error = new TimeoutError('Request timed out');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for GatewayError with 502 status', () => {
    const error = new GatewayError('Bad Gateway', { status: 502 });
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for GatewayError with 503 status', () => {
    const error = new GatewayError('Service Unavailable', { status: 503 });
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return true for GatewayError with 504 status', () => {
    const error = new GatewayError('Gateway Timeout', { status: 504 });
    expect(isRetryableError(error)).toBe(true);
  });

  it('should return false for GatewayError with 400 status', () => {
    const error = new GatewayError('Bad Request', { status: 400 });
    expect(isRetryableError(error)).toBe(false);
  });

  it('should return true for network-related errors', () => {
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('Network error'))).toBe(true);
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
  });

  it('should return false for generic errors', () => {
    expect(isRetryableError(new Error('Something went wrong'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});
