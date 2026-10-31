import { getClubStorageReport, CLUB_STORAGE_LIMIT_BYTES } from "@/lib/storage-report"

/**
 * Storage guard — the 100% write-pause.
 *
 * When a club's live content reaches its 15 MB quota, every
 * storage-taking WRITE (new messages, posts, notes, tasks, meetings,
 * transactions, uploads…) is paused club-wide — for members AND
 * executives — until an executive clears some room. Deletions and EDITS
 * stay open on purpose: trimming and deleting IS the recovery path.
 *
 * Members are told:   "Current club storage is full. Message executives
 *                      for them to clear."
 * Executives are told how to clear + the capacity-increase email.
 *
 * The full report is ~11 aggregate queries, so results are cached
 * per-club in memory for a short TTL. Worst case the club can overshoot
 * by one TTL window of writes — harmless for a quota this size, and the
 * short TTL means a club unblocks within seconds of an executive
 * clearing content.
 */

/** How long a computed footprint stays trusted (ms). */
const CACHE_TTL_MS = 15_000

/** In-memory cache: clubId → { used, at }. Per process. */
const cache = new Map<string, { used: number; at: number }>()

/** Drop the cached footprint (one club, or everything). Call after a
 *  successful write if you want the next guard check to recompute
 *  immediately — with the TTL this is mostly a nicety. */
export function invalidateClubStorageCache(clubId?: string): void {
  if (clubId) cache.delete(clubId)
  else cache.clear()
}

/** Live used bytes for a club (cached). */
export async function clubStorageUsedBytes(clubId: string): Promise<number> {
  const hit = cache.get(clubId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.used
  const report = await getClubStorageReport(clubId)
  cache.set(clubId, { used: report.usedBytes, at: Date.now() })
  return report.usedBytes
}

/** The 507 body both roles receive — the message is role-appropriate so
 *  existing toast-on-error handling surfaces the right ask verbatim. */
function storageFullMessage(role: "member" | "executive"): string {
  if (role === "executive") {
    return (
      "Club storage is full — new content is paused. Clear some content in " +
      "Storage to resume, or message aaronshansh@gmail.com to increase capacity."
    )
  }
  return "Current club storage is full. Message executives for them to clear."
}

/**
 * Returns a ready-to-return 507 Response when the club is at/over quota,
 * or null when writes may proceed. Usage in a POST handler, right after
 * membership is validated:
 *
 *   const full = await clubStorageFullResponse(clubId, c.membership.role)
 *   if (full) return full
 */
export async function clubStorageFullResponse(
  clubId: string,
  role: "member" | "executive",
): Promise<Response | null> {
  let used: number
  try {
    used = await clubStorageUsedBytes(clubId)
  } catch {
    // The guard must never take a route down — if the math fails (e.g. a
    // missing table on a legacy deployment), allow the write.
    return null
  }
  if (used < CLUB_STORAGE_LIMIT_BYTES) return null
  return Response.json(
    { error: storageFullMessage(role), code: "STORAGE_FULL" },
    { status: 507 },
  )
}
