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
    schedule: '0 9 * * *', // Daily at 9:00 AM (in configured timezone)
    enabled: true,
  },
];

export function getMonitorById(id: string): MonitorConfig | undefined {
  return monitors.find((m) => m.id === id);
}

export function getEnabledMonitors(): MonitorConfig[] {
  return monitors.filter((m) => m.enabled);
}
