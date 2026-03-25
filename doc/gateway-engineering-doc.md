# Firecrawl Gateway - Engineering Document

## 1. Context

firecrawl-gateway is a TypeScript service that sits in front of self-hosted Firecrawl and exposes a stable authenticated API for multiple downstream applications. The reason for introducing this repo is to keep scraping infrastructure reusable while preventing product-specific logic from being embedded directly into the Firecrawl deployment layer.

## 2. Problem

If each application talks to Firecrawl directly, every app must handle auth, request validation, response normalization, and Firecrawl-specific deployment details on its own. That creates duplication and makes future apps harder to build and maintain.

## 3. Goals

- Provide a reusable scraping platform for multiple apps
- Keep Firecrawl private behind a controlled gateway boundary
- Expose authenticated endpoints: scrape, crawl, extract
- Normalize requests and responses so downstream apps depend on one contract
- Support deployment on the same VPS as other services

## 4. Non-goals

- This repo should not store CrawlBrief business data
- This repo should not generate app-specific AI summaries or Slack messages
- This repo should not own scheduling logic for competitor or blog monitoring workflows
- This repo should not expose raw Firecrawl services directly to the public internet

## 5. Technology Stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js (>=20) |
| Package Manager | pnpm |
| Framework | Hono |
| Validation | Zod |
| Logging | Pino |
| Testing | Vitest |
| Deployment | Docker |

## 6. Architecture

### Request Flow

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│  Client     │ ───► │ Firecrawl       │ ───► │ Firecrawl   │
│  (Crawlbrief)│     │ Gateway (:3000) │      │ API (:3002) │
└─────────────┘      └─────────────────┘      └─────────────┘
                            │
                     • Authentication
                     • Validation
                     • Logging
                     • Error normalization
```

1. Client application calls firecrawl-gateway with Bearer token
2. Gateway authenticates the request and identifies client
3. Gateway validates payload with Zod schemas
4. Gateway forwards the request to Firecrawl
5. Firecrawl performs the scrape/crawl/extract
6. Gateway returns a normalized response to the caller

### Logical Topology

- **Public**: firecrawl-gateway (port 3000, behind nginx with HTTPS)
- **Private**: Firecrawl API, Redis, PostgreSQL, RabbitMQ, Playwright (internal Docker network)

## 7. Repository Structure

```
firecrawl-gateway/
├── src/
│   ├── index.ts                 # Entry point with dotenv
│   ├── app.ts                   # Hono app setup
│   ├── config.ts                # Zod-validated env config
│   ├── routes/
│   │   ├── health.ts            # GET /health
│   │   ├── scrape.ts            # POST /scrape
│   │   ├── crawl.ts             # POST /crawl, GET /crawl/:jobId
│   │   └── extract.ts           # POST /extract
│   ├── middleware/
│   │   ├── auth.ts              # Bearer token validation (timing-safe)
│   │   ├── request-id.ts        # X-Request-ID generation
│   │   └── logger.ts            # Request/response logging
│   ├── services/
│   │   ├── firecrawl.ts         # Firecrawl HTTP client with timeout
│   │   ├── webhook.ts           # Webhook delivery with retry
│   │   └── job-store.ts         # In-memory job metadata
│   ├── schemas/
│   │   ├── scrape.ts            # Scrape request/response schemas
│   │   ├── crawl.ts             # Crawl request/response schemas
│   │   ├── extract.ts           # Extract request/response schemas
│   │   └── common.ts            # Shared error schemas
│   ├── types/
│   │   └── index.ts             # TypeScript type definitions
│   └── lib/
│       ├── errors.ts            # Custom error classes
│       ├── logger.ts            # Pino logger setup
│       ├── retry.ts             # Exponential backoff utility
│       └── url-validator.ts     # SSRF protection for webhooks
├── tests/
│   ├── setup.ts                 # Test environment setup
│   └── unit/
│       ├── middleware/
│       │   └── auth.test.ts
│       ├── schemas/
│       │   ├── crawl.test.ts
│       │   └── extract.test.ts
│       └── lib/
│           ├── retry.test.ts
│           └── url-validator.test.ts
├── docker/
│   └── Dockerfile
├── docker-compose.yml           # Gateway only
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 8. Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIRECRAWL_GATEWAY_API_TOKENS` | One required | Comma-separated anonymous tokens |
| `FIRECRAWL_GATEWAY_CLIENT_TOKENS` | | JSON map: `{"clientId":"token"}` |
| `FIRECRAWL_URL` | Yes | Firecrawl API URL |
| `PORT` | No | Gateway port (default: 3000) |
| `LOG_LEVEL` | No | fatal/error/warn/info/debug/trace (default: info) |

### Authentication Options

**Option 1: Anonymous tokens** - Simple comma-separated list, no client identification in logs
```bash
FIRECRAWL_GATEWAY_API_TOKENS=token1,token2
```

**Option 2: Per-client tokens** - JSON map with client ID for tracking/logging
```bash
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"secret-token","other-app":"other-token"}
```

Both options can be used together. Per-client tokens are checked first.

## 9. API Endpoints

### GET /health
- No authentication required
- Returns: `{ status: "ok", timestamp: "ISO8601" }`

### POST /scrape
- Scrape a single URL
- Request: `{ url, formats?, includeTags?, excludeTags?, waitFor?, timeout? }`
- Response: `{ success, data: { url, markdown, html?, metadata, links? } }`

### POST /crawl
- Start async crawl job
- Request: `{ url, limit?, maxDepth?, includePaths?, excludePaths?, formats?, webhookUrl? }`
- Response: `{ success, data: { jobId, status } }`

### GET /crawl/:jobId
- Poll crawl job status
- Response: `{ success, data: { jobId, status, pages?, current?, total? } }`

### POST /extract
- LLM-powered structured extraction
- Request: `{ urls, prompt?, schema? }`
- Response: `{ success, data: { results } }`
- Requires: `OPENAI_API_KEY` in Firecrawl

### Webhook Callback
When `webhookUrl` is provided in crawl requests, gateway POSTs results on completion:
```json
{ "jobId": "...", "status": "completed", "pages": [...], "totalPages": 5 }
```

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {}
  }
}
```

Error codes: `UNAUTHORIZED`, `VALIDATION_ERROR`, `UPSTREAM_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`

## 10. Security

### Implemented

- Timing-safe token comparison (prevents timing attacks)
- SSRF protection for webhook URLs (blocks private IPs)
- Request ID tracking for traceability
- Client identification in logs
- Zod validation on all inputs
- Timeout handling with AbortController

### Deployment Security

- Gateway is only service exposed externally
- Firecrawl and dependencies on internal Docker network
- Use nginx/caddy for HTTPS termination
- Firewall: only expose 443, block 3000/3002

## 11. Observability

Gateway logs include:
- Request ID (X-Request-ID header)
- HTTP method and path
- Client ID (when using per-client tokens)
- Response status code
- Request duration (ms)
- Upstream errors with normalized codes

## 12. Deployment

### Local Development
```bash
# Terminal 1: Start Firecrawl
cd firecrawl && docker compose up -d

# Terminal 2: Start Gateway
cd firecrawl-gateway
cp .env.example .env  # Edit with your tokens
pnpm install && pnpm dev
```

### Production (VPS)
```bash
# 1. Start Firecrawl (from official repo)
git clone https://github.com/mendableai/firecrawl.git
cd firecrawl && docker compose up -d

# 2. Deploy Gateway
git clone <gateway-repo>
cd firecrawl-gateway
# Create .env with strong tokens
docker compose up -d --build

# 3. Setup nginx reverse proxy with HTTPS
# 4. Configure firewall
```

### Docker Compose (Gateway Only)
The gateway docker-compose.yml only runs the gateway service. Firecrawl runs separately from its official repository. This keeps concerns separated and allows independent updates.

## 13. Implementation Status

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Project setup (Hono, TypeScript, Vitest) | ✅ Complete |
| 1 | Configuration with Zod validation | ✅ Complete |
| 1 | Bearer auth middleware | ✅ Complete |
| 1 | Request ID middleware | ✅ Complete |
| 1 | Logging middleware (Pino) | ✅ Complete |
| 1 | GET /health | ✅ Complete |
| 1 | POST /scrape | ✅ Complete |
| 1 | Firecrawl service client | ✅ Complete |
| 1 | Docker setup | ✅ Complete |
| 1 | Unit tests | ✅ Complete |
| 2 | POST /crawl | ✅ Complete |
| 2 | GET /crawl/:jobId | ✅ Complete |
| 2 | Webhook delivery with retry | ✅ Complete |
| 2 | Retry logic with exponential backoff | ✅ Complete |
| 3 | POST /extract | ✅ Complete |
| 3 | Per-client tokens | ✅ Complete |

## 14. Key Decisions

- **Separate repo**: Scraping platform can be reused by future apps
- **Gateway-only docker-compose**: Firecrawl runs from official repo, simplifies updates
- **Per-client tokens**: Enables tracking and per-client revocation
- **Webhook support**: Async crawl results without polling
- **No rate limiting**: Deferred; can be added if needed
- **In-memory job store**: Simple; can migrate to Redis if persistence needed

## 15. Risks

- Over-generalizing too early may slow down iteration
- Leaking app-specific logic into shared gateway would reduce reuse
- Firecrawl resource usage may be significant on single VPS
- In-memory job store loses data on restart (acceptable for v1)

## 16. Related Documentation

- [Gateway Usage Guide](./gateway-usage-guide.md) - API reference and integration examples
