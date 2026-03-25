export const DEFAULT_EXTRACTION_PROMPT = `You are analyzing a webpage that contains a list of articles, blog posts, or product updates.

Your task is to extract all article links from this page content.

Instructions:
1. Identify all links that appear to be articles, blog posts, or product updates
2. Extract the full URL for each article
3. Extract the title if visible
4. Extract the published date if visible (in any reasonable format)
5. Extract a brief excerpt if available
6. Only include links that are actual content articles, not navigation links, category links, or other non-article pages
7. If a URL is relative, construct the full URL using the base URL provided

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

If no articles are found, return: { "articles": [] }`;

export const DEFAULT_SUMMARY_PROMPT = `You are a competitive intelligence analyst. Your task is to summarize a product update or announcement article.

Instructions:
1. Write a concise headline that captures the main announcement (max 100 characters)
2. Write a 2-3 sentence summary of the key points
3. Extract 3-5 key features or changes mentioned
4. Categorize the article as one of: feature, improvement, announcement, other
5. Rate the relevance score from 1-10 based on how significant this update is for competitive intelligence

Article URL: {{ARTICLE_URL}}

Respond with a JSON object in this exact format:
{
  "headline": "New Feature: AI-Powered Suggestions",
  "summary": "The company launched a new AI feature that helps users...",
  "keyFeatures": ["Feature 1", "Feature 2", "Feature 3"],
  "category": "feature",
  "relevanceScore": 8
}`;

export function formatExtractionPrompt(baseUrl: string, customPrompt?: string): string {
  const template = customPrompt || DEFAULT_EXTRACTION_PROMPT;
  return template.replace('{{BASE_URL}}', baseUrl);
}

export function formatSummaryPrompt(articleUrl: string, customPrompt?: string): string {
  const template = customPrompt || DEFAULT_SUMMARY_PROMPT;
  return template.replace('{{ARTICLE_URL}}', articleUrl);
}
