import { WebClient } from '@slack/web-api';
import { eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/index.js';
import { SlackError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface SlackMessage {
  monitorName: string;
  articleUrl: string;
  headline: string;
  summary: string;
  keyFeatures: string[];
  category: string;
  relevanceScore: number | null;
}

export class SlackService {
  private client: WebClient;
  private channelId: string;

  constructor() {
    // Config validation is handled by Zod at startup, so these are guaranteed to exist
    this.client = new WebClient(config.CRAWLBRIEF_SLACK_BOT_TOKEN);
    this.channelId = config.CRAWLBRIEF_SLACK_CHANNEL_ID;
  }

  async sendArticleNotification(message: SlackMessage): Promise<string | undefined> {
    logger.info({ headline: message.headline }, 'Sending Slack notification');

    const categoryEmoji = this.getCategoryEmoji(message.category);
    const featuresText = message.keyFeatures.map((f) => `  - ${f}`).join('\n');
    const relevanceText = message.relevanceScore
      ? `Relevance: ${message.relevanceScore}/10`
      : '';

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${categoryEmoji} New from ${message.monitorName}`,
          emoji: true,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${message.headline}*\n\n${message.summary}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Key Features:*\n${featuresText}`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${relevanceText} | Category: ${message.category}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${message.articleUrl}|Read full article>`,
        },
      },
    ];

    try {
      const result = await this.client.chat.postMessage({
        channel: this.channelId,
        blocks,
        text: `New article from ${message.monitorName}: ${message.headline}`,
      });

      logger.info(
        { ts: result.ts, channel: result.channel },
        'Slack notification sent successfully'
      );

      return result.ts;
    } catch (error) {
      logger.error({ error }, 'Failed to send Slack notification');
      throw new SlackError('Failed to send Slack message', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getCategoryEmoji(category: string): string {
    switch (category) {
      case 'feature':
        return ':rocket:';
      case 'improvement':
        return ':sparkles:';
      case 'announcement':
        return ':mega:';
      default:
        return ':newspaper:';
    }
  }
}

let slackService: SlackService | null = null;

export function getSlackService(): SlackService {
  if (!slackService) {
    slackService = new SlackService();
  }
  return slackService;
}

/**
 * Process pending notifications by sending them to Slack.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent concurrent processing.
 */
export async function processNotifications(): Promise<void> {
  const slack = getSlackService();

  // Process notifications with row-level locking
  // This prevents concurrent cron jobs from processing the same notification
  await db.transaction(async (tx) => {
    // Get pending notification IDs with lock (skip already-locked rows)
    const lockedNotifications = await tx
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(eq(schema.notifications.status, 'pending'))
      .orderBy(schema.notifications.id)
      .limit(10)
      .for('update', { skipLocked: true });

    if (lockedNotifications.length === 0) {
      return;
    }

    logger.info(
      { count: lockedNotifications.length },
      'Processing pending notifications'
    );

    // Fetch full notification data for locked rows
    for (const { id: notificationId } of lockedNotifications) {
      const notification = await tx.query.notifications.findFirst({
        where: eq(schema.notifications.id, notificationId),
        with: {
          article: {
            with: {
              monitor: true,
            },
          },
          summary: true,
        },
      });

      if (!notification || !notification.article || !notification.summary) {
        logger.warn({ notificationId }, 'Notification missing article or summary');
        continue;
      }

      try {
        const messageTs = await slack.sendArticleNotification({
          monitorName: notification.article.monitor?.name || 'Unknown',
          articleUrl: notification.article.url,
          headline: notification.summary.headline,
          summary: notification.summary.summary,
          keyFeatures: notification.summary.keyFeatures,
          category: notification.summary.category,
          relevanceScore: notification.summary.relevanceScore,
        });

        await tx
          .update(schema.notifications)
          .set({
            status: 'sent',
            slackMessageTs: messageTs,
            sentAt: new Date(),
            attempts: sql`${schema.notifications.attempts} + 1`,
          })
          .where(eq(schema.notifications.id, notification.id));
      } catch (error) {
        logger.error(
          { notificationId: notification.id, error },
          'Failed to send notification'
        );

        await tx
          .update(schema.notifications)
          .set({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            attempts: sql`${schema.notifications.attempts} + 1`,
          })
          .where(eq(schema.notifications.id, notification.id));
      }
    }
  });
}
