import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

describe('Config validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate required environment variables', async () => {
    process.env.CRAWLBRIEF_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.CRAWLBRIEF_GATEWAY_TOKEN = 'test-token';
    process.env.CRAWLBRIEF_OPENAI_API_KEY = 'test-key';
    process.env.CRAWLBRIEF_SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.CRAWLBRIEF_SLACK_CHANNEL_ID = 'C12345';
    process.env.CRAWLBRIEF_API_TOKEN = 'api-token';

    const { config } = await import('../../src/config.js');

    expect(config.CRAWLBRIEF_DATABASE_URL).toBe('postgresql://test:test@localhost:5432/test');
    expect(config.CRAWLBRIEF_GATEWAY_TOKEN).toBe('test-token');
  });

  it('should use default values when optional env vars are not set', async () => {
    // Clear any env vars from setup
    delete process.env.CRAWLBRIEF_LOG_LEVEL;
    delete process.env.CRAWLBRIEF_PORT;
    delete process.env.CRAWLBRIEF_LLM_PROVIDER;
    delete process.env.CRAWLBRIEF_OPENAI_MODEL;

    process.env.CRAWLBRIEF_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.CRAWLBRIEF_GATEWAY_TOKEN = 'test-token';
    process.env.CRAWLBRIEF_OPENAI_API_KEY = 'test-key';
    process.env.CRAWLBRIEF_SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.CRAWLBRIEF_SLACK_CHANNEL_ID = 'C12345';
    process.env.CRAWLBRIEF_API_TOKEN = 'api-token';

    const { config } = await import('../../src/config.js');

    expect(config.CRAWLBRIEF_PORT).toBe(3001);
    expect(config.CRAWLBRIEF_LLM_PROVIDER).toBe('openai');
    expect(config.CRAWLBRIEF_OPENAI_MODEL).toBe('gpt-4o-mini');
    expect(config.CRAWLBRIEF_LOG_LEVEL).toBe('info');
  });

  it('should coerce port to number', async () => {
    process.env.CRAWLBRIEF_PORT = '4000';
    process.env.CRAWLBRIEF_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.CRAWLBRIEF_GATEWAY_TOKEN = 'test-token';
    process.env.CRAWLBRIEF_OPENAI_API_KEY = 'test-key';
    process.env.CRAWLBRIEF_SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.CRAWLBRIEF_SLACK_CHANNEL_ID = 'C12345';
    process.env.CRAWLBRIEF_API_TOKEN = 'api-token';

    const { config } = await import('../../src/config.js');

    expect(config.CRAWLBRIEF_PORT).toBe(4000);
    expect(typeof config.CRAWLBRIEF_PORT).toBe('number');
  });

  it('should validate LLM provider enum', async () => {
    process.env.CRAWLBRIEF_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.CRAWLBRIEF_GATEWAY_TOKEN = 'test-token';
    process.env.CRAWLBRIEF_LLM_PROVIDER = 'anthropic';
    process.env.CRAWLBRIEF_ANTHROPIC_API_KEY = 'test-key';
    process.env.CRAWLBRIEF_SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.CRAWLBRIEF_SLACK_CHANNEL_ID = 'C12345';
    process.env.CRAWLBRIEF_API_TOKEN = 'api-token';

    const { config } = await import('../../src/config.js');

    expect(config.CRAWLBRIEF_LLM_PROVIDER).toBe('anthropic');
  });
});
