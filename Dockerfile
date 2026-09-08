# --- Web service Dockerfile (Next.js standalone) -----------------------------
# Multi-stage build for a small production image.
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

# OpenSSL is needed by Prisma's query engine at runtime too.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the standalone build output
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/standalone/.next ./.next
COPY --from=base /app/.next/standalone/public ./public

# Prisma needs its schema, engine binaries, AND the prisma CLI (pinned version)
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=base /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=base /app/node_modules/prisma ./node_modules/prisma
COPY --from=base /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

EXPOSE 3000
# Render sets the PORT env var; the standalone server respects it.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Push the schema on startup (using the PINNED prisma version, not npx),
# then start the server.
CMD ["sh", "-c", "./node_modules/.bin/prisma db push --accept-data-loss && node server.js"]
