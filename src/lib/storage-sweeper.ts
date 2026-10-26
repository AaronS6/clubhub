import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"

/**
 * Storage sweeper — throttled, fire-and-forget database maintenance.
 *
 * A module-level `lastRun` guard re-arms the sweep at most once per 24h per
 * process (and never in tests). The sweep itself is best-effort: every
 * statement is wrapped in its own try/catch and the whole thing is invoked
 * with `.catch(() => {})` so it can NEVER await-throw into a caller. It is
 * wired into `getSessionUser()` (src/lib/server-auth.ts), which every
 * authenticated API request already passes through — so the sweep piggybacks
 * on regular traffic with zero extra endpoints or cron.
 *
 * What it does:
 *   1. Deletes expired NextAuth sessions (via the Prisma client, so it is
 *      portable across SQLite/Postgres — no datetime('now') SQL).
 *   2. Backfills chat tombstones: messages soft-deleted BEFORE the
 *      body-blanking delete handler existed still carry their text. Blanking
 *      their bodies makes the storage meter's LIVE-CONTENT-ONLY math exact.
 *      Idempotent — rows with an empty body are skipped.
 *   3. Purges reactions of tombstoned messages (the delete handler already
 *      does this for new deletions; this catches anything that slipped
 *      through). Idempotent — the DELETE simply matches nothing next time.
 *   4. § Chat storage diet — chat used to cost far more than the message
 *      itself, so the sweeper claws it back, retroactively:
 *        a) DELETEs every historical `chat_message_sent` ActivityLog row
 *           (each cost ~230 bytes against the club quota and was feed noise;
 *           new sends stopped logging these — this reclaims the backlog).
 *        b) hard-DELETEs tombstoned messages older than 30 days (invisible
 *           on every read path already; must run AFTER reaction purging so
 *           no orphaned MessageReaction rows survive).
 *        c) prunes personal `chat_message` Notification rows older than 30
 *           days (excluded from the club quota but real database bytes —
 *           the conversation keeps the actual content, so the notification
 *           is pure staleness by then).
 *
 * Imports ONLY db/prisma — no server-auth import — so wiring it into
 * server-auth.ts cannot create an import cycle.
 */

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

/** Tombstones younger than this stay (recent deletes stay restorable-ish);
 *  older ones are hard-deleted — they've been invisible for a month. */
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** In-memory throttle stamp (per process). 0 = never run since boot. */
let lastRun = 0

/** Call from any hot read path — cheap (a Date.now() check), never throws,
 *  never blocks: the actual sweep runs detached with its own error swallow. */
export function maybeRunStorageSweeper(): void {
  if (process.env.NODE_ENV === "test") return
  const now = Date.now()
  if (now - lastRun < SWEEP_INTERVAL_MS) return
  lastRun = now
  runStorageSweep().catch(() => {
    // Never propagate — maintenance is best-effort by contract.
  })
}

async function runStorageSweep(): Promise<void> {
  // 1. Expired sessions (portable: Prisma client compares DateTime values,
  //    no dialect-specific SQL clock function needed).
  try {
    await db.session.deleteMany({ where: { expires: { lt: new Date() } } })
  } catch {
    // best-effort
  }

  // 2. Tombstone backfill — blank the bodies of legacy soft-deleted messages
  //    so they stop counting as live content in the storage meter.
  //    Dialect-portable raw SQL (quoted identifiers, COALESCE only).
  try {
    await db.$executeRaw(
      Prisma.sql`UPDATE "Message" SET "body" = '' WHERE "deletedAt" IS NOT NULL AND COALESCE("body",'') <> ''`,
    )
  } catch {
    // best-effort
  }

  // 3. Purge reactions pointing at tombstoned messages (their content is
  //    gone, so emoji reactions on it are dead rows).
  try {
    await db.$executeRaw(
      Prisma.sql`DELETE FROM "MessageReaction" WHERE "messageId" IN (SELECT "id" FROM "Message" WHERE COALESCE("body",'') = '')`,
    )
  } catch {
    // best-effort
  }

  // 4a. Chat storage diet, backlog: every `chat_message_sent` activity row
  //     ever written is reclaimable club-quota bytes (~230 bytes each) and
  //     feed noise. Deleting them drops the storage meter the moment the
  //     report re-runs. Idempotent — matches nothing next sweep.
  try {
    await db.$executeRaw(
      Prisma.sql`DELETE FROM "ActivityLog" WHERE "actionType" = 'chat_message_sent'`,
    )
  } catch {
    // best-effort
  }

  // 4b. Hard-delete tombstoned messages older than the retention window.
  //     MUST run after reaction purging (step 3) — reactions are the only
  //     rows referencing Message, and they're gone by now. Tombstones are
  //     already invisible on every read path, so this is a pure row-count
  //     and byte win with no product change. Uses the Prisma client (not
  //     raw SQL) so the DateTime comparison is dialect-portable.
  try {
    const cutoff = new Date(Date.now() - TOMBSTONE_RETENTION_MS)
    await db.message.deleteMany({
      where: { body: "", createdAt: { lt: cutoff } },
    })
  } catch {
    // best-effort
  }

  // 4c. Prune stale personal chat notifications — the conversation itself
  //     keeps the content; a 30-day-old "new message" notification is pure
  //     dead weight in the database.
  try {
    const cutoff = new Date(Date.now() - TOMBSTONE_RETENTION_MS)
    await db.notification.deleteMany({
      where: { type: "chat_message", createdAt: { lt: cutoff } },
    })
  } catch {
    // best-effort
  }
}
