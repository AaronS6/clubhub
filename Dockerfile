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

# Build the app (prisma generate + next build)
COPY . .
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

# Startup: run the DB migration in the background (so it doesn't block the
# port binding — Render times out if no port opens within ~60s), then start
# the Next.js server. The server binds to PORT (set by Render) on 0.0.0.0.
ENV HOSTNAME=0.0.0.0

CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --accept-data-loss --schema=./prisma/schema.prisma & node server.js"]
