#!/bin/sh
# Startup script for the Render web service.
# Runs the database migration SYNCHRONOUSLY (with retries) before starting
# the Next.js server. The migration usually takes 5-15 seconds — well within
# Render's 60-second port-scan timeout. The retries handle Supabase cold
# starts (the first connection to a paused Supabase DB can take 10-30s).

echo "[startup] running database migration..."
MIGRATED=false
for i in 1 2 3 4 5; do
  echo "[startup] migration attempt $i/5..."
  if node node_modules/prisma/build/index.js db push --accept-data-loss --schema=./prisma/schema.prisma 2>&1; then
    echo "[startup] migration succeeded on attempt $i"
    MIGRATED=true
    break
  fi
  echo "[startup] attempt $i failed, waiting 3s before retry..."
  sleep 3
done

if [ "$MIGRATED" = "false" ]; then
  echo "[startup] WARNING: migration failed after 5 attempts. Starting server anyway — signup/login will fail until the database is migrated. Run the migration manually via the Render Shell."
fi

echo "[startup] starting Next.js server..."
exec node server.js
