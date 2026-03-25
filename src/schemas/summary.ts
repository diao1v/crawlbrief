import { z } from 'zod';

export const articleSummarySchema = z.object({
  headline: z.string(),
  summary: z.string(),
  keyFeatures: z.array(z.string()),
  category: z.enum(['feature', 'improvement', 'announcement', 'other']),
  relevanceScore: z.number().int().min(1).max(10),
});

export type ArticleSummary = z.infer<typeof articleSummarySchema>;
