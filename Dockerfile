# --- Web service Dockerfile (Next.js standalone) -----------------------------
# Multi-stage build. The runner ships ONLY the standalone trace (server.js +
# the exact node_modules Next traced) plus the Prisma client runtime — NOT the
# full node_modules (that was ~1.2GB; see the size notes below).
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

# Prune nothing here — the runner below never receives the full node_modules,
# only the standalone trace + the explicitly-copied Prisma/sharp packages.

# --- Production image --------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL is needed by Prisma's query engine at runtime.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# 1) The standalone build: server.js + .next/static + public + the exact
#    node_modules subset Next.js traced for the server (includes next-auth,
#    @prisma/client, sharp + its platform binaries, recharts, etc.).
#    The `bun run build` script already copies static/ and public/ INTO
#    .next/standalone, so this one COPY is the whole app.
COPY --from=base /app/.next/standalone ./

# 2) Prisma's generated client + query engine. Next's output tracing usually
#    includes these, but historically it has missed the engine binary / the
#    symlinked layout Prisma uses — copying them explicitly (they're only
#    ~100MB combined) is cheap insurance vs. shipping the FULL node_modules
#    (~1.2GB), which is what made the image huge before.
COPY --from=base /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=base /app/node_modules/@prisma/client ./node_modules/@prisma/client

# sharp's platform binaries live in optional scoped packages (@img/*) — the
# standalone trace normally grabs them, but like Prisma we copy explicitly so
# avatar/banner processing can't 500 on a missing binary.
COPY --from=base /app/node_modules/@img ./node_modules/@img
COPY --from=base /app/node_modules/sharp ./node_modules/sharp

# Prisma schema (kept for reference / manual `prisma db push` sessions; the
# pooler doesn't support it so tables are created via the Supabase SQL editor).
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
# accepted by Node instead of returning HTTP 431 before the app can clean it
# up. See src/middleware.ts.
ENV NODE_OPTIONS="--max-old-space-size=384 --max-http-header-size=65536"

# Start the server immediately. Tables are created manually via Supabase SQL
# Editor (the pooler doesn't support prisma db push's prepared statements).
CMD ["node", "server.js"]
