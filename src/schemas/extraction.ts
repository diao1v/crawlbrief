import { z } from 'zod';

export const extractedArticleSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  publishedDate: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
});

export const extractedArticlesSchema = z.object({
  articles: z.array(extractedArticleSchema),
});

export type ExtractedArticle = z.infer<typeof extractedArticleSchema>;
export type ExtractedArticles = z.infer<typeof extractedArticlesSchema>;
