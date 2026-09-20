FROM mcr.microsoft.com/playwright:v1.62.1-noble AS base

FROM base AS deps
WORKDIR /app
RUN npm install --global pnpm@10.0.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
RUN npm install --global pnpm@10.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
RUN npm install --global pnpm@10.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/next.config.mjs /app/tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=8000
ENV HOSTNAME=0.0.0.0

EXPOSE 8000

USER pwuser

CMD ["sh", "-c", "pnpm db:migrate && exec pnpm start"]
