# --- Realtime worker Dockerfile (socket.io mini-service) ---------------------
FROM oven/bun:1 AS base
WORKDIR /app

COPY mini-services/realtime/package.json ./
RUN bun install

COPY mini-services/realtime/index.ts ./
COPY mini-services/realtime/tsconfig.json ./

# Render sets PORT (public WebSocket port) + EMIT_PORT (internal emit API).
EXPOSE 3003

CMD ["bun", "index.ts"]
