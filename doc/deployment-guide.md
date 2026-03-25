# CrawlBrief VPS Deployment Guide

This guide covers deploying CrawlBrief with PostgreSQL on a VPS (Ubuntu 22.04/24.04).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Slack App Setup](#slack-app-setup)
3. [Cloudflare AI Gateway Setup](#cloudflare-ai-gateway-setup)
4. [Firecrawl Gateway Setup](#firecrawl-gateway-setup)
5. [Server Setup](#server-setup)
6. [Docker Deployment](#docker-deployment)
7. [Native Deployment (Alternative)](#native-deployment-alternative)
8. [Caddy Reverse Proxy](#caddy-reverse-proxy)
9. [Firewall Configuration](#firewall-configuration)
10. [Monitoring & Maintenance](#monitoring--maintenance)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### VPS Requirements

- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **RAM**: Minimum 1GB (2GB+ recommended)
- **CPU**: 1 vCPU minimum
- **Storage**: 20GB+ SSD
- **Network**: Public IP with ports 80, 443 open

### Domain Setup

1. Point your domain (e.g., `crawlbrief.yourdomain.com`) to your VPS IP
2. Wait for DNS propagation (can take up to 48 hours)

### External Services

Ensure you have:
- Cloudflare AI Gateway with BYOK configured (see [Cloudflare AI Gateway Setup](#cloudflare-ai-gateway-setup) below)
- Slack Bot Token (`xoxb-...`) and Channel ID (see [Slack App Setup](#slack-app-setup) below)
- Firecrawl Gateway running (see [Gateway Setup](#firecrawl-gateway-setup) below)

### Deployment Scenarios

Choose your deployment scenario:

#### Scenario A: All Services on Same VPS (Recommended for simplicity)

```
┌─────────────────────────────────────────────────────────┐
│                         VPS                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ CrawlBrief  │  │   Gateway   │  │    Firecrawl    │  │
│  │  :3001      │◄─│    :3000    │◄─│     :3002       │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│         │                                    ▲          │
│         └──────── webhooks (localhost) ──────┘          │
└─────────────────────────────────────────────────────────┘
```

- **No domain required** for internal communication
- All services communicate via `localhost`
- Caddy only needed if you want external access (e.g., manual trigger API)
- Simplest setup, lowest cost

#### Scenario B: Services on Different Servers

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│    VPS 1     │        │    VPS 2     │        │    VPS 3     │
│  CrawlBrief  │◄──────►│   Gateway    │◄──────►│  Firecrawl   │
│  :443 (SSL)  │        │  :443 (SSL)  │        │  :443 (SSL)  │
└──────────────┘        └──────────────┘        └──────────────┘
```

- **Domains required** for each service
- SSL required for secure communication
- More complex but allows independent scaling

#### Scenario C: Hybrid (CrawlBrief + Gateway on VPS, External Firecrawl)

- CrawlBrief and Gateway communicate via `localhost`
- External Firecrawl needs public URL for webhooks
- Domain required only for CrawlBrief (webhook endpoint)

---

## Slack App Setup

CrawlBrief needs a Slack app to send notifications to your channel.

### 1. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Enter app name (e.g., "CrawlBrief") and select your workspace
4. Click **Create App**

### 2. Configure Bot Permissions

1. In the left sidebar, go to **OAuth & Permissions**
2. Scroll to **Scopes** → **Bot Token Scopes**
3. Add these scopes:
   - `chat:write` - Send messages
   - `chat:write.public` - Send to public channels without joining

### 3. Install App to Workspace

1. Scroll up to **OAuth Tokens for Your Workspace**
2. Click **Install to Workspace**
3. Review permissions and click **Allow**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
5. This is your `CRAWLBRIEF_SLACK_BOT_TOKEN`

### 4. Get Channel ID

1. In Slack, right-click on the target channel
2. Click **View channel details** (or **Copy link**)
3. The Channel ID is the last part of the URL (e.g., `C0123456789`)
4. This is your `CRAWLBRIEF_SLACK_CHANNEL_ID`

### 5. Invite Bot to Channel

For private channels, invite the bot:
```
/invite @CrawlBrief
```

---

## Cloudflare AI Gateway Setup

CrawlBrief uses Cloudflare AI Gateway with BYOK (Bring Your Own Keys) by default. This provides:
- Centralized API key management (keys stored securely in Cloudflare)
- Usage analytics and cost tracking
- Caching for repeated requests
- Rate limiting

### 1. Create AI Gateway

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **AI** → **AI Gateway**
2. Click **Create Gateway**
3. Enter a name (e.g., `crawlbrief`)
4. Note your gateway URL: `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}`

### 2. Add Provider Keys (BYOK)

1. Select your gateway → **Provider Keys** → **Add**
2. Choose provider: **OpenAI** or **Anthropic**
3. Paste your API key
4. Set alias to `default`
5. Click **Save**

### 3. Enable Authentication

1. Go to gateway **Settings**
2. Enable **Authenticated Gateway**
3. Click **Generate Token**
4. Copy and save the token (shown only once)
5. This is your `CRAWLBRIEF_CF_AI_GATEWAY_TOKEN`

### Configuration

```env
CRAWLBRIEF_CF_AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/your-account-id/crawlbrief
CRAWLBRIEF_CF_AI_GATEWAY_TOKEN=your-generated-token
CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK=true  # default
```

---

## Firecrawl Gateway Setup

CrawlBrief requires Firecrawl Gateway for web scraping. See the Gateway documentation for deployment instructions.

### Quick Reference

If deploying Gateway on the same VPS:

```bash
# Example: Run Gateway container (adjust based on your Gateway setup)
docker run -d \
  --name firecrawl-gateway \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e GATEWAY_API_KEY=your-gateway-token \
  -e FIRECRAWL_API_URL=http://localhost:3002 \
  your-gateway-image:latest
```

Key configuration:
- Gateway listens on port `3000` by default
- Set `CRAWLBRIEF_GATEWAY_URL=http://localhost:3000` in CrawlBrief
- Set `CRAWLBRIEF_GATEWAY_TOKEN` to match Gateway's API key
- Configure Gateway's webhook URL to point back to CrawlBrief: `http://localhost:3001/webhooks/firecrawl`

---

## Server Setup

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Create Application User

```bash
# Create user for running the application
sudo useradd -m -s /bin/bash crawlbrief
sudo usermod -aG sudo crawlbrief

# Set password
sudo passwd crawlbrief
```

### 3. Install Essential Tools

```bash
sudo apt install -y curl wget git unzip htop
```

---

## Docker Deployment

PostgreSQL and CrawlBrief run in separate docker-compose stacks for independent management.

### 1. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and back in, or run:
newgrp docker

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### 2. Clone Repository

```bash
# Switch to crawlbrief user
sudo su - crawlbrief

# Clone repository
git clone https://github.com/your-repo/crawlbrief.git
cd crawlbrief
```

### 3. Start PostgreSQL

PostgreSQL runs in a separate docker-compose stack so it stays up when you rebuild the app.

```bash
# Navigate to postgres directory
cd docker/postgres

# Copy and configure environment
cp .env.example .env
nano .env
```

Set a secure password and data directory:
```env
POSTGRES_USER=crawlbrief
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_DB=crawlbrief

# Data stored on host filesystem for easy backup
POSTGRES_DATA_DIR=./data
```

Start PostgreSQL:
```bash
docker compose up -d

# Verify it's running
docker compose ps
docker compose logs
```

### 4. Configure CrawlBrief

```bash
# Back to project root
cd ../..

# Copy example env file
cp .env.example .env
nano .env
```

**Example configuration:**

```env
# Database (port 5433 to avoid conflict with Firecrawl's PostgreSQL on 5432)
CRAWLBRIEF_DATABASE_URL=postgresql://crawlbrief:your-secure-password@host.docker.internal:5433/crawlbrief

# Server
CRAWLBRIEF_PORT=3001
CRAWLBRIEF_BASE_URL=http://localhost:3001

# Firecrawl Gateway
CRAWLBRIEF_GATEWAY_URL=http://localhost:3000
CRAWLBRIEF_GATEWAY_TOKEN=your-gateway-token

# LLM Provider via Cloudflare AI Gateway (BYOK mode - default)
CRAWLBRIEF_LLM_PROVIDER=openai
CRAWLBRIEF_OPENAI_MODEL=gpt-4o-mini
CRAWLBRIEF_CF_AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/your-account-id/your-gateway
CRAWLBRIEF_CF_AI_GATEWAY_TOKEN=your-cf-aig-token

# Slack
CRAWLBRIEF_SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
CRAWLBRIEF_SLACK_CHANNEL_ID=C0123456789

# Security
CRAWLBRIEF_API_TOKEN=your-secure-api-token
CRAWLBRIEF_WEBHOOK_SECRET=your-webhook-secret-min-16-chars

# Logging & Timezone
CRAWLBRIEF_LOG_LEVEL=info
CRAWLBRIEF_TIMEZONE=Pacific/Auckland
```

> **Alternative (non-BYOK):** If you prefer to store API keys locally:
> ```env
> CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK=false
> CRAWLBRIEF_OPENAI_API_KEY=sk-your-openai-key
> ```

### 5. Build and Start CrawlBrief

```bash
# Build and start
docker compose -f docker-compose.prod.yml up -d --build

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Run database migrations
docker compose -f docker-compose.prod.yml exec crawlbrief pnpm db:migrate
```

### 6. Verify Deployment

```bash
# Test health endpoint
curl http://localhost:3001/health

# Check PostgreSQL connection
docker exec crawlbrief-postgres psql -U crawlbrief -c "SELECT version();"
```

### 7. Common Commands

```bash
# CrawlBrief commands (from project root)
docker compose -f docker-compose.prod.yml up -d --build  # Rebuild app
docker compose -f docker-compose.prod.yml restart         # Restart app
docker compose -f docker-compose.prod.yml logs -f         # View logs
docker compose -f docker-compose.prod.yml down            # Stop app

# PostgreSQL commands (from docker/postgres)
cd docker/postgres
docker compose ps                    # Check status
docker compose logs                  # View logs
docker compose restart               # Restart (rarely needed)
```

> **Note:** Rebuilding CrawlBrief (`docker compose up -d --build`) does not affect PostgreSQL since they're in separate stacks.

---

## Native Deployment (Alternative)

Use this if you prefer to run Node.js directly without Docker for the application.

### 1. Install PostgreSQL (Docker)

```bash
# Run PostgreSQL container separately
docker run -d \
  --name crawlbrief-postgres \
  --restart unless-stopped \
  -e POSTGRES_USER=crawlbrief \
  -e POSTGRES_PASSWORD=your-secure-password-here \
  -e POSTGRES_DB=crawlbrief \
  -v crawlbrief_postgres_data:/var/lib/postgresql/data \
  -p 127.0.0.1:5433:5432 \
  postgres:15-alpine
```

> **Note:** Port 5433 is used to avoid conflicts with Firecrawl's PostgreSQL on 5432.

### 2. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

For native deployment, set the DATABASE_URL directly:

```env
CRAWLBRIEF_DATABASE_URL=postgresql://crawlbrief:your-secure-password@localhost:5433/crawlbrief
# ... other values same as Docker section
```

### 4. Install Dependencies and Build

```bash
cd /home/crawlbrief/crawlbrief
pnpm install
pnpm build
pnpm db:migrate
```

### 5. Create Systemd Service

```bash
sudo nano /etc/systemd/system/crawlbrief.service
```

Add the following content:

```ini
[Unit]
Description=CrawlBrief Monitor Service
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=crawlbrief
Group=crawlbrief
WorkingDirectory=/home/crawlbrief/crawlbrief
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=crawlbrief

# Environment
Environment=NODE_ENV=production
EnvironmentFile=/home/crawlbrief/crawlbrief/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/crawlbrief/crawlbrief
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### 6. Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable crawlbrief
sudo systemctl start crawlbrief

# Check status
sudo systemctl status crawlbrief

# View logs
sudo journalctl -u crawlbrief -f
```

---

## Caddy Reverse Proxy

> **When is Caddy needed?**
> - **Scenario A (all on same VPS with localhost)**: Optional - only if you want external HTTPS access
> - **Scenario B (different servers)**: Required for SSL and external access
> - **Using nip.io**: Required for SSL with wildcard DNS

Caddy automatically handles SSL certificate provisioning and renewal via Let's Encrypt.

### 1. Create Caddy Configuration Directory

```bash
sudo mkdir -p /opt/caddy/data /opt/caddy/config
```

### 2. Create Caddyfile

```bash
sudo nano /opt/caddy/Caddyfile
```

#### Option A: With Domain Names

```caddyfile
# CrawlBrief
crawlbrief.yourdomain.com {
    reverse_proxy localhost:3001

    # Increase body size limit for webhooks
    request_body {
        max_size 10MB
    }
}

# Firecrawl Gateway (if running on same server)
gateway.yourdomain.com {
    reverse_proxy localhost:3000

    # Increase body size limit for scrape responses
    request_body {
        max_size 50MB
    }
}
```

#### Option B: With nip.io (No Domain Required)

If you only have an IP address (e.g., `123.45.67.89`), use nip.io for free wildcard DNS:

```caddyfile
# CrawlBrief (replace 123.45.67.89 with your actual IP)
crawlbrief.123.45.67.89.nip.io {
    reverse_proxy localhost:3001

    request_body {
        max_size 10MB
    }
}

# Firecrawl Gateway
gateway.123.45.67.89.nip.io {
    reverse_proxy localhost:3000

    request_body {
        max_size 50MB
    }
}
```

> **How nip.io works:** Any subdomain of `<ip>.nip.io` resolves to that IP. So `anything.123.45.67.89.nip.io` resolves to `123.45.67.89`. Caddy can then obtain SSL certificates for these hostnames.

### 3. Run Caddy Container

```bash
docker run -d \
  --name caddy \
  --restart unless-stopped \
  --network host \
  -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v /opt/caddy/data:/data \
  -v /opt/caddy/config:/config \
  caddy:2-alpine
```

> **Note:** We use `--network host` so Caddy can access services on localhost ports (3000, 3001).

### 4. Verify Caddy is Running

```bash
# Check container status
docker ps | grep caddy

# Check logs
docker logs caddy

# Test HTTPS (after DNS propagation)
curl -I https://crawlbrief.yourdomain.com/health
```

### 5. Caddy Management Commands

```bash
# View logs
docker logs -f caddy

# Reload configuration (after editing Caddyfile)
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Restart container
docker restart caddy

# Stop container
docker stop caddy
```

### 6. SSL Certificate Information

Caddy automatically:
- Obtains SSL certificates from Let's Encrypt
- Renews certificates before expiry
- Redirects HTTP to HTTPS
- Enables HTTP/2 and HTTP/3

Certificates are stored in `/opt/caddy/data/caddy/certificates/`.

To check certificate status:
```bash
docker exec caddy caddy list-certificates
```

---

## Firewall Configuration

### Using UFW

```bash
# Enable UFW
sudo ufw enable

# Allow SSH (important!)
sudo ufw allow ssh

# Allow HTTP and HTTPS for Caddy
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check status
sudo ufw status
```

### Expected Output

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
22/tcp (v6)                ALLOW       Anywhere (v6)
80/tcp (v6)                ALLOW       Anywhere (v6)
443/tcp (v6)               ALLOW       Anywhere (v6)
```

---

## Monitoring & Maintenance

### View Logs

```bash
# Native deployment
sudo journalctl -u crawlbrief -f
sudo journalctl -u crawlbrief --since "1 hour ago"

# Docker deployment
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs --since 1h
```

### Database Maintenance

```bash
# Connect to database via Docker
docker exec -it crawlbrief-postgres psql -U crawlbrief -d crawlbrief

# Check table sizes
SELECT
    relname as table_name,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

# Vacuum and analyze
VACUUM ANALYZE;
```

### Backup Database

```bash
# Create backup directory
mkdir -p /opt/crawlbrief/backups

# Backup database via Docker
docker exec crawlbrief-postgres pg_dump -U crawlbrief crawlbrief > /opt/crawlbrief/backups/crawlbrief_$(date +%Y%m%d_%H%M%S).sql

# Compress backup
gzip /opt/crawlbrief/backups/crawlbrief_*.sql
```

### Automated Backups (Cron)

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * docker exec crawlbrief-postgres pg_dump -U crawlbrief crawlbrief | gzip > /opt/crawlbrief/backups/crawlbrief_$(date +\%Y\%m\%d).sql.gz

# Keep only last 7 days of backups
0 3 * * * find /opt/crawlbrief/backups -name "*.sql.gz" -mtime +7 -delete
```

### Update Application

```bash
# Native deployment
cd /home/crawlbrief/crawlbrief
git pull
pnpm install
pnpm build
pnpm db:migrate
sudo systemctl restart crawlbrief

# Docker deployment
cd /home/crawlbrief/crawlbrief
git pull
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app pnpm db:migrate
```

### Health Checks

```bash
# Check application health
curl -s https://crawlbrief.yourdomain.com/health | jq

# Check PostgreSQL container
docker ps | grep crawlbrief-postgres
docker logs crawlbrief-postgres --tail 20

# Check Caddy container
docker ps | grep caddy
docker logs caddy --tail 20

# Check disk space
df -h

# Check memory
free -h

# Check running processes
htop
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check service status
sudo systemctl status crawlbrief

# Check detailed logs
sudo journalctl -u crawlbrief -n 100 --no-pager

# Common issues:
# 1. Database connection failed - check DATABASE_URL
# 2. Missing environment variables - check .env file
# 3. Port already in use - check with: sudo lsof -i :3001
```

### Database Connection Issues

```bash
# Check PostgreSQL container is running
docker ps | grep crawlbrief-postgres

# Test connection via Docker
docker exec -it crawlbrief-postgres psql -U crawlbrief -d crawlbrief -c "SELECT 1;"

# Check PostgreSQL container logs
docker logs crawlbrief-postgres --tail 100

# Restart PostgreSQL container
docker restart crawlbrief-postgres

# Reset password - use docker-compose instead
cd docker/postgres
docker compose down
# Edit .env with new password
docker compose up -d
```

### Caddy Issues

```bash
# Check Caddy container is running
docker ps | grep caddy

# View Caddy logs
docker logs caddy --tail 100

# Validate Caddyfile syntax
docker exec caddy caddy validate --config /etc/caddy/Caddyfile

# Reload configuration
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Restart Caddy
docker restart caddy
```

### SSL Certificate Issues

```bash
# Check certificate status (Caddy manages this automatically)
docker exec caddy caddy list-certificates

# Check certificate expiry
echo | openssl s_client -servername crawlbrief.yourdomain.com -connect crawlbrief.yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Force certificate renewal (rarely needed)
docker restart caddy
```

### Webhook Not Receiving Requests

1. **Check BASE_URL is set correctly** in `.env`
2. **Verify SSL certificate** is valid
3. **Check firewall** allows incoming connections
4. **Test webhook endpoint manually**:
   ```bash
   curl -X POST https://crawlbrief.yourdomain.com/webhooks/firecrawl \
     -H "Content-Type: application/json" \
     -d '{"type":"test"}'
   ```
5. **Check Caddy logs** for incoming requests: `docker logs caddy`
6. **Verify Firecrawl Gateway** is configured with correct webhook URL

### High Memory Usage

```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head -10

# Restart application
sudo systemctl restart crawlbrief

# Or for Docker:
docker compose -f docker-compose.prod.yml restart
```

### Slow Performance

```bash
# Check CPU and I/O
htop
iostat -x 1 5

# Check PostgreSQL slow queries
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Analyze PostgreSQL
psql -U crawlbrief -d crawlbrief -c "VACUUM ANALYZE;"
```

---

## Security Checklist

- [ ] SSH key authentication enabled, password auth disabled
- [ ] Firewall configured (only 22, 80, 443 open)
- [ ] PostgreSQL not exposed to internet
- [ ] Strong passwords for all services
- [ ] `CRAWLBRIEF_WEBHOOK_SECRET` set (min 16 chars)
- [ ] `CRAWLBRIEF_API_TOKEN` is strong and unique
- [ ] SSL/TLS enabled with auto-renewal
- [ ] Regular backups configured
- [ ] Fail2ban installed (optional but recommended)
- [ ] Automatic security updates enabled

### Enable Automatic Security Updates

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Install Fail2ban (Optional)

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## Quick Reference

### Service Commands

```bash
# CrawlBrief (Native)
sudo systemctl start|stop|restart|status crawlbrief
sudo journalctl -u crawlbrief -f

# CrawlBrief (Docker)
docker compose -f docker-compose.prod.yml up|down|restart
docker compose -f docker-compose.prod.yml logs -f

# PostgreSQL (Docker)
docker start|stop|restart crawlbrief-postgres
docker logs crawlbrief-postgres

# Caddy (Docker)
docker start|stop|restart caddy
docker logs caddy
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Important Paths

| Path | Description |
|------|-------------|
| `/home/crawlbrief/crawlbrief` | Application directory |
| `/home/crawlbrief/crawlbrief/.env` | Environment configuration |
| `/opt/crawlbrief/postgres-data` | PostgreSQL data directory |
| `/opt/crawlbrief/backups` | Database backups |
| `/opt/caddy/Caddyfile` | Caddy configuration |
| `/opt/caddy/data` | Caddy data (SSL certificates) |
| `/etc/systemd/system/crawlbrief.service` | Systemd service file (native deployment) |

### Useful Commands

```bash
# Test health
curl -s https://crawlbrief.yourdomain.com/health | jq

# Trigger monitor manually
curl -X POST https://crawlbrief.yourdomain.com/trigger/your-monitor-id \
  -H "Authorization: Bearer YOUR_API_TOKEN"

# View pending notifications
docker exec crawlbrief-postgres psql -U crawlbrief -d crawlbrief -c "SELECT * FROM notifications WHERE status = 'pending';"

# View recent crawl runs
docker exec crawlbrief-postgres psql -U crawlbrief -d crawlbrief -c "SELECT * FROM crawl_runs ORDER BY started_at DESC LIMIT 10;"
```
