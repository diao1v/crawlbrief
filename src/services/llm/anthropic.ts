import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';
import { LLMError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { extractedArticlesSchema, type ExtractedArticles } from '../../schemas/extraction.js';
import { articleSummarySchema, type ArticleSummary } from '../../schemas/summary.js';
import { formatExtractionPrompt, formatSummaryPrompt } from './prompts.js';
import type { LLMProvider } from './types.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private client: Anthropic;

  constructor() {
    const useGateway = !!config.CRAWLBRIEF_CF_AI_GATEWAY_URL;
    const useByok = config.CRAWLBRIEF_CF_AI_GATEWAY_USE_BYOK;

    // BYOK mode: API keys stored in Cloudflare, not required locally
    // Standard mode: API key required in .env
    if (!useByok && !config.CRAWLBRIEF_ANTHROPIC_API_KEY) {
      throw new LLMError('Anthropic API key not configured');
    }

    this.model = config.CRAWLBRIEF_ANTHROPIC_MODEL;

    const baseURL = useGateway
      ? `${config.CRAWLBRIEF_CF_AI_GATEWAY_URL}/anthropic`
      : undefined;

    // Build headers for Cloudflare AI Gateway
    const defaultHeaders: Record<string, string> = {};
    if (useGateway && config.CRAWLBRIEF_CF_AI_GATEWAY_TOKEN) {
      defaultHeaders['cf-aig-authorization'] = `Bearer ${config.CRAWLBRIEF_CF_AI_GATEWAY_TOKEN}`;
    }

    // For BYOK: use placeholder key (Cloudflare injects the real key)
    // For standard: use the configured API key
    const apiKey = useByok ? 'byok-placeholder' : config.CRAWLBRIEF_ANTHROPIC_API_KEY!;

    this.client = new Anthropic({
      apiKey,
      baseURL,
      defaultHeaders: Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
    });

    if (useGateway) {
      logger.info(
        { baseURL, authenticated: !!config.CRAWLBRIEF_CF_AI_GATEWAY_TOKEN, byok: useByok },
        'Anthropic using Cloudflare AI Gateway'
      );
    }
  }

  private extractJsonFromResponse(content: string): string {
    // Anthropic may wrap JSON in markdown code blocks
    // Try with closing backticks first
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1].trim();
    }
    // Try without closing backticks (Anthropic sometimes omits them)
    const openMatch = content.match(/```(?:json)?\s*([\s\S]*)/);
    if (openMatch && openMatch[1]) {
      return openMatch[1].trim();
    }
    // Try to find raw JSON object/array
    const rawJson = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (rawJson && rawJson[1]) {
      return rawJson[1].trim();
    }
    return content.trim();
  }

  /**
   * Trim markdown to reduce noise for LLM processing.
   * Removes common boilerplate and limits total size.
   */
  private trimMarkdown(markdown: string, maxChars = 30000): string {
    // Remove lines that are just country names (from form dropdowns)
    let trimmed = markdown.replace(/^.*(?:Afghanistan|Bahrain|Bangladesh|Cameroon|Denmark|Ecuador).*$/gm, '');
    // Collapse multiple blank lines
    trimmed = trimmed.replace(/\n{3,}/g, '\n\n');
    // Truncate if still too long
    if (trimmed.length > maxChars) {
      trimmed = trimmed.substring(0, maxChars);
    }
    return trimmed.trim();
  }

  async extractArticles(
    markdown: string,
    baseUrl: string,
    customPrompt?: string
  ): Promise<ExtractedArticles> {
    const trimmedMarkdown = this.trimMarkdown(markdown);
    const systemPrompt = formatExtractionPrompt(baseUrl, customPrompt);

    logger.debug({ model: this.model, baseUrl, originalLength: markdown.length, trimmedLength: trimmedMarkdown.length }, 'Extracting articles with Anthropic');

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: trimmedMarkdown }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new LLMError('Anthropic returned no text content');
      }

      if (response.stop_reason === 'max_tokens') {
        logger.warn('Anthropic response truncated due to max_tokens limit');
      }

      const jsonContent = this.extractJsonFromResponse(textBlock.text);
      const parsed = JSON.parse(jsonContent);
      const validated = extractedArticlesSchema.parse(parsed);

      logger.info(
        {
          articlesFound: validated.articles.length,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        'Articles extracted successfully'
      );

      return validated;
    } catch (error) {
      if (error instanceof LLMError) throw error;

      if (error instanceof SyntaxError) {
        throw new LLMError('Failed to parse Anthropic response as JSON', {
          cause: error.message,
        });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw new LLMError('Anthropic response did not match expected schema', {
          cause: error.message,
        });
      }

      throw new LLMError('Anthropic API request failed', {
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

    logger.debug({ model: this.model, articleUrl }, 'Summarizing article with Anthropic');

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: markdown }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new LLMError('Anthropic returned no text content');
      }

      const jsonContent = this.extractJsonFromResponse(textBlock.text);
      const parsed = JSON.parse(jsonContent);
      const validated = articleSummarySchema.parse(parsed);

      logger.info(
        {
          headline: validated.headline,
          category: validated.category,
          relevanceScore: validated.relevanceScore,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        'Article summarized successfully'
      );

      return validated;
    } catch (error) {
      if (error instanceof LLMError) throw error;

      if (error instanceof SyntaxError) {
        throw new LLMError('Failed to parse Anthropic response as JSON', {
          cause: error.message,
        });
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw new LLMError('Anthropic response did not match expected schema', {
          cause: error.message,
        });
      }

      throw new LLMError('Anthropic API request failed', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
