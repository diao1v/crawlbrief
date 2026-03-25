import { vi } from 'vitest';
import type { ScrapeResult, BatchScrapeJobResult } from '../../src/types/index.js';

// Mock scrape result
export function createMockScrapeResult(overrides: Partial<ScrapeResult> = {}): ScrapeResult {
  return {
    markdown: '# Test Article\n\nThis is test content.',
    metadata: {
      title: 'Test Article',
      description: 'A test article description',
      url: 'https://example.com/article',
    },
    ...overrides,
  };
}

// Mock batch scrape job result
export function createMockBatchScrapeJobResult(
  overrides: Partial<BatchScrapeJobResult> = {}
): BatchScrapeJobResult {
  return {
    jobId: 'test-job-id',
    status: 'completed',
    totalCount: 1,
    completedCount: 1,
    results: [createMockScrapeResult()],
    ...overrides,
  };
}

// Mock listing page markdown
export const mockListingMarkdown = `
# Company Blog

## Latest Updates

### [New AI Feature Launch](https://example.com/blog/ai-feature)
Published: 2024-01-15
We're excited to announce our new AI-powered feature...

### [Performance Improvements](https://example.com/blog/performance)
Published: 2024-01-10
Major performance updates to our platform...

### [Q4 2023 Recap](https://example.com/blog/q4-recap)
Published: 2024-01-05
A look back at our achievements in Q4...
`;

// Mock article markdown
export const mockArticleMarkdown = `
# New AI Feature Launch

Published: January 15, 2024

We're thrilled to announce our latest AI-powered feature that will transform how you work.

## Key Features

- **Smart Suggestions**: AI-powered recommendations based on your workflow
- **Automated Reports**: Generate comprehensive reports with one click
- **Natural Language Search**: Find anything using plain English queries

## How It Works

Our new AI system uses advanced machine learning to understand your needs and provide relevant assistance.

## Getting Started

To enable this feature, visit Settings > AI Features and toggle on "Smart Assistant".
`;

// Mock extracted articles response
export const mockExtractedArticles = {
  articles: [
    {
      url: 'https://example.com/blog/ai-feature',
      title: 'New AI Feature Launch',
      publishedDate: '2024-01-15',
      excerpt: "We're excited to announce our new AI-powered feature...",
    },
    {
      url: 'https://example.com/blog/performance',
      title: 'Performance Improvements',
      publishedDate: '2024-01-10',
      excerpt: 'Major performance updates to our platform...',
    },
  ],
};

// Mock article summary response
export const mockArticleSummary = {
  headline: 'New AI-Powered Smart Assistant Feature',
  summary:
    'The company launched a new AI feature with smart suggestions, automated reports, and natural language search capabilities.',
  keyFeatures: [
    'Smart Suggestions based on workflow',
    'One-click automated reports',
    'Natural language search',
  ],
  category: 'feature' as const,
  relevanceScore: 8,
};

// Create mock fetch function
export function createMockFetch(responses: Map<string, Response | (() => Response)>) {
  return vi.fn(async (url: string, options?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    const response = responses.get(urlStr);
    if (response) {
      return typeof response === 'function' ? response() : response;
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  });
}

// Create JSON response helper
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
