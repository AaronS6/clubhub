# --- Web service Dockerfile (Next.js standalone) -----------------------------
# Multi-stage build. We copy the FULL node_modules into the runner (not
# cherry-picked packages) because Prisma's CLI uses symlinks + relative paths
# to .wasm files that break when copied individually.
FROM node:20-slim AS base
RUN npm install -g bun
# OpenSSL is required by Prisma's query engine on Debian-based images.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies (cached layer). prisma + @prisma/client are in
# package.json — we use the PINNED versions (6.x), not npx (which would
# fetch the latest 7.x with breaking config changes).
COPY package.json bun.lock* ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# Build the app. The committed schema uses SQLite for local dev; flip the
# provider to PostgreSQL here so the generated Prisma client targets the
# Supabase Postgres database in production. The schema has no Postgres-only
# features, so this swap is safe.
COPY . .
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
RUN bun run build

# --- Production image --------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL is needed by Prisma's query engine at runtime.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the standalone build output (server.js + minimal deps)
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/standalone/.next ./.next
COPY --from=base /app/.next/standalone/public ./public

# Copy the FULL node_modules from base — this preserves Prisma's symlinks
# and .wasm files that break when cherry-picked. Also includes @prisma/client
# which the app needs at runtime.
COPY --from=base /app/node_modules ./node_modules

# Prisma schema (needed by `prisma db push`)
COPY --from=base /app/prisma ./prisma

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Limit to 1 worker to stay under Render's 512MB free tier memory limit.
# Multiple workers would each spawn their own Prisma client + connection pool,
# quickly exhausting memory and causing 502 restarts.
ENV WEB_CONCURRENCY=1
# Give Node more memory headroom — the default heap can grow too large and
# trigger OOM kills on the 512MB free tier.
# Also raise the max HTTP header size so a temporarily-bloated Cookie header
# (e.g. stale chunked session cookies before the middleware clears them) is
# accepted by Node instead of returning HTTP 431 before the app can clean
# it up. See src/middleware.ts.
ENV NODE_OPTIONS="--max-old-space-size=384 --max-http-header-size=65536"

# Start the server immediately. Tables are created manually via Supabase SQL
# Editor (the pooler doesn't support prisma db push's prepared statements).
CMD ["node", "server.js"]
