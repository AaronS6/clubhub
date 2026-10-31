/**
 * Regenerates src/lib/schema-sync-statements.ts from supabase_sync.sql.
 *
 * WHY THIS EXISTS
 *   Production (Render + Supabase pooler) cannot run `prisma db push`
 *   (prepared statements), so schema changes historically required manually
 *   pasting supabase_sync.sql into the Supabase SQL Editor. That step was
 *   missed for the announcement-poll deploy → every announcement feed query
 *   500s with P2021 "The table public.AnnouncementPoll does not exist".
 *
 *   src/lib/schema-sync.ts now runs the SAME idempotent DDL automatically on
 *   every server boot (see src/instrumentation.ts). This script keeps the
 *   embedded statement array in sync with the human-readable SQL file:
 *
 *       1. edit supabase_sync.sql (add tables / columns / indexes / FKs)
 *       2. bun run scripts/gen-schema-sync.ts
 *       3. commit both files together
 *
 * WHAT IS INCLUDED / EXCLUDED
 *   INCLUDED  — sections 1-4 of the SQL file: CREATE TABLE IF NOT EXISTS,
 *              ADD COLUMN IF NOT EXISTS healers, CREATE INDEX IF NOT EXISTS,
 *              and the guarded foreign-key DO block. All idempotent.
 *   EXCLUDED  — section 5 (ENABLE/FORCE ROW LEVEL SECURITY): forcing RLS is
 *               only safe when the app role has BYPASSRLS; applying it
 *               blindly at boot could lock the app out of its own tables.
 *               Keep that in the manual script only.
 *               section 6 (verification SELECTs) — the boot sync does its own
 *               table-count check via $queryRaw instead.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")
const SOURCE = join(ROOT, "supabase_sync.sql")
const TARGET = join(ROOT, "src/lib/schema-sync-statements.ts")

/** Split SQL into individual statements, respecting '--' comments,
 * '...' strings, and $tag$ dollar-quoted blocks (DO $$ ... $$). */
function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ""
  let inSQuote = false
  let dollarTag: string | null = null
  let i = 0

  const isWhitespace = (c: string) => /\s/.test(c)

  while (i < sql.length) {
    const c = sql[i]
    const prev = i > 0 ? sql[i - 1] : "\n"

    // Line comment: '--' at token start (never inside strings/dollar blocks)
    if (!inSQuote && !dollarTag && c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++
      continue
    }

    if (inSQuote) {
      if (c === "'") {
        if (sql[i + 1] === "'") {
          current += "''"
          i += 2
          continue
        }
        inSQuote = false
      }
      current += c
      i++
      continue
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      current += c
      i++
      continue
    }

    if (c === "'") {
      inSQuote = true
      current += c
      i++
      continue
    }

    // Dollar-quote opener: $tag$ (tag is optional, e.g. $$ ... $$)
    if (c === "$") {
      const m = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))
      if (m) {
        dollarTag = m[0]
        current += dollarTag
        i += dollarTag.length
        continue
      }
    }

    if (c === ";") {
      const stmt = current.trim()
      if (stmt.length > 0) statements.push(stmt)
      current = ""
      i++
      // Whitespace after the separator is skipped by the trim above.
      continue
    }

    // Normalize runs of whitespace inside statements to single spaces so the
    // generated file stays compact (comments were already dropped above).
    if (isWhitespace(c)) {
      if (current.length > 0 && !isWhitespace(current[current.length - 1])) {
        current += " "
      }
      i++
      continue
    }

    current += c
    i++
  }

  const tail = current.trim()
  if (tail.length > 0) statements.push(tail)
  return statements
}

function main() {
  const sql = readFileSync(SOURCE, "utf8")

  if (sql.includes("/*")) {
    throw new Error("supabase_sync.sql now contains block comments — extend the splitter first")
  }

  const all = splitStatements(sql)

  const statements = all.filter((stmt) => {
    const upper = stmt.toUpperCase()
    // Section 6 — verification SELECTs (not executable via $executeRawUnsafe
    // semantics, and not needed: the sync logs a live table count instead).
    if (upper.startsWith("SELECT")) return false
    // Section 5 — RLS enforcement (manual-script-only, see header).
    if (stmt.includes("ROW LEVEL SECURITY")) return false
    return true
  })

  // ---- Sanity checks: the statement list must cover the P2021 incident ----
  const required = [
    'CREATE TABLE IF NOT EXISTS "AnnouncementPoll"',
    'CREATE TABLE IF NOT EXISTS "AnnouncementPollOption"',
    'CREATE TABLE IF NOT EXISTS "AnnouncementPollVote"',
    'CREATE TABLE IF NOT EXISTS "VerificationToken"',
    'CREATE UNIQUE INDEX IF NOT EXISTS "AnnouncementPollVote_optionId_userId_key"',
    "AnnouncementPoll_announcementId_fkey",
    "AnnouncementPollOption_pollId_fkey",
    "AnnouncementPollVote_optionId_fkey",
    "AnnouncementPollVote_userId_fkey",
  ]
  const joined = statements.join("\n")
  for (const needle of required) {
    if (!joined.includes(needle)) {
      throw new Error(`Generated statement list is missing: ${needle}`)
    }
  }
  if (statements.some((s) => s.toUpperCase().startsWith("SELECT"))) {
    throw new Error("SELECT statements must not be embedded")
  }

  const header = `// AUTO-GENERATED by scripts/gen-schema-sync.ts — DO NOT EDIT BY HAND.
//
// Source of truth: supabase_sync.sql (sections 1-4: tables, column healers,
// indexes, guarded foreign keys). Every statement is idempotent and safe to
// run on every server boot against the production Postgres. Regenerate with:
//
//   bun run scripts/gen-schema-sync.ts
//
// Excluded on purpose: the RLS section (unsafe to force blindly at boot) and
// the verification SELECTs (schema-sync.ts logs a live table count instead).

/**
 * Ordered, idempotent DDL statements executed once per server boot by
 * src/lib/schema-sync.ts (called from src/instrumentation.ts).
 */
export const SCHEMA_SYNC_STATEMENTS: readonly string[] = [
`

  const body = statements
    .map((s) => "  " + JSON.stringify(s).replace(/\\u[0-9a-fA-F]{4}/g, (m) => m) + ",")
    .join("\n")

  const file = header + body + "\n]\n"

  writeFileSync(TARGET, file)

  const tableCount = statements.filter((s) => s.startsWith("CREATE TABLE")).length
  const columnCount = statements.filter((s) => s.startsWith('ALTER TABLE')).length
  const indexCount = statements.filter((s) => s.startsWith("CREATE") && s.includes(" INDEX ")).length
  console.log(
    `[gen-schema-sync] wrote ${statements.length} statements to src/lib/schema-sync-statements.ts ` +
      `(${tableCount} CREATE TABLE, ${columnCount} ALTER TABLE, ${indexCount} CREATE INDEX, ` +
      `${statements.length - tableCount - columnCount - indexCount} other)`,
  )
  console.log("[gen-schema-sync] dropped SELECT statements:", all.filter((s) => s.toUpperCase().startsWith("SELECT")).length)
  console.log("[gen-schema-sync] dropped RLS statements:", all.filter((s) => s.includes("ROW LEVEL SECURITY")).length)
}

main()
