import type { PageFailure } from '../db/schema.js';

export type { PageFailure } from '../db/schema.js';

/**
 * Decide whether a scraped page should be skipped before LLM/dedup processing.
 * Returns null if the page is good, or a PageFailure record describing why it should be skipped.
 */
export function classifyPage(
  url: string | undefined,
  markdown: string | undefined,
  metadata: { statusCode?: number } | null | undefined
): PageFailure | null {
  if (!url) {
    return { url: '', statusCode: null, reason: 'no_url' };
  }
  const sc = metadata?.statusCode;
  if (typeof sc === 'number' && sc >= 400) {
    return { url, statusCode: sc, reason: 'http_error' };
  }
  if (!markdown || markdown.trim().length === 0) {
    return { url, statusCode: typeof sc === 'number' ? sc : null, reason: 'no_content' };
  }
  return null;
}

/**
 * Normalize a title for cross-domain dedup.
 * Lowercase, trim, collapse internal whitespace.
 */
export function normalizeTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const normalized = title.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}
