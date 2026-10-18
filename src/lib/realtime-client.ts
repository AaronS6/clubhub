import { io, Socket } from "socket.io-client"

let socket: Socket | null = null

/**
 * Returns a singleton socket.io connection.
 *
 * URL resolution:
 * - In the sandbox preview, the Caddy gateway forwards browser ws connections
 *   via the `XTransformPort` query param. We use a relative path "/" with
 *   `?XTransformPort=3003` so the gateway routes to the realtime mini-service.
 * - In production (Render/Vercel/etc.), set `NEXT_PUBLIC_REALTIME_URL` to the
 *   realtime service's public WebSocket URL (e.g. wss://clubhub-realtime.onrender.com).
 *   If set, we connect to that directly.
 *
 * Connect is lazy.
 */
function resolveRealtimeUrl(): string {
  // Production: explicit public URL for the realtime service.
  const publicUrl = process.env.NEXT_PUBLIC_REALTIME_URL
  if (publicUrl) return publicUrl
  // Sandbox: relative path through the Caddy gateway.
  return "/?XTransformPort=3003"
}

export function getRealtimeSocket(): Socket {
  if (socket) return socket
  const url = resolveRealtimeUrl()
  // If no explicit realtime URL is configured, try to connect once, then
  // give up quickly (3 attempts, 5s apart). The polling fallback handles
  // all data refresh. This avoids the performance drain of infinite
  // reconnection attempts to a non-existent server.
  const hasExplicitUrl = !!process.env.NEXT_PUBLIC_REALTIME_URL
  socket = io(url, {
    transports: ["websocket"],
    reconnection: hasExplicitUrl, // only auto-reconnect if a service is configured
    reconnectionDelay: 5000,     // 5s between retries (was 1s)
    reconnectionAttempts: 3,      // give up after 3 tries (was Infinity)
    timeout: 3000,               // fail fast on first connect (was default 20s)
  })
  return socket
}

/**
 * Authenticates the realtime socket.
 *
 * SECURITY: the server no longer trusts the client-supplied userId/clubIds —
 * we first fetch a short-lived HMAC ticket from /api/realtime/ticket (which
 * derives the user + their ACTIVE clubs from the session, server-side) and
 * emit THAT payload on the "auth" event. The mini-service verifies the ticket
 * before joining any rooms, so a hostile client can't claim another user's
 * identity or eavesdrop on clubs it isn't in. If the ticket fetch fails we
 * simply don't authenticate (fail closed) — the polling fallback still
 * refreshes all data.
 *
 * Call this on the client once we know the user + clubs (the ids passed in
 * are only used as a fallback shape, never trusted by the server).
 */
export function authenticateSocket(userId: string, clubIds: string[]) {
  const s = getRealtimeSocket()
  void fetch("/api/realtime/ticket", { credentials: "same-origin" })
    .then(async (res) => (res.ok ? res.json() : null))
    .then((payload: { ticket?: string; userId?: string; clubIds?: string[]; exp?: number } | null) => {
      if (!payload?.ticket || !payload.userId || !Array.isArray(payload.clubIds)) return
      if (!s.connected) {
        s.connect()
        s.on("connect", () => s.emit("auth", payload))
      } else {
        s.emit("auth", payload)
      }
    })
    .catch(() => {
      /* fail closed — no rooms joined; polling keeps data fresh */
    })
}

/** Subscribe to a realtime event. Returns an unsubscribe fn. */
export function onRealtimeEvent(event: string, cb: (data: any) => void): () => void {
  const s = getRealtimeSocket()
  s.on(event, cb)
  return () => {
    s.off(event, cb)
  }
}
