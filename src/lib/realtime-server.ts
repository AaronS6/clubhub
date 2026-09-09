/**
 * Server-side helper to push a realtime event to the socket.io mini-service.
 * The mini-service fans out to the relevant room (e.g. `user:<id>` or `club:<id>`).
 * This is best-effort: if the realtime service is down we just skip (the app
 * still works via polling). Called from API routes after a DB mutation.
 */
// In production, the realtime mini-service runs as a separate Render background
// worker. The Next.js app reaches its emit API via an internal URL
// (REALTIME_EMIT_URL env var). Locally it's http://localhost:3004/emit.
const REALTIME_URL = process.env.REALTIME_EMIT_URL || "http://localhost:3004/emit"
const INTERNAL_TOKEN = process.env.REALTIME_TOKEN || "dev-realtime-token"

type EmitInput =
  | { kind: "user"; userId: string; event: string; data?: any }
  | { kind: "club"; clubId: string; event: string; data?: any }

/**
 * Tiny in-process dedupe cache for CLUB events. Several mutation routes call
 * BOTH `notifyClub({ type })` (which internally emits a `realtime:club` event
 * to the club room) AND `emitClubEvent(clubId, type, { entityId })` (for the
 * richer payload with the entity id used by the remote-change flash). Both
 * emits carry the same `type`, so the second is redundant for cache
 * invalidation purposes — TanStack Query dedupes the invalidation, but we'd
 * still make 2 HTTP calls to the emit API and broadcast twice on the socket.
 *
 * To avoid that waste we drop a club-room emit whose `(clubId, type, entityId)`
 * signature was already sent in the last DEDUPE_MS milliseconds. The window is
 * short enough that genuinely distinct events (e.g. two different tasks
 * created seconds apart) still pass through — they have different entityIds.
 */
const DEDUPE_MS = 1200
const dedupeCache = new Map<string, number>()

function shouldDedupe(clubId: string, type: string | undefined, entityId: string | undefined): boolean {
  if (!type) return false
  const key = `${clubId}:${type}:${entityId ?? ""}`
  const now = Date.now()
  const last = dedupeCache.get(key)
  if (last && now - last < DEDUPE_MS) {
    return true // duplicate within window — drop
  }
  dedupeCache.set(key, now)
  // Prune old entries occasionally to avoid unbounded growth.
  if (dedupeCache.size > 500) {
    for (const [k, t] of dedupeCache) {
      if (now - t > DEDUPE_MS * 2) dedupeCache.delete(k)
    }
  }
  return false
}

export async function emitRealtime(input: EmitInput): Promise<void> {
  try {
    // Dedupe redundant club-room emits (see comment above).
    if (input.kind === "club" && input.event === "realtime:club") {
      const type = input.data?.type
      const entityId =
        input.data?.taskId ?? input.data?.meetingId ?? input.data?.teamId ??
        input.data?.userId ?? input.data?.announcementId ?? input.data?.hourId
      if (shouldDedupe(input.clubId, type, entityId)) return
    }
    const room = input.kind === "user" ? `user:${input.userId}` : `club:${input.clubId}`
    await fetch(REALTIME_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-realtime-token": INTERNAL_TOKEN },
      body: JSON.stringify({ room, event: input.event, data: input.data ?? {} }),
      // don't block long if the service is unreachable
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // swallow — realtime is a progressive enhancement
  }
}

/**
 * Convenience wrapper: emit a club-scoped event that triggers React-Query
 * invalidations on every connected client viewing that club.
 * `type` is one of the cases in use-realtime-sync.ts (e.g. "task_created").
 */
export async function emitClubEvent(clubId: string, type: string, data?: any): Promise<void> {
  await emitRealtime({ kind: "club", clubId, event: "realtime:club", data: { type, ...data } })
}
