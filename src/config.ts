import { z } from 'zod';

const envSchema = z.object({
  // Server
  CRAWLBRIEF_PORT: z.coerce.number().default(3001),
  CRAWLBRIEF_BASE_URL: z.string().url().optional(),

  // Database
  CRAWLBRIEF_DATABASE_URL: z.string().url(),

  // Firecrawl Gateway
  CRAWLBRIEF_GATEWAY_URL: z.string().url().default('http://localhost:3000'),
  CRAWLBRIEF_GATEWAY_TOKEN: z.string().min(1),

  // LLM Provider
  CRAWLBRIEF_LLM_PROVIDER: z.enum(['openai', 'anthropic', 'azure']).default('openai'),
  CRAWLBRIEF_OPENAI_API_KEY: z.string().optional(),
  CRAWLBRIEF_OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  CRAWLBRIEF_ANTHROPIC_API_KEY: z.string().optional(),
  CRAWLBRIEF_ANTHROPIC_MODEL: z.string().default('claude-3-haiku-20240307'),

  // Azure AI Foundry (OpenAI-compatible endpoint)
  CRAWLBRIEF_AZURE_MODEL_URL: z.string().url().optional(),
  CRAWLBRIEF_AZURE_MODEL_KEY: z.string().optional(),
  CRAWLBRIEF_AZURE_MODEL: z.string().optional(),

  // Cloudflare AI Gateway (optional - proxies requests through Cloudflare for caching, analytics, rate limiting)
  // Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}
  CRAWLBRIEF_CF_AI_GATEWAY_URL: z.string().url().optional(),
  // Authentication token for Cloudflare AI Gateway (required if gateway authentication is enabled)
  CRAWLBRIEF_CF_AI_GATEWAY_TOKEN: z.string().optional(),
  // Use BYOK (Bring Your Own Keys) - API keys stored in Cloudflare, not in .env
  // When true, you don't need OPENAI_API_KEY or ANTHROPIC_API_KEY in .env
  CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK: z.string().default('true').transform((val) => val === 'true'),

  // Slack
  CRAWLBRIEF_SLACK_BOT_TOKEN: z.string().startsWith('xoxb-'),
  CRAWLBRIEF_SLACK_CHANNEL_ID: z.string().min(1),

  // API Authentication
  CRAWLBRIEF_API_TOKEN: z.string().min(1),
  CRAWLBRIEF_WEBHOOK_SECRET: z.string().min(16).optional(),

  // Logging
  CRAWLBRIEF_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Timezone for cron schedules (IANA timezone name)
  CRAWLBRIEF_TIMEZONE: z.string().default('Pacific/Auckland'),
});

function validateLLMConfig(config: z.infer<typeof envSchema>) {
  const usingByok = config.CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK;

  // When using BYOK, API keys are stored in Cloudflare - not required in .env
  if (usingByok) {
    if (!config.CRAWLBRIEF_CF_AI_GATEWAY_URL) {
      console.error('Invalid environment configuration:');
      console.error('  - CRAWLBRIEF_CF_AI_GATEWAY_URL is required when using BYOK mode');
      process.exit(1);
    }
    if (!config.CRAWLBRIEF_CF_AI_GATEWAY_TOKEN) {
      console.error('Invalid environment configuration:');
      console.error('  - CRAWLBRIEF_CF_AI_GATEWAY_TOKEN is required when using BYOK mode');
      process.exit(1);
    }
    return; // API keys not required when using BYOK
  }

  // Standard mode: API keys required in .env
  if (config.CRAWLBRIEF_LLM_PROVIDER === 'openai' && !config.CRAWLBRIEF_OPENAI_API_KEY) {
    console.error('Invalid environment configuration:');
    console.error('  - CRAWLBRIEF_OPENAI_API_KEY is required when CRAWLBRIEF_LLM_PROVIDER is openai');
    process.exit(1);
  }

  if (config.CRAWLBRIEF_LLM_PROVIDER === 'anthropic' && !config.CRAWLBRIEF_ANTHROPIC_API_KEY) {
    console.error('Invalid environment configuration:');
    console.error('  - CRAWLBRIEF_ANTHROPIC_API_KEY is required when CRAWLBRIEF_LLM_PROVIDER is anthropic');
    process.exit(1);
  }

  if (config.CRAWLBRIEF_LLM_PROVIDER === 'azure') {
    if (!config.CRAWLBRIEF_AZURE_MODEL_URL || !config.CRAWLBRIEF_AZURE_MODEL_KEY || !config.CRAWLBRIEF_AZURE_MODEL) {
      console.error('Invalid environment configuration:');
      console.error('  - CRAWLBRIEF_AZURE_MODEL_URL, CRAWLBRIEF_AZURE_MODEL_KEY, and CRAWLBRIEF_AZURE_MODEL are required when CRAWLBRIEF_LLM_PROVIDER is azure');
      process.exit(1);
    }
  }
}

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  validateLLMConfig(result.data);

  return result.data;
}

export const config = loadConfig();

export type Config = z.infer<typeof envSchema>;
