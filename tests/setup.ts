import { vi } from 'vitest';

// Mock environment variables for tests
vi.stubEnv('CRAWLBRIEF_PORT', '3001');
vi.stubEnv('CRAWLBRIEF_DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
vi.stubEnv('CRAWLBRIEF_GATEWAY_URL', 'http://localhost:3000');
vi.stubEnv('CRAWLBRIEF_GATEWAY_TOKEN', 'test-gateway-token');
vi.stubEnv('CRAWLBRIEF_LLM_PROVIDER', 'openai');
vi.stubEnv('CRAWLBRIEF_OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('CRAWLBRIEF_OPENAI_MODEL', 'gpt-4o-mini');
vi.stubEnv('CRAWLBRIEF_ANTHROPIC_API_KEY', 'test-anthropic-key');
vi.stubEnv('CRAWLBRIEF_ANTHROPIC_MODEL', 'claude-3-haiku-20240307');
vi.stubEnv('CRAWLBRIEF_CF_AI_GATEWAY_URL', 'https://gateway.ai.cloudflare.com/v1/test/test-gateway');
vi.stubEnv('CRAWLBRIEF_CF_AI_GATEWAY_TOKEN', 'test-cf-token');
vi.stubEnv('CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK', 'true');
vi.stubEnv('CRAWLBRIEF_SLACK_BOT_TOKEN', 'xoxb-test-token');
vi.stubEnv('CRAWLBRIEF_SLACK_CHANNEL_ID', 'C12345678');
vi.stubEnv('CRAWLBRIEF_API_TOKEN', 'test-api-token');
vi.stubEnv('CRAWLBRIEF_LOG_LEVEL', 'error');
