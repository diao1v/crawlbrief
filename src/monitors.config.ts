import type { MonitorConfig } from './monitor/types.js';

/**
 * Monitor configurations for tracking competitor websites.
 *
 * Each monitor defines:
 * - id: Unique identifier for the monitor
 * - name: Human-readable name
 * - listingUrl: URL to scrape for article links
 * - schedule: Cron expression for when to run
 * - enabled: Whether the monitor is active
 * - extractionPrompt: Optional custom prompt for URL extraction
 * - summaryPrompt: Optional custom prompt for article summarization
 */
export const monitors: MonitorConfig[] = [
  {
    id: 'ziflow',
    name: 'Ziflow Product Updates',
    listingUrl: 'https://www.ziflow.com/blog?category=117286927702',
    schedule: '0 9 * * *',
    enabled: true,
    extractionPrompt: `You are analyzing a Ziflow blog page filtered to the "Product Updates" category.

Your task is to extract ONLY article links that belong to the "Product Updates" category.

Instructions:
1. Only include articles that are product updates, feature announcements, or release notes
2. Do NOT include articles from other categories like "Creative workflow", "Company news", "Marketing compliance", or "Review and approval"
3. Extract the full URL for each article
4. Extract the title if visible
5. Extract the published date if visible
6. Extract a brief excerpt if available
7. Only include links to actual blog post articles, not navigation links or category links
8. If a URL is relative, construct the full URL using the base URL provided

Base URL: {{BASE_URL}}

Respond with a JSON object in this exact format:
{
  "articles": [
    {
      "url": "https://example.com/article-1",
      "title": "Article Title",
      "publishedDate": "2024-01-15",
      "excerpt": "Brief description..."
    }
  ]
}

If no product update articles are found, return: { "articles": [] }`,
  },
  {
    id: 'filestage',
    name: 'Filestage Changelog',
    listingUrl: 'https://changelog.filestage.io/',
    schedule: '0 9 * * *',
    enabled: true,
  },
  {
    id: 'aproove',
    name: 'Aproove New Releases',
    listingUrl: 'https://www.aproove.com/blog/tag/new-release',
    schedule: '0 9 * * *',
    enabled: true,
  },
  {
    id: 'artworkflowhq',
    name: 'ArtworkFlow Updates',
    listingUrl: '',
    schedule: '0 9 * * *',
    enabled: false, // No listing URL available yet
  },
  {
    id: 'reviewstudio',
    name: 'ReviewStudio Product News',
    listingUrl: 'https://reviewstudio.com/blog/category/reviewstudio-product-news-updates/',
    schedule: '0 9 * * *',
    enabled: true,
  },
  {
    id: 'govisually',
    name: 'GoVisually Updates',
    listingUrl: 'https://updates.govisually.com/',
    schedule: '0 9 * * *',
    enabled: true,
  },
];

export function getMonitorById(id: string): MonitorConfig | undefined {
  return monitors.find((m) => m.id === id);
}

export function getEnabledMonitors(): MonitorConfig[] {
  return monitors.filter((m) => m.enabled);
}
