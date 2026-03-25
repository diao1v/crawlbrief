import type { ExtractedArticles } from '../../schemas/extraction.js';
import type { ArticleSummary } from '../../schemas/summary.js';

export interface LLMProvider {
  readonly name: string;
  readonly model: string;

  extractArticles(
    markdown: string,
    baseUrl: string,
    customPrompt?: string
  ): Promise<ExtractedArticles>;

  summarizeArticle(
    markdown: string,
    articleUrl: string,
    customPrompt?: string
  ): Promise<ArticleSummary>;
}

export interface LLMResponse<T> {
  data: T;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
