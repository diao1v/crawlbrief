import { describe, it, expect } from 'vitest';
import { articleSummarySchema } from '../../../src/schemas/summary.js';

describe('Summary Schema', () => {
  describe('articleSummarySchema', () => {
    it('should validate a complete summary object', () => {
      const summary = {
        headline: 'New Feature Launch',
        summary: 'A comprehensive summary of the new feature.',
        keyFeatures: ['Feature 1', 'Feature 2', 'Feature 3'],
        category: 'feature',
        relevanceScore: 8,
      };

      const result = articleSummarySchema.parse(summary);

      expect(result.headline).toBe('New Feature Launch');
      expect(result.summary).toBe('A comprehensive summary of the new feature.');
      expect(result.keyFeatures).toHaveLength(3);
      expect(result.category).toBe('feature');
      expect(result.relevanceScore).toBe(8);
    });

    it('should validate all category types', () => {
      const categories = ['feature', 'improvement', 'announcement', 'other'] as const;

      for (const category of categories) {
        const summary = {
          headline: 'Test',
          summary: 'Test summary',
          keyFeatures: [],
          category,
          relevanceScore: 5,
        };

        const result = articleSummarySchema.parse(summary);
        expect(result.category).toBe(category);
      }
    });

    it('should reject invalid category', () => {
      const summary = {
        headline: 'Test',
        summary: 'Test summary',
        keyFeatures: [],
        category: 'invalid_category',
        relevanceScore: 5,
      };

      expect(() => articleSummarySchema.parse(summary)).toThrow();
    });

    it('should validate relevance score range (1-10)', () => {
      const validScores = [1, 5, 10];
      const invalidScores = [0, -1, 11, 100];

      for (const score of validScores) {
        const summary = {
          headline: 'Test',
          summary: 'Test',
          keyFeatures: [],
          category: 'feature',
          relevanceScore: score,
        };

        const result = articleSummarySchema.parse(summary);
        expect(result.relevanceScore).toBe(score);
      }

      for (const score of invalidScores) {
        const summary = {
          headline: 'Test',
          summary: 'Test',
          keyFeatures: [],
          category: 'feature',
          relevanceScore: score,
        };

        expect(() => articleSummarySchema.parse(summary)).toThrow();
      }
    });

    it('should require integer relevance score', () => {
      const summary = {
        headline: 'Test',
        summary: 'Test',
        keyFeatures: [],
        category: 'feature',
        relevanceScore: 5.5,
      };

      expect(() => articleSummarySchema.parse(summary)).toThrow();
    });

    it('should validate empty key features array', () => {
      const summary = {
        headline: 'Test',
        summary: 'Test summary',
        keyFeatures: [],
        category: 'other',
        relevanceScore: 3,
      };

      const result = articleSummarySchema.parse(summary);
      expect(result.keyFeatures).toHaveLength(0);
    });

    it('should reject missing required fields', () => {
      const requiredFields = ['headline', 'summary', 'keyFeatures', 'category', 'relevanceScore'];

      for (const field of requiredFields) {
        const summary: Record<string, unknown> = {
          headline: 'Test',
          summary: 'Test',
          keyFeatures: [],
          category: 'feature',
          relevanceScore: 5,
        };
        delete summary[field];

        expect(() => articleSummarySchema.parse(summary)).toThrow();
      }
    });

    it('should require keyFeatures to be string array', () => {
      const summary = {
        headline: 'Test',
        summary: 'Test',
        keyFeatures: [1, 2, 3], // Numbers instead of strings
        category: 'feature',
        relevanceScore: 5,
      };

      expect(() => articleSummarySchema.parse(summary)).toThrow();
    });
  });
});
