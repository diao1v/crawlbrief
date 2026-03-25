1. Context
crawlbrief is a self-hosted TypeScript application that monitors selected websites on a schedule, detects changes through firecrawl-gateway, stores raw and derived data in PostgreSQL, generates AI summaries, and sends Slack notifications when new or meaningful content appears. This repo is the product layer and should remain focused on monitoring workflow, persistence, summarization, and notifications rather than scraping infrastructure.

2. Problem
A monitoring product needs more than scraping: it must remember prior runs, detect newly discovered article URLs, avoid duplicate processing, persist raw content, generate summaries, and avoid duplicate Slack notifications. Those product concerns do not belong inside Firecrawl or the shared gateway layer.

3. Goals
Monitor configured sites on a schedule.

Call firecrawl-gateway instead of talking to Firecrawl directly.

Store raw listing and article content in PostgreSQL.

Deduplicate discovered article URLs.

Generate AI summaries for newly discovered content.

Send Slack notifications only when appropriate.

4. Non-goals
Do not implement a full RAG system in version 1.

Do not expose product logic through the shared scraping repo.

Do not overbuild an admin UI before the core monitoring loop works.

Do not rely on Firecrawl’s internal database as the application source of truth.

5. Proposed design
CrawlBrief will run scheduled jobs, call the gateway for listing-page and article-page scrapes, store raw responses, identify new URLs, generate summaries, and push notifications to Slack. PostgreSQL will hold application data such as monitors, runs, discovered articles, raw content, summaries, and notification history.

6. Architecture
Request flow:

Scheduler starts a monitor run.

CrawlBrief loads enabled monitors from PostgreSQL.

CrawlBrief calls firecrawl-gateway for the listing page.

CrawlBrief stores the raw listing result.

CrawlBrief extracts candidate article URLs.

CrawlBrief deduplicates those URLs against stored records.

CrawlBrief fetches raw markdown for newly discovered articles through the gateway.

CrawlBrief stores raw article content.

CrawlBrief generates AI summaries.

CrawlBrief sends Slack notifications and records delivery state.

7. Core principles
Raw content is the source of truth.

Summaries are derived output and can be regenerated later.

Deduplicate before expensive AI work.

Notify only on meaningful changes or new discoveries.

Depend on the gateway contract, not Firecrawl internals.

8. Data design
Recommended tables:

monitors for source config and schedule.

crawl_runs for execution history.

articles for discovered article identities.

article_content for raw page markdown and metadata.

summaries for AI output.

notifications for delivery history.

Key data rule:

Metadata belongs with raw content storage, while summaries remain separate derived data.

9. Repo structure
Suggested structure:

src/index.ts for app bootstrap.

src/cron.ts for scheduling.

src/monitor.ts for orchestration per monitor run.

src/gateway-client.ts for calling firecrawl-gateway.

src/db.ts for PostgreSQL access.

src/summarize.ts for LLM calls.

src/slack.ts for Slack delivery.

migrations/ for schema management.

10. Deployment
CrawlBrief can run on the same Oracle VPS as the gateway and Firecrawl stack in version 1. If CrawlBrief only needs internal scheduled execution, it does not need to be exposed publicly at all.

Recommended services:

crawlbrief-app

postgres-crawlbrief

Optional public exposure:

only if you later add admin endpoints, manual trigger endpoints, or a small dashboard.

11. Security
Store secrets in environment variables.

Use a gateway Bearer token when calling firecrawl-gateway.

Keep PostgreSQL private on the internal network.

Record notification state so retries do not create duplicate Slack sends.

12. Observability
CrawlBrief should log:

monitor ID,

run ID,

schedule start and finish,

number of discovered URLs,

number of new articles,

summary failures,

Slack delivery failures.

13. Build plan
Phase 1:

Create PostgreSQL schema.

Implement gateway client.

Implement one monitor runner.

Store listing results.

Deduplicate article URLs.

Phase 2:

Fetch article markdown for new URLs.

Store raw content.

Add AI summary generation.

Add Slack notifications.

Phase 3:

Add multiple monitors.

Add retries and better error handling.

Add optional digest mode or admin endpoints if needed.

14. Key decisions
Keep CrawlBrief as a separate repo because it is a product, not infrastructure.

Store application data in its own PostgreSQL database.

Put summarization in CrawlBrief instead of the shared gateway so prompts and output format stay product-specific.

Keep CrawlBrief dependent on the gateway rather than direct Firecrawl calls.

15. Risks
Noisy page changes may create false positives if parsing is too naive.

Weak dedup logic could cause repeated summaries and duplicate notifications.

Early schema decisions may need revision once multiple monitor types are added.

16. Final decision
Proceed with crawlbrief as the application repo that consumes firecrawl-gateway, owns PostgreSQL persistence, performs AI summarization, and sends Slack notifications for newly discovered content.