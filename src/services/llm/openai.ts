import OpenAI from 'openai';
import { config } from '../../config.js';
import { LLMError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { extractedArticlesSchema, type ExtractedArticles } from '../../schemas/extraction.js';
import { articleSummarySchema, type ArticleSummary } from '../../schemas/summary.js';
import { formatExtractionPrompt, formatSummaryPrompt } from './prompts.js';
import type { LLMProvider } from './types.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly model: string;
  private client: OpenAI;

  constructor() {
    const useGateway = !!config.CRAWLBRIEF_CF_AI_GATEWAY_URL;
    const useByok = config.CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK;

    // BYOK mode: API keys stored in Cloudflare, not required locally
    // Standard mode: API key required in .env
    if (!useByok && !config.CRAWLBRIEF_OPENAI_API_KEY) {
      throw new LLMError('OpenAI API key not configured');
    }

    this.model = config.CRAWLBRIEF_OPENAI_MODEL;

    const baseURL = useGateway
      ? `${config.CRAWLBRIEF_CF_AI_GATEWAY_URL}/openai`
      : undefined;

    // Build headers for Cloudflare AI Gateway
    const defaultHeaders: Record<string, string> = {};
    if (useGateway && config.CRAWLBRIEF_CF_AI_GATEWAY_TOKEN) {
      defaultHeaders['cf-aig-authorization'] = `Bearer ${config.CRAWLBRIEF_CF_AI_GATEWAY_TOKEN}`;
    }

    // For BYOK: use placeholder key (Cloudflare injects the real key)
    // For standard: use the configured API key
    const apiKey = useByok ? 'byok-placeholder' : config.CRAWLBRIEF_OPENAI_API_KEY!;

    this.client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
    });

    if (useGateway) {
      logger.info(
        { baseURL, authenticated: !!config.CRAWLBRIEF_CF_AI_GATEWAY_TOKEN, byok: useByok },
        'OpenAI using Cloudflare AI Gateway'
      );
    }
  }

  async extractArticles(
    markdown: string,
    baseUrl: string,
    customPrompt?: string
  ): Promise<ExtractedArticles> {
    const systemPrompt = formatExtractionPrompt(baseUrl, customPrompt);

    logger.debug({ model: this.model, baseUrl }, 'Extracting articles with OpenAI');

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: markdown },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LLMError('OpenAI returned empty response');
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
        throw new LLMError('Failed to parse OpenAI response as JSON', {
          cause: error.message,
        });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw new LLMError('OpenAI response did not match expected schema', {
          cause: error.message,
        });
      }

      throw new LLMError('OpenAI API request failed', {
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

    logger.debug({ model: this.model, articleUrl }, 'Summarizing article with OpenAI');

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: markdown },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LLMError('OpenAI returned empty response');
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
        throw new LLMError('Failed to parse OpenAI response as JSON', {
          cause: error.message,
        });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw new LLMError('OpenAI response did not match expected schema', {
          cause: error.message,
        });
      }

      throw new LLMError('OpenAI API request failed', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
