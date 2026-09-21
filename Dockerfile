FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

FROM base AS deps
WORKDIR /app
RUN npm install --global pnpm@11.1.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Hoisted so that individual packages can be copied into the runner without pnpm's symlinks.
FROM base AS prod-deps
WORKDIR /app
RUN npm install --global pnpm@11.1.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --config.node-linker=hoisted

FROM base AS builder
WORKDIR /app
RUN npm install --global pnpm@11.1.3
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN pnpm exec esbuild scripts/migrate.ts --bundle --platform=node --format=esm --outfile=.next/migrate.mjs
RUN pnpm exec esbuild scripts/audit-worker.ts --bundle --platform=node --format=esm --outfile=.next/audit-worker.mjs
RUN pnpm exec esbuild scripts/start-processes.ts --bundle --platform=node --format=esm --outfile=.next/start-processes.mjs
RUN pnpm exec esbuild src/audit.ts --bundle --platform=node --format=esm --external:playwright --external:playwright-core --outfile=.next/audit.mjs

FROM base AS runner
WORKDIR /app
COPY --from=builder --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=builder --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=builder --chown=pwuser:pwuser /app/public ./public
COPY --from=builder --chown=pwuser:pwuser /app/.next/migrate.mjs ./migrate.mjs
COPY --from=builder --chown=pwuser:pwuser /app/.next/audit.mjs ./audit.mjs
COPY --from=builder --chown=pwuser:pwuser /app/.next/audit-worker.mjs ./audit-worker.mjs
COPY --from=builder --chown=pwuser:pwuser /app/.next/start-processes.mjs ./start-processes.mjs
COPY --from=builder --chown=pwuser:pwuser /app/drizzle ./drizzle
COPY --from=prod-deps --chown=pwuser:pwuser /app/node_modules/playwright ./node_modules/playwright
COPY --from=prod-deps --chown=pwuser:pwuser /app/node_modules/playwright-core ./node_modules/playwright-core

ENV NODE_ENV=production
ENV PORT=8000
ENV HOSTNAME=0.0.0.0
ENV AUDIT_SCRIPT=/app/audit.mjs

EXPOSE 8000

USER pwuser

CMD ["sh", "-c", "node migrate.mjs && exec node start-processes.mjs"]
