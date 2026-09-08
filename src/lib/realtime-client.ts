import { io, Socket } from "socket.io-client"

let socket: Socket | null = null

/**
 * Returns a singleton socket.io connection. The path is "/" and the gateway
 * forwards to port 3003 via the XTransformPort query param. Connect is lazy.
 */
export function getRealtimeSocket(): Socket {
  if (socket) return socket
  socket = io("/?XTransformPort=3003", {
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
