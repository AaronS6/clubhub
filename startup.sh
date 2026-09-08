#!/bin/sh
# Startup script for the Render web service.
#
# STRATEGY: Start the Next.js server FIRST (so Render's port scanner detects
# port 3000 immediately and the deploy succeeds), then run the database
# migration in the background with retries. The migration connects to
# Supabase (which can take 30-60s to cold-start) — if we blocked on it,
# Render's 60s port-scan timeout would kill the deploy.
#
# The server returns 500s for DB queries until the migration finishes (~15-30s
# after startup). This is acceptable — the alternative is a failed deploy.

echo "[startup] starting Next.js server (port binding)..."
node server.js &
SERVER_PID=$!

# Give the server 2 seconds to bind the port.
sleep 2

# Run the migration in the background with retries.
(
  echo "[startup] running database migration (background)..."
  for i in 1 2 3 4 5 6 7 8 9 10; do
    echo "[startup] migration attempt $i/10..."
    if node node_modules/prisma/build/index.js db push --accept-data-loss --schema=./prisma/schema.prisma 2>&1; then
      echo "[startup] migration succeeded on attempt $i"
      exit 0
    fi
    echo "[startup] attempt $i failed, waiting 5s before retry..."
    sleep 5
  done
  echo "[startup] WARNING: migration failed after 10 attempts. Database queries will fail until migrated manually."
) &
MIGRATION_PID=$!

# Wait for the server process (keep the container alive).
# If the server exits, the container exits.
wait $SERVER_PID
