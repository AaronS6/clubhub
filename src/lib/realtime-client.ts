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
 * Emit auth info so the server can place this socket into user + club rooms.
 * Call this on the client once we know the userId + clubs.
 */
export function authenticateSocket(userId: string, clubIds: string[]) {
  const s = getRealtimeSocket()
  if (!s.connected) {
    s.connect()
    s.on("connect", () => s.emit("auth", { userId, clubIds }))
  } else {
    s.emit("auth", { userId, clubIds })
  }
}

/** Subscribe to a realtime event. Returns an unsubscribe fn. */
export function onRealtimeEvent(event: string, cb: (data: any) => void): () => void {
  const s = getRealtimeSocket()
  s.on(event, cb)
  return () => {
    s.off(event, cb)
  }
}
