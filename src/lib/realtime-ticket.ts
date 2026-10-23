import crypto from "crypto"

/**
 * Realtime socket ticket — proves to the socket.io mini-service that this
 * connection really belongs to `userId` and may join exactly `clubIds` rooms.
 *
 * Previously the ws service TRUSTED the client-supplied
 * `{ userId, clubIds }` on the "auth" event, so any script could connect and
 * eavesdrop on an arbitrary user's / club's realtime stream (presence, typing,
 * change events). Now the Next.js app (which knows the session) hands the
 * browser a short-lived HMAC ticket; the mini-service recomputes the HMAC
 * with the shared REALTIME_TOKEN before joining any room.
 *
 * Format: ticket = HMAC-SHA256(`${userId}|${clubIds.join(",")}|${exp}`, key)
 * (hex). exp = epoch ms, 10-minute lifetime — short on purpose: a leaked
 * ticket is worthless within minutes, and tickets are only ever held in
 * browser memory.
 */

const TICKET_TTL_MS = 10 * 60_000

function signingKey(): string {
  return process.env.REALTIME_TOKEN || "dev-realtime-token"
}

function sign(userId: string, clubIds: string[], exp: number): string {
  const payload = `${userId}|${clubIds.join(",")}|${exp}`
  return crypto.createHmac("sha256", signingKey()).update(payload).digest("hex")
}

/** Issues a fresh ticket for a verified session user + their active clubs. */
export function issueRealtimeTicket(userId: string, clubIds: string[]): {
  ticket: string
  userId: string
  clubIds: string[]
  exp: number
} {
  const exp = Date.now() + TICKET_TTL_MS
  return { ticket: sign(userId, clubIds, exp), userId, clubIds, exp }
}
