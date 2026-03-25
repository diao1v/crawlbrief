import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CRAWLBRIEF_DATABASE_URL || 'postgresql://crawlbrief:crawlbrief@localhost:5433/crawlbrief',
  },
});
