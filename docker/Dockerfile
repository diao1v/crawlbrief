FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Build stage
FROM base AS builder

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build TypeScript
RUN pnpm build

# Production stage
FROM base AS production

ENV NODE_ENV=production

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built files and migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S crawlbrief -u 1001 && \
    chown -R crawlbrief:nodejs /app

USER crawlbrief

EXPOSE 3001

CMD ["node", "dist/index.js"]
