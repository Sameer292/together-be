FROM oven/bun:1.4.2 AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY drizzle ./drizzle
USER bun
EXPOSE 3000
CMD ["bun", "src/index.ts"]
