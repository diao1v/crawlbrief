# CrawlBrief

A self-hosted TypeScript application for monitoring competitor websites, extracting new content using AI, and delivering summaries to Slack.

## Overview

CrawlBrief integrates with home-made Firecrawl Gateway to monitor listing pages (e.g., blog indexes, changelog pages), detect new articles using change tracking, extract and summarize content with LLMs, and send notifications to Slack.

## Features

- **Scheduled Monitoring**: Cron-based scheduling for each monitor
- **Change Detection**: Uses Firecrawl's change tracking to skip unchanged content
- **AI-Powered Extraction**: LLM extracts article URLs from listing pages
- **AI-Powered Summarization**: Generates headlines, summaries, key features, and relevance scores
- **Slack Notifications**: Rich formatted messages with category emojis
- **Webhook Support**: Async batch scraping with webhook callbacks
- **Retry Logic**: Automatic retries for transient failures
- **Deduplication**: Prevents processing the same article twice

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Cron Jobs     │────>│  Monitor Runner  │────>│ Firecrawl       │
│  (node-cron)    │     │                  │     │ Gateway         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                        │
                               v                        │
                        ┌──────────────────┐            │
                        │   LLM Provider   │            │
                        │ (OpenAI/Claude)  │            │
                        └──────────────────┘            │
                               │                        │
                               v                        v
                        ┌──────────────────┐     ┌─────────────────┐
                        │   PostgreSQL     │<────│   Webhooks      │
                        │   Database       │     │   /firecrawl    │
                        └──────────────────┘     └─────────────────┘
                               │
                               v
                        ┌──────────────────┐     ┌─────────────────┐
                        │  Notification    │────>│     Slack       │
                        │  Processor       │     │                 │
                        └──────────────────┘     └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Firecrawl Gateway running
- Slack Bot Token
- Cloudflare AI Gateway with BYOK (recommended) or OpenAI/Anthropic API key

### Installation

```bash
# Clone and install
git clone <repo-url>
cd crawlbrief
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Docker Deployment

```bash
# Start with Docker Compose
docker-compose up -d

# Or for production
docker-compose -f docker-compose.prod.yml up -d
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CRAWLBRIEF_PORT` | No | `3001` | HTTP server port |
| `CRAWLBRIEF_BASE_URL` | No* | - | Public URL for webhooks |
| `CRAWLBRIEF_DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `CRAWLBRIEF_GATEWAY_URL` | No | `http://localhost:3000` | Firecrawl Gateway URL |
| `CRAWLBRIEF_GATEWAY_TOKEN` | Yes | - | Gateway authentication token |
| `CRAWLBRIEF_LLM_PROVIDER` | No | `openai` | `openai` or `anthropic` |
| `CRAWLBRIEF_OPENAI_API_KEY` | If not BYOK | - | OpenAI API key (only if USE_BYOK=false) |
| `CRAWLBRIEF_OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model |
| `CRAWLBRIEF_ANTHROPIC_API_KEY` | If not BYOK | - | Anthropic API key (only if USE_BYOK=false) |
| `CRAWLBRIEF_ANTHROPIC_MODEL` | No | `claude-3-haiku-20240307` | Anthropic model |
| `CRAWLBRIEF_CF_AI_GATEWAY_URL` | If BYOK | - | Cloudflare AI Gateway URL |
| `CRAWLBRIEF_CF_AI_GATEWAY_TOKEN` | If BYOK | - | Cloudflare AI Gateway auth token |
| `CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK` | No | `true` | Use BYOK mode (API keys stored in Cloudflare) |
| `CRAWLBRIEF_SLACK_BOT_TOKEN` | Yes | - | Slack bot token (xoxb-) |
| `CRAWLBRIEF_SLACK_CHANNEL_ID` | Yes | - | Slack channel ID |
| `CRAWLBRIEF_API_TOKEN` | Yes | - | API authentication token |
| `CRAWLBRIEF_WEBHOOK_SECRET` | No* | - | Webhook signature secret |
| `CRAWLBRIEF_LOG_LEVEL` | No | `info` | Log level |
| `CRAWLBRIEF_TIMEZONE` | No | `Pacific/Auckland` | IANA timezone for cron schedules |

*`CRAWLBRIEF_BASE_URL` is required for async webhook mode. Without it, the system falls back to synchronous polling.

*`CRAWLBRIEF_WEBHOOK_SECRET` is recommended for production to verify webhook authenticity.

**BYOK Mode (Default)**: API keys are stored in Cloudflare AI Gateway instead of your `.env` file. This provides better security, centralized key management, and usage analytics. Set `CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK=false` to use local API keys instead.

### Monitor Configuration

Edit `src/monitors.config.ts` to define monitors:

```typescript
export const monitors: MonitorConfig[] = [
  {
    id: 'competitor-blog',
    name: 'Competitor Blog',
    listingUrl: 'https://competitor.com/blog',
    schedule: '0 9 * * *', // Daily at 9 AM
    enabled: true,
    extractionPrompt: 'Extract blog post URLs and titles...',
    summaryPrompt: 'Summarize this blog post...',
  },
];
```

## API Endpoints

### Health Check

```
GET /health
```

Returns server health status.

### Trigger Monitor Run

```
POST /trigger/:monitorId
Authorization: Bearer <CRAWLBRIEF_API_TOKEN>
```

Manually trigger a monitor run.

**Query Parameters:**
- `sync=true` - Run synchronously (for testing)

### Firecrawl Webhook

```
POST /webhooks/firecrawl
X-Webhook-Signature: <hmac-sha256-signature>
```

Receives webhook callbacks from Firecrawl Gateway.

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `monitors` | Monitor configurations (synced from config file) |
| `crawl_runs` | Execution history for each monitor run |
| `listing_content` | Raw listing page content |
| `articles` | Discovered article identities |
| `article_content` | Raw scraped article content |
| `summaries` | AI-generated summaries |
| `notifications` | Slack delivery history |
| `scrape_jobs` | Async batch scrape job tracking |

### Migrations

```bash
# Generate migration after schema changes
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

## Business Logic Flow

### 1. Scheduled Run

1. Cron triggers `MonitorRunner.startRun()`
2. Retries any failed notifications from previous runs
3. Creates `crawl_run` record
4. Submits batch scrape for listing page with change tracking
5. Webhook receives results asynchronously

### 2. Listing Page Processing

1. Webhook receives listing page content
2. Checks change status (`new`, `changed`, `same`, `removed`)
3. If unchanged, completes run early
4. LLM extracts article URLs from markdown
5. Filters out already-seen URLs
6. Submits batch scrape for new articles

### 3. Article Processing

1. Webhook receives article content
2. Inserts article record (with conflict handling)
3. LLM generates summary with:
   - Headline
   - Summary paragraph
   - Key features (bullet points)
   - Category (feature/improvement/announcement/other)
   - Relevance score (1-10)
4. Queues notification

### 4. Notification Delivery

1. Cron runs every minute
2. Selects pending notifications with row-level locking
3. Sends Slack message with rich formatting
4. Updates notification status
5. Failed notifications are retried (up to 3 attempts)

## Development

### Scripts

```bash
pnpm dev          # Start dev server with hot reload
pnpm build        # Compile TypeScript
pnpm start        # Run production build
pnpm test         # Run tests in watch mode
pnpm test:run     # Run tests once
pnpm typecheck    # Type check without emitting
pnpm lint         # Run ESLint
```

### Project Structure

```
src/
├── app.ts              # Hono app setup
├── config.ts           # Environment configuration
├── cron.ts             # Cron scheduler
├── index.ts            # Entry point
├── monitors.config.ts  # Monitor definitions
├── db/
│   ├── index.ts        # Database connection
│   ├── migrate.ts      # Migration runner
│   └── schema.ts       # Drizzle schema
├── lib/
│   ├── errors.ts       # Custom error classes
│   ├── logger.ts       # Pino logger
│   └── retry.ts        # Retry utility
├── middleware/
│   ├── auth.ts         # Bearer token auth
│   ├── logger.ts       # Request logging
│   └── request-id.ts   # Request ID generation
├── monitor/
│   ├── runner.ts       # Monitor execution logic
│   └── types.ts        # Monitor types
├── routes/
│   ├── health.ts       # Health check endpoint
│   ├── trigger.ts      # Manual trigger endpoint
│   └── webhooks.ts     # Firecrawl webhook handler
├── schemas/
│   ├── extraction.ts   # Article extraction schema
│   └── summary.ts      # Summary schema
├── services/
│   ├── gateway-client.ts  # Firecrawl Gateway client
│   ├── slack.ts           # Slack service
│   └── llm/
│       ├── index.ts       # LLM provider factory
│       ├── anthropic.ts   # Anthropic provider
│       ├── openai.ts      # OpenAI provider
│       ├── prompts.ts     # Prompt templates
│       └── types.ts       # LLM types
└── types/
    ├── hono.ts         # Hono app types
    └── index.ts        # Shared types
```

## Security

### Webhook Authentication

Webhooks are authenticated using HMAC-SHA256 signatures:

1. Set `CRAWLBRIEF_WEBHOOK_SECRET` (min 16 characters)
2. Configure the same secret in Firecrawl Gateway
3. Gateway signs payloads with `X-Webhook-Signature` header
4. CrawlBrief verifies signature before processing

### API Authentication

Protected endpoints require Bearer token authentication:

```bash
curl -H "Authorization: Bearer $CRAWLBRIEF_API_TOKEN" \
  http://localhost:3001/trigger/my-monitor
```

## Error Handling

### Retry Logic

The following errors are automatically retried:
- `TimeoutError` - Request timeouts
- `GatewayError` with status 502, 503, 504
- Network errors (fetch failed, ECONNREFUSED)

Default retry configuration:
- Max attempts: 3
- Base delay: 1000ms
- Max delay: 10000ms
- Exponential backoff with jitter

### Failed Notifications

Notifications that fail to send are:
1. Marked as `failed` with error message
2. Retried on next monitor run (up to 3 attempts)
3. Can be manually retried via trigger endpoint

## Monitoring

### Logs

CrawlBrief uses Pino for structured logging:

```bash
# Pretty logs in development
pnpm dev

# JSON logs in production
NODE_ENV=production pnpm start
```

### Database Queries

Use Drizzle Studio for database inspection:

```bash
pnpm db:studio
```

## Testing

```bash
# Run all tests
pnpm test:run

# Run tests in watch mode
pnpm test

# Run with coverage
pnpm test:run --coverage
```

### Test Coverage

- **117 unit tests** covering:
  - Configuration validation
  - Error classes
  - Retry utility with `isRetryableError`
  - LLM providers (OpenAI, Anthropic)
  - Gateway client
  - Slack service
  - Schema validation (extraction, summary)
  - Monitor configuration
  - Middleware (auth, request-id)
  - Health routes