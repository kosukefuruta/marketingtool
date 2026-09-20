FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

FROM base AS deps
WORKDIR /app
RUN npm install --global pnpm@11.1.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
RUN npm install --global pnpm@11.1.3
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN pnpm exec esbuild scripts/migrate.ts --bundle --platform=node --format=esm --outfile=.next/migrate.mjs

FROM base AS runner
WORKDIR /app
COPY --from=builder --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=builder --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=builder --chown=pwuser:pwuser /app/.next/migrate.mjs ./migrate.mjs
COPY --from=builder --chown=pwuser:pwuser /app/drizzle ./drizzle

ENV NODE_ENV=production
ENV PORT=8000
ENV HOSTNAME=0.0.0.0

EXPOSE 8000

USER pwuser

CMD ["sh", "-c", "node migrate.mjs && exec node server.js"]
