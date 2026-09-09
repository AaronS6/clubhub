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
  socket = io(resolveRealtimeUrl(), {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
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
