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

Two supported topologies. Pick one:

- **Option A — Single VPS** (recommended for ≤10 monitors): all three services on one host. Simplest networking, one machine to maintain.
- **Option B — Two VPS via Tailscale**: Firecrawl + Gateway on VPS 1, CrawlBrief on VPS 2. Useful if Firecrawl's resource usage (RAM, CPU spikes from Playwright) is competing with CrawlBrief, or for compliance/isolation reasons.

The code is identical for both — only env vars and bring-up order differ.

### Bring-up order (same for both topologies)

Always start in this order so each service is ready when the next one needs it:

1. **Firecrawl** (the actual scraper + its supporting containers: redis, rabbitmq, postgres, playwright)
2. **Firecrawl Gateway** (depends on Firecrawl being reachable)
3. **CrawlBrief** (depends on Gateway being reachable)

---

### Option A — Single VPS

All three stacks live on the same machine. Each container reaches the others via `host.docker.internal` (the docker bridge gateway), which routes to the host's published ports on `127.0.0.1`.

**Why `host.docker.internal` and not `localhost`?** Inside a container, `localhost` means the container itself, not the host. `host.docker.internal` is a special hostname provided by Docker that resolves to the host. Each compose file already includes:

```yaml
extra_hosts:
  - 'host.docker.internal:host-gateway'
```

…which makes this work on Linux (it's automatic on macOS/Windows).

**Firecrawl `.env`:**
```env
ALLOW_LOCAL_WEBHOOKS=true
```
And confirm the same line appears in `x-common-env` of Firecrawl's `docker-compose.yaml`.

**Gateway `.env`:**
```env
PORT=3000
FIRECRAWL_URL=http://host.docker.internal:3002
FIRECRAWL_GATEWAY_BASE_URL=http://host.docker.internal:3000
ALLOW_LOCAL_WEBHOOKS=true

FIRECRAWL_GATEWAY_API_TOKENS=<token>
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"<token>"}
FIRECRAWL_GATEWAY_WEBHOOK_SECRET=<secret>
```

**CrawlBrief `.env`:**
```env
CRAWLBRIEF_PORT=3001
CRAWLBRIEF_BASE_URL=http://host.docker.internal:3001
CRAWLBRIEF_GATEWAY_URL=http://host.docker.internal:3000
CRAWLBRIEF_GATEWAY_TOKEN=<same as FIRECRAWL_GATEWAY_API_TOKENS>
CRAWLBRIEF_WEBHOOK_SECRET=<same as FIRECRAWL_GATEWAY_WEBHOOK_SECRET>
# DB URL is set by docker-compose.prod.yml — postgres reachable via the docker network
# ...plus Slack, LLM provider env vars
```

**Bring up:**
```bash
# 1. Firecrawl (slow first build — Playwright pulls Chromium, can take 5–15 min)
cd /server/projects/firecrawl
sudo docker compose up -d --build
sudo docker compose ps                    # wait for healthy

# 2. Gateway
cd /server/projects/firecrawl-gateway
sudo docker compose up -d --build
curl http://localhost:3000/health         # expect {"status":"ok"}

# 3. CrawlBrief (apply migrations on first run)
cd /server/projects/crawlbrief
sudo docker compose -f docker-compose.prod.yml up -d
sudo docker compose -f docker-compose.prod.yml exec crawlbrief node dist/db/migrate.js
```

**Smoke test:**
```bash
curl -X POST -H "Authorization: Bearer $CRAWLBRIEF_API_TOKEN" \
  http://localhost:3001/run/<monitor-id>
sudo docker logs -f crawlbrief --tail=50
```

Expected log chain: monitor run started → batch scrape submitted → `webhooks/firecrawl` `type:page` received → LLM extraction → `Crawl run completed`.

---

### Option B — Two VPS via Tailscale

VPS 1 runs Firecrawl + Gateway. VPS 2 runs CrawlBrief. The two communicate over Tailscale's private network, which gives each VPS a stable internal IP (100.x.x.x) regardless of public IP changes.

**Why Tailscale?** Avoids exposing the Gateway publicly. The Gateway has its own auth, but keeping the listening port off the public internet removes a class of attack surface. Tailscale also handles dynamic IPs — useful when one of your VPS doesn't have a fixed public address.

**Setup Tailscale:**
```bash
# On both VPS
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale ip -4    # note each VPS's 100.x.x.x address
```

For the rest of this section, assume:
- VPS 1 (Firecrawl + Gateway) Tailscale IP: `100.125.237.65`
- VPS 2 (CrawlBrief) Tailscale IP: `100.84.191.119`

#### VPS 1 — Firecrawl + Gateway

**Firecrawl `.env`:** same as Option A (`ALLOW_LOCAL_WEBHOOKS=true`, plus the `x-common-env` line in compose).

**Gateway `.env`:**
```env
PORT=3000
FIRECRAWL_URL=http://host.docker.internal:3002
# Tell Firecrawl to send webhooks back to gateway via Tailscale
FIRECRAWL_GATEWAY_BASE_URL=http://100.125.237.65:3000
ALLOW_LOCAL_WEBHOOKS=true

FIRECRAWL_GATEWAY_API_TOKENS=<token>
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"<token>"}
FIRECRAWL_GATEWAY_WEBHOOK_SECRET=<secret>
```

**Gateway `docker-compose.yml` — bind to Tailscale IP only** (don't expose publicly):
```yaml
ports:
  - '100.125.237.65:3000:3000'
```

**Bring up VPS 1:**
```bash
cd /server/projects/firecrawl && sudo docker compose up -d --build
cd /server/projects/firecrawl-gateway && sudo docker compose up -d --build
# From VPS 2, verify reachability:
# curl http://100.125.237.65:3000/health
```

#### VPS 2 — CrawlBrief

**CrawlBrief `.env`:**
```env
CRAWLBRIEF_PORT=3001
# CrawlBrief's webhook URL — gateway forwards results here over Tailscale
CRAWLBRIEF_BASE_URL=http://100.84.191.119:3001
# Gateway lives on VPS 1
CRAWLBRIEF_GATEWAY_URL=http://100.125.237.65:3000
CRAWLBRIEF_GATEWAY_TOKEN=<same as FIRECRAWL_GATEWAY_API_TOKENS>
CRAWLBRIEF_WEBHOOK_SECRET=<same as FIRECRAWL_GATEWAY_WEBHOOK_SECRET>
# ...plus DB, Slack, LLM provider env vars
```

**CrawlBrief `docker-compose.prod.yml` — bind to Tailscale IP** so the gateway can reach it:
```yaml
ports:
  - '100.84.191.119:3001:3001'
```

**Bring up VPS 2:**
```bash
cd /server/projects/crawlbrief
sudo docker compose -f docker-compose.prod.yml up -d
sudo docker compose -f docker-compose.prod.yml exec crawlbrief node dist/db/migrate.js
```

**Smoke test (from VPS 2):**
```bash
curl -X POST -H "Authorization: Bearer $CRAWLBRIEF_API_TOKEN" \
  http://localhost:3001/run/<monitor-id>
sudo docker logs -f crawlbrief --tail=50
```

---

### Switching between topologies later

The data model and code are identical, so migration is mostly env vars + Docker bring-up:

**Two-VPS → Single-VPS** (consolidate to one box):
1. Copy Firecrawl + Gateway projects to the CrawlBrief VPS (via `git clone` or `rsync`).
2. Copy `.env` files manually (don't commit secrets).
3. Update both Gateway and CrawlBrief env vars: replace Tailscale IPs with `host.docker.internal` (see Option A above).
4. `docker compose down` on the old VPS 1.
5. Bring up Firecrawl → Gateway → CrawlBrief on the merged host.
6. Optional: remove Tailscale if no other use (`sudo tailscale down && sudo apt remove tailscale`).

**Single-VPS → Two-VPS** (split out CrawlBrief or Firecrawl):
1. Provision the second VPS, install Tailscale on both, note the 100.x IPs.
2. Move the relevant project directory to the second VPS.
3. Pre-flight: dump+restore the postgres data if CrawlBrief moves (`pg_dump` → `scp` → `psql`).
4. Update env vars: replace `host.docker.internal` with the appropriate Tailscale IP (see Option B above).
5. Bring up services on each VPS in the standard order.

### Choosing between topologies

| Concern | Single-VPS | Two-VPS via Tailscale |
|---|---|---|
| Cost | One server | Two servers |
| Networking complexity | Lowest (`host.docker.internal`) | Tailscale config + IP-bound ports |
| Resource isolation | Firecrawl can starve CrawlBrief on small VPS | Independent resource limits |
| Failure blast radius | All services down together | One VPS down ≠ total outage |
| Backups | One DB to back up | One DB on VPS 2 |
| Recommended when | ≤10 monitors, small VPS is fine | Firecrawl is RAM/CPU heavy or you want isolation |

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Gateway can't reach Firecrawl | Docker networking | Use `host.docker.internal:3002` when gateway is in Docker |
| Firecrawl webhook fails | SSRF protection | Set `ALLOW_LOCAL_WEBHOOKS=true` in Firecrawl's `.env` and `x-common-env` in its docker-compose |
| Gateway rejects webhook URL with private IP | Gateway URL validator | Set `ALLOW_LOCAL_WEBHOOKS=true` in **gateway's** `.env` (separate from Firecrawl's) |
| Webhook signature invalid | Secret mismatch | Ensure `FIRECRAWL_GATEWAY_WEBHOOK_SECRET` = `CRAWLBRIEF_WEBHOOK_SECRET` |
| LLM returns truncated JSON | Output too large | Increase `max_tokens` or trim input markdown |
| Slack notifications not sending | Pending in DB | Check `notifications` table; processor runs every minute |
| `z.coerce.boolean()` ignores "false" | Zod string coercion | Use `.transform((val) => val === 'true')` instead |
| Slack flooded with garbage 404 summaries | Site changed URL pattern but listing still emits stale links | Status-code guard now skips 4xx/5xx pages before LLM. Check `crawl_runs.failed_count` and `failure_summary` to see what was skipped. See "Site domain migration" example below. |
| Aggregate `:warning: Issue with X run #N` Slack message every day | Listing emits URLs that consistently 404 | Either (a) update `monitor.listingUrl` in `monitors.config.ts`, or (b) flip `enabled: false` for that monitor until investigated. Each daily run records one aggregate message; it stops once the underlying URLs return 200 |
| Re-notification spam after a domain migration | Old DB rows have old-domain URLs; new listing emits new-domain URLs → URL dedup misses everything | Two protections: (1) the title-based dedup catches articles whose `title_normalized` matches an existing row, even on a different URL; (2) for one-time domain moves, run a SQL `UPDATE` to rewrite the host (see example below) |
| `:rotating_light: <monitor> listing failed` Slack message | The listing page itself returned 4xx/5xx | Open the listing URL in a browser. If the site moved, update `monitor.listingUrl`; if it's transiently down, ignore — next run retries |
| Title-based dedup not catching migrated articles | `title_normalized` is NULL for older rows (pre-migration backfill) | Run the backfill: `UPDATE articles SET title_normalized = lower(trim(regexp_replace(title, '\s+', ' ', 'g'))) WHERE title IS NOT NULL AND title_normalized IS NULL;` |

### Worked example: Site domain migration (the "Filestage" pattern)

This is the canonical failure mode the status-code guard + title dedup were built for. Symptoms and fix:

**Symptom:** ~10 Slack messages titled like "404 Error — Page Not Found" with garbage summaries describing a 404 page.

**Root cause:** The competitor migrated their changelog (e.g. `https://changelog.example.com/` 301-redirected to `https://headwayapp.co/example-changelog`). Firecrawl follows redirects and scrapes the new domain, but the LLM was given the *old* listing URL as the base for resolving relative links — so it produced URLs on the old domain with the new path prefix, all of which 404.

**What the fix does (already in code):**
1. Listing scrapes use `metadata.sourceURL` (post-redirect URL) as the base for LLM extraction. Future migrations don't produce phantom URLs.
2. Status-code guard skips any 4xx/5xx page before LLM/Slack work.
3. Title-based dedup catches articles whose URL changed but title didn't.

**Manual recovery for an already-affected monitor:**

```sql
-- 1. Inspect what's in the DB
SELECT count(*), substring(url from 'https?://[^/]+') AS host
FROM articles WHERE monitor_id = '<monitor-id>' GROUP BY host;

-- 2. Update monitors.config.ts with the new listingUrl, redeploy.

-- 3. Inside a transaction, delete garbage rows and rewrite host on real ones
BEGIN;
DELETE FROM articles
 WHERE monitor_id = '<monitor-id>'
   AND url LIKE '<old-host>/<bad-path-prefix>/%';   -- the 404 garbage rows

UPDATE articles
   SET url = REPLACE(url, '<old-host>/', '<new-host>/')
 WHERE monitor_id = '<monitor-id>'
   AND url LIKE '<old-host>/%';

-- 4. Verify everything's on the new host
SELECT count(*), substring(url from 'https?://[^/]+') AS host
FROM articles WHERE monitor_id = '<monitor-id>' GROUP BY host;

-- 5. If looks good:
COMMIT;
```

**Verify with a manual run** (no Slack messages should fire if dedup works):

```bash
curl -X POST -H "Authorization: Bearer $CRAWLBRIEF_API_TOKEN" \
  http://localhost:3001/run/<monitor-id>
sudo docker logs -f crawlbrief --tail=100
# Expected: "Articles extracted successfully" → "No new articles found" → "Crawl run completed"
# No "Sending Slack notification" lines, no failure aggregate.
```
