# CrawlBrief Setup Guide

CrawlBrief monitors competitor websites for product updates and sends summaries to Slack. It consists of three services:

1. **Firecrawl** (port 3002) — Web scraping engine
2. **Firecrawl Gateway** (port 3000) — Auth, webhook signing, proxy to Firecrawl
3. **CrawlBrief** (port 3001) — Monitoring logic, LLM summarization, Slack notifications

## Architecture

```
Cron/Manual Trigger
        |
        v
   CrawlBrief ──> Gateway ──> Firecrawl ──> Web
        ^              ^           |
        |              |           v
        |              +── webhook (scrape results)
        |                          |
        +── signed webhook ────────+
        |
        v
   LLM (Azure/Anthropic/OpenAI) ──> Slack
```

---

## Prerequisites

- Docker & Docker Compose
- Node.js 20+ and pnpm (for local development)
- A Slack app with bot token
- An LLM API key (Azure AI Foundry, Anthropic, or OpenAI)

---

## 1. Firecrawl Setup

Clone and start the self-hosted Firecrawl instance.

```bash
cd /path/to/firecrawl

# Create .env to allow webhooks to private addresses (required for gateway communication)
echo "ALLOW_LOCAL_WEBHOOKS=true" > .env

# Start Firecrawl
docker compose up -d
```

Verify it's running:

```bash
curl -X POST http://localhost:3002/v1/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

> **Note:** The `ALLOW_LOCAL_WEBHOOKS=true` must also be added to the `x-common-env` section of Firecrawl's `docker-compose.yaml` if it's not already there, so the API container (not just playwright) can send webhooks to private addresses.

---

## 2. Firecrawl Gateway Setup

### Generate secrets

```bash
# Generate API token
openssl rand -hex 32
# Example: 3c580c424aabf16bf103f055d62fb6cc9734147e1a229593fabf2ce65b0a1370

# Generate webhook secret
openssl rand -hex 32
# Example: 351fa68001ba4ec1e07e5881eb81c0316452f6715ea84e1f2d604d7143fd75bb
```

### Configure environment

```bash
cd /path/to/firecrawl-gateway
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
LOG_LEVEL=info

# Gateway base URL — how Firecrawl reaches the gateway for webhooks
# Local dev (gateway running with pnpm dev, Firecrawl in Docker):
FIRECRAWL_GATEWAY_BASE_URL=http://host.docker.internal:3000
# VPS (both on same machine):
# FIRECRAWL_GATEWAY_BASE_URL=http://localhost:3000

# Allow localhost webhooks (required for local dev)
ALLOW_LOCAL_WEBHOOKS=true

# Auth tokens
FIRECRAWL_GATEWAY_API_TOKENS=<your-generated-token>
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"<your-generated-token>"}

# Webhook signing secret (must match CRAWLBRIEF_WEBHOOK_SECRET in crawlbrief)
FIRECRAWL_GATEWAY_WEBHOOK_SECRET=<your-generated-webhook-secret>

# Firecrawl URL
# Local dev (gateway running with pnpm dev): use localhost
FIRECRAWL_URL=http://localhost:3002
# Local dev (gateway running in Docker): use host.docker.internal
# FIRECRAWL_URL=http://host.docker.internal:3002
# VPS: use localhost (both on same machine)
# FIRECRAWL_URL=http://localhost:3002
```

### Run (local development)

```bash
pnpm install
pnpm dev
```

### Run (Docker)

```bash
docker compose up -d
```

> **Note:** When running the gateway in Docker, set `FIRECRAWL_URL=http://host.docker.internal:3002` in `.env` since `localhost` inside Docker refers to the container itself.

---

## 3. CrawlBrief Setup

### Start PostgreSQL

For local development:

```bash
cd /path/to/crawlbrief
docker compose up -d   # Starts postgres on port 5433
```

### Configure environment

```bash
cp .env.example .env   # If .env.example exists, otherwise create manually
```

Edit `.env`:

```env
# Server
CRAWLBRIEF_PORT=3001
CRAWLBRIEF_BASE_URL=http://localhost:3001

# Database (local dev uses port 5433 from docker-compose.yml)
CRAWLBRIEF_DATABASE_URL=postgresql://crawlbrief:crawlbrief@localhost:5433/crawlbrief

# Gateway connection (must match gateway's token)
CRAWLBRIEF_GATEWAY_URL=http://localhost:3000
CRAWLBRIEF_GATEWAY_TOKEN=<same-token-as-FIRECRAWL_GATEWAY_API_TOKENS>

# LLM Provider — choose one: azure, anthropic, or openai
CRAWLBRIEF_LLM_PROVIDER=azure

# Azure AI Foundry
CRAWLBRIEF_AZURE_MODEL_URL=https://your-resource.openai.azure.com/openai/v1
CRAWLBRIEF_AZURE_MODEL_KEY=<your-azure-key>
CRAWLBRIEF_AZURE_MODEL=<your-model-deployment-name>

# Anthropic (alternative)
# CRAWLBRIEF_LLM_PROVIDER=anthropic
# CRAWLBRIEF_ANTHROPIC_API_KEY=sk-ant-...
# CRAWLBRIEF_ANTHROPIC_MODEL=claude-3-haiku-20240307

# OpenAI (alternative)
# CRAWLBRIEF_LLM_PROVIDER=openai
# CRAWLBRIEF_OPENAI_API_KEY=sk-...
# CRAWLBRIEF_OPENAI_MODEL=gpt-4o-mini

# Cloudflare AI Gateway (optional, for Anthropic/OpenAI proxying)
# CRAWLBRIEF_CF_AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<account>/<gateway>
# CRAWLBRIEF_CF_AI_GATEWAY_TOKEN=<cf-token>
# CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK=false

# Slack
CRAWLBRIEF_SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
CRAWLBRIEF_SLACK_CHANNEL_ID=C0XXXXXXXXX

# API auth for manual trigger endpoint
CRAWLBRIEF_API_TOKEN=<any-secret-string>

# Webhook signing (must match FIRECRAWL_GATEWAY_WEBHOOK_SECRET in gateway)
CRAWLBRIEF_WEBHOOK_SECRET=<same-as-gateway-webhook-secret>

# Timezone for cron schedules
CRAWLBRIEF_TIMEZONE=Pacific/Auckland

CRAWLBRIEF_LOG_LEVEL=info
```

### Run database migrations

```bash
pnpm install
pnpm db:migrate
```

### Run (local development)

```bash
pnpm dev
```

### Run (Docker / VPS)

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## 4. Verify the Setup

### Test the full flow

```bash
# Trigger a monitor run
curl -X POST http://localhost:3001/run/ziflow

# Check logs
# Terminal 1: crawlbrief logs (pnpm dev shows them)
# Terminal 2: gateway logs (pnpm dev or docker compose logs -f)
# Terminal 3: firecrawl logs (docker logs -f firecrawl-api-1)
```

### Expected flow

1. CrawlBrief sends batch scrape request to Gateway
2. Gateway forwards to Firecrawl
3. Firecrawl scrapes the page, sends webhook to Gateway
4. Gateway signs webhook, forwards to CrawlBrief
5. CrawlBrief uses LLM to extract article URLs
6. CrawlBrief sends another batch scrape for new article URLs
7. Each article is scraped, summarized by LLM, and queued for Slack
8. Notification processor sends Slack messages (runs every minute)

### Test individual endpoints

```bash
# Gateway: scrape a single URL
curl -X POST http://localhost:3000/scrape \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "formats": ["markdown"]}'

# Gateway: health check
curl http://localhost:3000/health

# CrawlBrief: health check
curl http://localhost:3001/health
```

---

## 5. Switching LLM Providers

CrawlBrief supports three LLM providers. Switch by changing env vars in `.env` — no code changes needed.

### Option A: Azure AI Foundry

```env
CRAWLBRIEF_LLM_PROVIDER=azure
CRAWLBRIEF_AZURE_MODEL_URL=https://your-resource.openai.azure.com/openai/v1
CRAWLBRIEF_AZURE_MODEL_KEY=<your-azure-key>
CRAWLBRIEF_AZURE_MODEL=<your-deployment-name>
```

### Option B: Anthropic (direct)

```env
CRAWLBRIEF_LLM_PROVIDER=anthropic
CRAWLBRIEF_ANTHROPIC_API_KEY=sk-ant-...
CRAWLBRIEF_ANTHROPIC_MODEL=claude-3-haiku-20240307
```

### Option C: Anthropic via Cloudflare AI Gateway

Cloudflare AI Gateway is an optional proxy that adds caching, analytics, and rate limiting. It sits in front of Anthropic or OpenAI — it is not a provider itself.

```env
CRAWLBRIEF_LLM_PROVIDER=anthropic
CRAWLBRIEF_ANTHROPIC_API_KEY=sk-ant-...
CRAWLBRIEF_ANTHROPIC_MODEL=claude-3-haiku-20240307

# Cloudflare AI Gateway (routes requests through Cloudflare)
CRAWLBRIEF_CF_AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>
CRAWLBRIEF_CF_AI_GATEWAY_TOKEN=<cloudflare-api-token>
CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK=false
```

### Option D: OpenAI (direct or via Cloudflare)

```env
CRAWLBRIEF_LLM_PROVIDER=openai
CRAWLBRIEF_OPENAI_API_KEY=sk-...
CRAWLBRIEF_OPENAI_MODEL=gpt-4o-mini

# Optional: add Cloudflare AI Gateway (same as Option C)
# CRAWLBRIEF_CF_AI_GATEWAY_URL=...
# CRAWLBRIEF_CF_AI_GATEWAY_TOKEN=...
# CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK=false
```

### How the layers work

```
Azure:      CrawlBrief ──> Azure AI Foundry ──> Model
Anthropic:  CrawlBrief ──> Anthropic API ──> Model
With CF:    CrawlBrief ──> Cloudflare AI Gateway ──> Anthropic/OpenAI API ──> Model
```

> **Tip:** Unused provider env vars can stay in `.env` — they're ignored when a different `CRAWLBRIEF_LLM_PROVIDER` is selected. Comment them out or leave them.

---

## 6. Database Management

### Backup

```bash
# Full backup (schema + data)
docker exec <postgres-container> pg_dump -U crawlbrief -d crawlbrief > crawlbrief-backup.sql

# Data only (if schema exists from migrations)
docker exec <postgres-container> pg_dump -U crawlbrief -d crawlbrief --data-only > crawlbrief-data.sql
```

### Restore on a new machine

```bash
# 1. Start postgres and run migrations first
docker compose -f docker-compose.prod.yml up -d postgres
pnpm db:migrate:prod  # or let the app run migrations on start

# 2. Restore data
cat crawlbrief-data.sql | docker exec -i <postgres-container> psql -U crawlbrief -d crawlbrief
```

### Transfer to VPS

```bash
# On local machine: export
docker exec crawlbrief-postgres-local pg_dump -U crawlbrief -d crawlbrief > crawlbrief-backup.sql

# Copy to VPS
scp crawlbrief-backup.sql user@your-vps:/path/to/crawlbrief/

# On VPS: import (after postgres is running and migrations are applied)
cat crawlbrief-backup.sql | docker exec -i crawlbrief-postgres psql -U crawlbrief -d crawlbrief
```

### Useful queries

```bash
# List articles
docker exec <postgres-container> psql -U crawlbrief -d crawlbrief \
  -c "SELECT id, title, first_seen_at FROM articles ORDER BY first_seen_at DESC LIMIT 10;"

# Count articles per monitor
docker exec <postgres-container> psql -U crawlbrief -d crawlbrief \
  -c "SELECT monitor_id, COUNT(*) FROM articles GROUP BY monitor_id;"

# Check recent crawl runs
docker exec <postgres-container> psql -U crawlbrief -d crawlbrief \
  -c "SELECT id, monitor_id, status, articles_found, new_articles, completed_at FROM crawl_runs ORDER BY id DESC LIMIT 10;"

# Check pending notifications
docker exec <postgres-container> psql -U crawlbrief -d crawlbrief \
  -c "SELECT id, status, channel FROM notifications WHERE status = 'pending';"

# Clear all data for a monitor (to re-run from scratch)
docker exec <postgres-container> psql -U crawlbrief -d crawlbrief -c "
  DELETE FROM notifications WHERE article_id IN (SELECT id FROM articles WHERE monitor_id = 'ziflow');
  DELETE FROM summaries WHERE article_id IN (SELECT id FROM articles WHERE monitor_id = 'ziflow');
  DELETE FROM article_content WHERE article_id IN (SELECT id FROM articles WHERE monitor_id = 'ziflow');
  DELETE FROM articles WHERE monitor_id = 'ziflow';
  DELETE FROM scrape_jobs WHERE monitor_id = 'ziflow';
  DELETE FROM crawl_runs WHERE monitor_id = 'ziflow';
"
```

---

## 7. Adding New Monitors

Edit `src/monitors.config.ts`:

```typescript
{
  id: 'competitor-name',        // Unique ID (used in API and DB)
  name: 'Competitor Updates',   // Display name
  listingUrl: 'https://competitor.com/blog/updates',
  schedule: '0 9 * * *',       // Cron: daily at 9am
  enabled: true,
  // Optional: custom extraction prompt (only needed if the page has mixed content)
  // extractionPrompt: 'Your custom prompt here... Base URL: {{BASE_URL}}',
},
```

After adding, restart crawlbrief and trigger manually:

```bash
curl -X POST http://localhost:3001/run/competitor-name
```

---

## 8. VPS Deployment

On the VPS, start services in this order:

```bash
# 1. Firecrawl
cd /path/to/firecrawl
docker compose up -d

# 2. Gateway
cd /path/to/firecrawl-gateway
docker compose up -d

# 3. CrawlBrief
cd /path/to/crawlbrief
docker compose -f docker-compose.prod.yml up -d
```

### VPS-specific .env differences

**Gateway `.env`:**
```env
# Both services on same host, no Docker networking issues
FIRECRAWL_URL=http://localhost:3002
FIRECRAWL_GATEWAY_BASE_URL=http://localhost:3000
ALLOW_LOCAL_WEBHOOKS=true
```

**CrawlBrief `.env`:**
```env
# Database URL is handled by docker-compose.prod.yml (connects via Docker network)
# Gateway on same host
CRAWLBRIEF_GATEWAY_URL=http://host.docker.internal:3000
CRAWLBRIEF_BASE_URL=http://host.docker.internal:3001
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Gateway can't reach Firecrawl | Docker networking | Use `host.docker.internal:3002` when gateway is in Docker |
| Firecrawl webhook fails | SSRF protection | Set `ALLOW_LOCAL_WEBHOOKS=true` in Firecrawl's `.env` and `x-common-env` in its docker-compose |
| Webhook signature invalid | Secret mismatch | Ensure `FIRECRAWL_GATEWAY_WEBHOOK_SECRET` = `CRAWLBRIEF_WEBHOOK_SECRET` |
| LLM returns truncated JSON | Output too large | Increase `max_tokens` or trim input markdown |
| Slack notifications not sending | Pending in DB | Check `notifications` table; processor runs every minute |
| `z.coerce.boolean()` ignores "false" | Zod string coercion | Use `.transform((val) => val === 'true')` instead |
