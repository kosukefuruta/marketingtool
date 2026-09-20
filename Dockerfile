FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

RUN npm install --global pnpm@10.0.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

USER pwuser

CMD ["pnpm", "start"]
