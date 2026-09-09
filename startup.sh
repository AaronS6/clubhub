#!/bin/sh
# Startup script for the Render web service.
#
# The database tables are created manually via the Supabase SQL Editor (see
# supabase_schema.sql) — NOT via `prisma db push`, because Supabase's
# PgBouncer pooler doesn't support the prepared statements that Prisma's
# schema engine uses. So the startup script just starts the server.
#
# If you ever need to change the schema (add a column, etc.):
# 1. Update prisma/schema.prisma
# 2. Regenerate the SQL: `bunx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > supabase_schema.sql`
# 3. Run the new SQL in Supabase's SQL Editor (drop the old tables first if needed)

echo "[startup] starting Next.js server..."
exec node server.js
