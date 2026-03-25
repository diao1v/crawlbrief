# Firecrawl Gateway - Usage Guide

## Overview

Firecrawl Gateway is an authenticated proxy for self-hosted Firecrawl. It provides:
- Bearer token authentication (anonymous or per-client)
- Normalized API responses
- Request logging with client identification
- Webhook support for async crawl jobs

## Architecture

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│  Crawlbrief │ ───► │ Firecrawl       │ ───► │ Firecrawl   │
│  (Client)   │      │ Gateway (:3000) │      │ API (:3002) │
└─────────────┘      └─────────────────┘      └─────────────┘
                            │
                     Authentication
                     + Logging
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIRECRAWL_GATEWAY_API_TOKENS` | One of these | Comma-separated anonymous tokens |
| `FIRECRAWL_GATEWAY_CLIENT_TOKENS` | required | JSON: `{"clientId":"token"}` |
| `FIRECRAWL_URL` | Yes | Firecrawl API URL |
| `PORT` | No | Gateway port (default: 3000) |
| `LOG_LEVEL` | No | Log level (default: info) |

### Example .env

```bash
# Per-client token (recommended for tracking)
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"your-secret-token-here"}

# Firecrawl instance
FIRECRAWL_URL=http://localhost:3002
```

## API Endpoints

### Health Check

```bash
GET /health
```

No authentication required.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### Scrape

```bash
POST /scrape
Authorization: Bearer <token>
```

Scrape a single URL and return content.

**Request:**
```bash
curl -X POST http://localhost:3000/scrape \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "formats": ["markdown"],
    "includeTags": ["article", "main"],
    "excludeTags": ["nav", "footer"],
    "timeout": 30000
  }'
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | URL to scrape |
| `formats` | array | No | `["markdown", "html", "links"]` (default: `["markdown"]`) |
| `includeTags` | array | No | Only include these HTML tags |
| `excludeTags` | array | No | Exclude these HTML tags |
| `waitFor` | number | No | Wait ms before scraping |
| `timeout` | number | No | Timeout in ms (default: 30000, max: 60000) |

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "markdown": "# Example Domain\n\nThis domain is for use in illustrative examples...",
    "metadata": {
      "title": "Example Domain",
      "description": "...",
      "language": "en",
      "sourceURL": "https://example.com"
    }
  }
}
```

---

### Start Crawl

```bash
POST /crawl
Authorization: Bearer <token>
```

Start an async crawl job that visits multiple pages.

**Request:**
```bash
curl -X POST http://localhost:3000/crawl \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "limit": 10,
    "maxDepth": 2,
    "includePaths": ["/blog/*"],
    "excludePaths": ["/admin/*"],
    "webhookUrl": "https://your-app.com/webhook/crawl-complete"
  }'
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Starting URL |
| `limit` | number | No | Max pages to crawl |
| `maxDepth` | number | No | Max link depth |
| `includePaths` | array | No | Only crawl matching paths |
| `excludePaths` | array | No | Skip matching paths |
| `formats` | array | No | Output formats |
| `webhookUrl` | string | No | URL to POST results when complete |

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "abc-123-def",
    "status": "pending"
  }
}
```

---

### Get Crawl Status

```bash
GET /crawl/:jobId
Authorization: Bearer <token>
```

Poll for crawl job status and results.

**Request:**
```bash
curl http://localhost:3000/crawl/abc-123-def \
  -H "Authorization: Bearer your-secret-token-here"
```

**Response (in progress):**
```json
{
  "success": true,
  "data": {
    "jobId": "abc-123-def",
    "status": "scraping",
    "current": 3,
    "total": 10,
    "pages": []
  }
}
```

**Response (completed):**
```json
{
  "success": true,
  "data": {
    "jobId": "abc-123-def",
    "status": "completed",
    "pages": [
      {
        "url": "https://example.com",
        "markdown": "...",
        "metadata": {...}
      },
      {
        "url": "https://example.com/page2",
        "markdown": "...",
        "metadata": {...}
      }
    ],
    "totalPages": 2
  }
}
```

---

### Extract (LLM-powered)

```bash
POST /extract
Authorization: Bearer <token>
```

Extract structured data from URLs using LLM.

**Request:**
```bash
curl -X POST http://localhost:3000/extract \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://example.com/product"],
    "prompt": "Extract product name, price, and description",
    "schema": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "price": {"type": "number"},
        "description": {"type": "string"}
      }
    }
  }'
```

**Note:** Requires `OPENAI_API_KEY` configured in Firecrawl.

---

### Webhook Callback

When `webhookUrl` is provided in crawl requests, the gateway POSTs results on completion:

```json
POST https://your-app.com/webhook/crawl-complete
Content-Type: application/json

{
  "jobId": "abc-123-def",
  "status": "completed",
  "pages": [...],
  "totalPages": 5
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

**Error Codes:**
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UPSTREAM_ERROR` | 502 | Firecrawl returned an error |
| `TIMEOUT` | 504 | Request timed out |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Deployment

### Local Development

```bash
# 1. Start Firecrawl (in firecrawl repo)
cd firecrawl && docker compose up -d

# 2. Start Gateway
cd firecrawl-gateway
cp .env.example .env
# Edit .env with your tokens
pnpm install && pnpm dev
```

### VPS Deployment

```bash
# 1. Start Firecrawl
git clone https://github.com/mendableai/firecrawl.git
cd firecrawl && docker compose up -d

# 2. Deploy Gateway
git clone <your-gateway-repo>
cd firecrawl-gateway

# Create .env
cat > .env << 'EOF'
FIRECRAWL_GATEWAY_CLIENT_TOKENS={"crawlbrief":"$(openssl rand -hex 32)"}
FIRECRAWL_URL=http://host.docker.internal:3002
EOF

# Build and run
docker compose up -d --build
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }
}
```

---

## Integration Example (TypeScript)

```typescript
const GATEWAY_URL = 'https://api.yourdomain.com';
const TOKEN = 'your-secret-token-here';

// Scrape a single page
async function scrape(url: string): Promise<ScrapeResult> {
  const res = await fetch(`${GATEWAY_URL}/scrape`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['markdown'] }),
  });
  return res.json();
}

// Start a crawl and poll for results
async function crawl(url: string, limit: number): Promise<CrawlResult> {
  // Start crawl
  const startRes = await fetch(`${GATEWAY_URL}/crawl`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, limit }),
  });
  const { data: { jobId } } = await startRes.json();

  // Poll for completion
  while (true) {
    const statusRes = await fetch(`${GATEWAY_URL}/crawl/${jobId}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    const result = await statusRes.json();

    if (result.data.status === 'completed' || result.data.status === 'failed') {
      return result;
    }

    await new Promise(r => setTimeout(r, 2000)); // Wait 2s before polling again
  }
}
```

---

## Security Notes

- Always use HTTPS in production
- Generate strong tokens: `openssl rand -hex 32`
- Use per-client tokens for tracking and revocation
- Block direct access to ports 3000/3002 via firewall
- Webhook URLs are validated to prevent SSRF attacks
