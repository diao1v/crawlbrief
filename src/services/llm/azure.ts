import OpenAI from 'openai';
import { config } from '../../config.js';
import { LLMError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { extractedArticlesSchema, type ExtractedArticles } from '../../schemas/extraction.js';
import { articleSummarySchema, type ArticleSummary } from '../../schemas/summary.js';
import { formatExtractionPrompt, formatSummaryPrompt } from './prompts.js';
import type { LLMProvider } from './types.js';

export class AzureProvider implements LLMProvider {
  readonly name = 'azure';
  readonly model: string;
  private client: OpenAI;

  constructor() {
    if (!config.CRAWLBRIEF_AZURE_MODEL_URL || !config.CRAWLBRIEF_AZURE_MODEL_KEY || !config.CRAWLBRIEF_AZURE_MODEL) {
      throw new LLMError('Azure AI Foundry configuration is incomplete');
    }

    this.model = config.CRAWLBRIEF_AZURE_MODEL;

    // Azure AI Foundry uses 'api-key' header instead of 'Authorization: Bearer'
    this.client = new OpenAI({
      apiKey: 'placeholder',
      baseURL: config.CRAWLBRIEF_AZURE_MODEL_URL,
      defaultHeaders: {
        'api-key': config.CRAWLBRIEF_AZURE_MODEL_KEY!,
      },
    });

    logger.info(
      { baseURL: config.CRAWLBRIEF_AZURE_MODEL_URL, model: this.model },
      'Using Azure AI Foundry'
    );
  }

  async extractArticles(
    markdown: string,
    baseUrl: string,
    customPrompt?: string
  ): Promise<ExtractedArticles> {
    const systemPrompt = formatExtractionPrompt(baseUrl, customPrompt);

    logger.debug({ model: this.model, baseUrl }, 'Extracting articles with Azure');

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: markdown },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LLMError('Azure returned empty response');
      }

      const parsed = JSON.parse(content);
      const validated = extractedArticlesSchema.parse(parsed);

      logger.info(
        {
          articlesFound: validated.articles.length,
          usage: response.usage,
        },
        'Articles extracted successfully'
      );

      return validated;
    } catch (error) {
      if (error instanceof LLMError) throw error;

      if (error instanceof SyntaxError) {
        throw new LLMError('Failed to parse Azure response as JSON', {
          cause: error.message,
        });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw new LLMError('Azure response did not match expected schema', {
          cause: error.message,
        });
      }

      throw new LLMError('Azure API request failed', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async summarizeArticle(
    markdown: string,
    articleUrl: string,
    customPrompt?: string
  ): Promise<ArticleSummary> {
    const systemPrompt = formatSummaryPrompt(articleUrl, customPrompt);

    logger.debug({ model: this.model, articleUrl }, 'Summarizing article with Azure');

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: markdown },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LLMError('Azure returned empty response');
      }

      const parsed = JSON.parse(content);
      const validated = articleSummarySchema.parse(parsed);

      logger.info(
        {
          headline: validated.headline,
          category: validated.category,
          relevanceScore: validated.relevanceScore,
          usage: response.usage,
        },
        'Article summarized successfully'
      );

      return validated;
    } catch (error) {
      if (error instanceof LLMError) throw error;

      if (error instanceof SyntaxError) {
        throw new LLMError('Failed to parse Azure response as JSON', {
          cause: error.message,
        });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw new LLMError('Azure response did not match expected schema', {
          cause: error.message,
        });
      }

      throw new LLMError('Azure API request failed', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
