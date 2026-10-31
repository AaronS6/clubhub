/**
 * Node-runtime-only production schema self-heal (imported from src/instrumentation.ts).
 *
 * WHY THIS EXISTS
 *   Production (Render) deploys code that references Prisma models whose
 *   tables were never created in the Supabase Postgres, because the Supabase
 *   transaction pooler rejects `prisma db push` (prepared statements) and the
 *   manual "paste supabase_sync.sql into the SQL Editor" step keeps getting
 *   skipped. The polls deploy shipped exactly that drift: every
 *   `prisma.announcement.findMany()` (which includes the poll relation) 500s
 *   with P2021 — "The table public.AnnouncementPoll does not exist".
 *
 * WHAT THIS DOES
 *   On every server boot (before the app serves traffic), runs the idempotent
 *   DDL from src/lib/schema-sync-statements.ts — CREATE TABLE IF NOT EXISTS,
 *   ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and guarded FK
 *   additions — through a dedicated Prisma client whose connection URL forces
 *   the pooler-safe protocol (pgbouncer=true, no prepared statements). A
 *   database that is already in sync costs a sub-second catalog check; a
 *   drifted database heals itself before the first request arrives.
 *
 *   SQLite (local dev) is skipped entirely — dev schema is owned by
 *   `prisma db:push` (see src/lib/autoseed.ts).
 *
 * SAFETY
 *   • Every statement is idempotent — re-running is always a no-op.
 *   • Failures are logged and NEVER crash the server boot; the manual
 *     supabase_sync.sql script remains the fallback.
 *   • Set CLUBHUB_DISABLE_SCHEMA_SYNC=1 to opt out.
 */

import { PrismaClient } from "@prisma/client"

import { SCHEMA_SYNC_STATEMENTS } from "./schema-sync-statements"

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 5_000

/** Cached so repeated imports/hot reloads never re-run the sync. */
let syncPromise: Promise<boolean> | null = null

export function ensureSchemaSynced(): Promise<boolean> {
  if (!syncPromise) syncPromise = runSchemaSync()
  return syncPromise
}

function isPostgresUrl(url: string | undefined): url is string {
  return !!url && /^postgres(ql)?:\/\//i.test(url)
}

/**
 * Force the pooler-safe connection parameters:
 *   pgbouncer=true     → no prepared statements (required through Supabase's
 *                        transaction pooler; harmless on direct connections)
 *   connection_limit=1 → the sync client is single-purpose and short-lived
 *   connect_timeout=10 → never hang the boot on an unreachable database
 * Existing values in the URL are respected (never overridden).
 */
function poolerSafeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true")
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1")
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "10")
    return u.toString()
  } catch {
    // Unparseable URL — use it verbatim and let Prisma surface the error.
    return rawUrl
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function runSchemaSync(): Promise<boolean> {
  if (process.env.CLUBHUB_DISABLE_SCHEMA_SYNC === "1") return false
  // Never run during `next build` — only real server boots.
  if (process.env.NEXT_PHASE === "phase-production-build") return false

  const url = process.env.DATABASE_URL
  if (!isPostgresUrl(url)) {
    // SQLite dev database — schema is owned by `prisma db:push` (autoseed).
    return false
  }

  const client = new PrismaClient({
    datasourceUrl: poolerSafeUrl(url),
    log: ["error"],
  })

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const failures: { index: number; error: unknown }[] = []
      const startedAt = Date.now()

      for (let i = 0; i < SCHEMA_SYNC_STATEMENTS.length; i++) {
        try {
          await client.$executeRawUnsafe(SCHEMA_SYNC_STATEMENTS[i])
        } catch (error) {
          failures.push({ index: i, error })
        }
      }

      if (failures.length === 0) {
        let tables = -1
        try {
          const rows = (await client.$queryRawUnsafe(
            `SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'`,
          )) as { count: number }[]
          tables = Number(rows[0]?.count ?? -1)
        } catch {
          // Observability only — never fail the sync over the count query.
        }
        console.log(
          `[schema-sync] ✓ schema synced — ${SCHEMA_SYNC_STATEMENTS.length} idempotent statements ` +
            `applied in ${Date.now() - startedAt}ms` +
            (tables >= 0 ? `, ${tables} tables present in 'public'` : "") +
            " (safe to re-run on every boot)",
        )
        return true
      }

      // Retry transient failures (e.g. the database briefly unreachable at
      // boot). Idempotent statements make a full re-run safe.
      const first = failures[0]
      const firstMessage = first.error instanceof Error ? first.error.message : String(first.error)
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[schema-sync] attempt ${attempt}/${MAX_ATTEMPTS} — ${failures.length} statement(s) failed ` +
            `(${firstMessage.slice(0, 200)}); retrying in ${RETRY_DELAY_MS / 1000}s…`,
        )
        await sleep(RETRY_DELAY_MS)
      } else {
        console.error(
          `[schema-sync] ✗ ${failures.length} of ${SCHEMA_SYNC_STATEMENTS.length} statements failed ` +
            `after ${MAX_ATTEMPTS} attempts (first: ${firstMessage.slice(0, 300)})`,
        )
        console.error(
          "[schema-sync] The server will still start, but expect P2021/P2022 errors until the " +
            "schema is healed. Manual fallback: run supabase_sync.sql in the Supabase SQL Editor.",
        )
        return false
      }
    }
    return false
  } finally {
    await client.$disconnect().catch(() => {})
  }
}
