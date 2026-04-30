import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { PageFailure } from '../db/schema.js';

/**
 * Atomically increment failedCount and append a failure entry to crawl_runs.failure_summary.
 * Safe under concurrent webhook events (uses jsonb || at the DB level).
 */
export async function recordRunFailure(
  crawlRunId: number,
  failure: PageFailure
): Promise<void> {
  await db
    .update(schema.crawlRuns)
    .set({
      failedCount: sql`${schema.crawlRuns.failedCount} + 1`,
      failureSummary: sql`coalesce(${schema.crawlRuns.failureSummary}, '[]'::jsonb) || ${JSON.stringify([failure])}::jsonb`,
    })
    .where(eq(schema.crawlRuns.id, crawlRunId));
}
