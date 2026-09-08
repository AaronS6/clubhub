# --- Web service Dockerfile (Next.js standalone) -----------------------------
# Multi-stage build for a small production image.
FROM node:20-slim AS base
RUN npm install -g bun
WORKDIR /app

# Install dependencies (cached layer)
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

# Copy the standalone build output
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/standalone/.next ./.next
COPY --from=base /app/.next/standalone/public ./public

# Prisma needs its schema + engine binaries
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=base /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
# Render sets the PORT env var; the standalone server respects it.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Push the schema on startup, then start the server.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node server.js"]
