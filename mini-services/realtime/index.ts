import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from "http"
import { Server } from "socket.io"

// Socket.io server — gateway forwards browser ws connections to this port.
// Path MUST be "/" so Caddy routes it correctly.
const wsServer = createServer()
const io = new Server(wsServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Presence: map socketId -> { userId, clubIds: Set }. We broadcast presence
// deltas to the affected club rooms so clients can show online dots on avatars.
const socketPresence = new Map<string, { userId: string; clubIds: Set<string> }>()

// Typing tracking — we need to know which conversations each socket is
// "typing in" so that on disconnect we can broadcast `chat_typing:stop` for
// the conversations the disconnecting socket was typing in. Without this, a
// user who closes their tab mid-typing would leave a stale "X is typing…"
// indicator on every other client until the per-client TTL sweep clears it
// (3s). The smart-dedup guard below ensures we only broadcast stop when the
// LAST socket for a given (userId, conversationId) goes away — so multi-tab
// users don't cause flicker for others when one tab closes.
//
// socketTyping: socketId -> Set<conversationId>
// conversationTypers: `${userId}::${conversationId}` -> Set<socketId>
const socketTyping = new Map<string, Set<string>>()
const conversationTypers = new Map<string, Set<string>>()

function clearTypingForSocket(socketId: string) {
  const convs = socketTyping.get(socketId)
  if (!convs) return
  const presence = socketPresence.get(socketId)
  const userId = presence?.userId
  for (const conversationId of convs) {
    if (!userId) continue
    const key = `${userId}::${conversationId}`
    const set = conversationTypers.get(key)
    if (set) {
      set.delete(socketId)
      if (set.size === 0) {
        conversationTypers.delete(key)
        // Last socket for this (user, conversation) is gone — broadcast stop
        // to the club room. We don't store the clubId per conversation (a
        // user could be in multiple clubs), so we fan out to all of the
        // user's clubs. Only the club that actually contains the
        // conversation will have listeners that match on `conversationId`.
        for (const clubId of presence!.clubIds) {
          io.to(`club:${clubId}`).emit("realtime:club", {
            type: "chat_typing:stop",
            conversationId,
            userId,
            clubId,
          })
        }
      }
    }
  }
  socketTyping.delete(socketId)
}

function broadcastPresence(clubId: string) {
  const online: string[] = []
  for (const p of socketPresence.values()) {
    if (p.clubIds.has(clubId)) online.push(p.userId)
  }
  io.to(`club:${clubId}`).emit("realtime:club", { type: "presence_update", online, clubId })
}

io.on("connection", (socket) => {
  console.log(`[realtime] socket connected: ${socket.id}`)
  socket.on("auth", (payload: { userId: string; clubIds: string[] }) => {
    if (!payload?.userId) return
    console.log(`[realtime] auth: socket=${socket.id} user=${payload.userId} clubs=${payload.clubIds?.length ?? 0}`)
    const clubSet = new Set(payload.clubIds ?? [])
    socketPresence.set(socket.id, { userId: payload.userId, clubIds: clubSet })
    socket.join(`user:${payload.userId}`)
    for (const clubId of clubSet) {
      socket.join(`club:${clubId}`)
      broadcastPresence(clubId)
    }
  })
  socket.on("join-club", (clubId: string) => {
    if (!clubId) return
    socket.join(`club:${clubId}`)
    const p = socketPresence.get(socket.id)
    if (p) {
      p.clubIds.add(clubId)
      broadcastPresence(clubId)
    }
  })
  socket.on("leave-club", (clubId: string) => {
    if (!clubId) return
    socket.leave(`club:${clubId}`)
    const p = socketPresence.get(socket.id)
    if (p && p.clubIds.delete(clubId)) {
      broadcastPresence(clubId)
    }
  })
  socket.on("viewing", (payload: { clubId: string; view: string }) => {
    // Used by the "X people viewing" indicator (e.g. approvals queue).
    if (!payload?.clubId || !payload.view) return
    io.to(`club:${payload.clubId}`).emit("realtime:viewing", {
      userId: socketPresence.get(socket.id)?.userId,
      view: payload.view,
      clubId: payload.clubId,
    })
  })
  socket.on("stop-viewing", (payload: { clubId: string; view: string }) => {
    if (!payload?.clubId) return
    io.to(`club:${payload.clubId}`).emit("realtime:stop-viewing", {
      userId: socketPresence.get(socket.id)?.userId,
      view: payload.view,
      clubId: payload.clubId,
    })
  })
  // Chat typing indicator — broadcast to the club room with the type tag
  // `chat_typing` so the ChatView can show "X is typing…" without
  // invalidating React-Query caches (typing is ephemeral; refetching the
  // message list on every keystroke would be wasteful and visually janky).
  // We also include the originating userId so recipients can ignore their
  // own typing.
  //
  // We ALSO record the (socketId, conversationId) in two reverse maps
  // (`socketTyping`, `conversationTypers`) so that when this socket
  // disconnects we can broadcast `chat_typing:stop` for the conversation(s)
  // it was typing in — see `clearTypingForSocket` above. This means a user
  // who closes their tab mid-typing has their indicator cleared for others
  // immediately rather than waiting for the per-client TTL sweep (3s).
  socket.on("typing", (payload: { clubId?: string; conversationId?: string; userId?: string }) => {
    if (!payload?.clubId || !payload.conversationId || !payload.userId) return
    // Track typing state for this socket so we can clear it on disconnect.
    let convs = socketTyping.get(socket.id)
    if (!convs) {
      convs = new Set()
      socketTyping.set(socket.id, convs)
    }
    convs.add(payload.conversationId)
    const key = `${payload.userId}::${payload.conversationId}`
    let typers = conversationTypers.get(key)
    if (!typers) {
      typers = new Set()
      conversationTypers.set(key, typers)
    }
    typers.add(socket.id)
    io.to(`club:${payload.clubId}`).emit("realtime:club", {
      type: "chat_typing",
      conversationId: payload.conversationId,
      userId: payload.userId,
      clubId: payload.clubId,
    })
  })
  socket.on("typing:stop", (payload: { clubId?: string; conversationId?: string; userId?: string }) => {
    if (!payload?.clubId || !payload.conversationId || !payload.userId) return
    // Mirror the tracking update so we don't leak memory in the maps.
    const convs = socketTyping.get(socket.id)
    if (convs) {
      convs.delete(payload.conversationId)
      if (convs.size === 0) socketTyping.delete(socket.id)
    }
    const key = `${payload.userId}::${payload.conversationId}`
    const typers = conversationTypers.get(key)
    let stillTyping = false
    if (typers) {
      typers.delete(socket.id)
      if (typers.size === 0) {
        conversationTypers.delete(key)
      } else {
        // Another socket (same user, multi-tab) is still typing — don't
        // broadcast stop or others will see the indicator flicker off and
        // back on within ~2s.
        stillTyping = true
      }
    }
    if (!stillTyping) {
      io.to(`club:${payload.clubId}`).emit("realtime:club", {
        type: "chat_typing:stop",
        conversationId: payload.conversationId,
        userId: payload.userId,
        clubId: payload.clubId,
      })
    }
  })
  socket.on("disconnect", (reason) => {
    console.log(`[realtime] socket disconnected: ${socket.id} reason=${reason}`)
    // Broadcast chat_typing:stop for any conversation this socket was typing
    // in (handles the "closed tab mid-typing" case). The helper fans out to
    // all clubs the user was in.
    clearTypingForSocket(socket.id)
    const p = socketPresence.get(socket.id)
    if (p) {
      for (const clubId of p.clubIds) broadcastPresence(clubId)
      socketPresence.delete(socket.id)
    }
  })
})

// Separate internal HTTP API (port 3004) for the Next.js app to emit events.
// This avoids the socket.io path:"/" handler intercepting plain POSTs.
const INTERNAL_TOKEN = process.env.REALTIME_TOKEN || "dev-realtime-token"
const emitServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST") {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }))
    return
  }
  const url = new URL(req.url ?? "", "http://localhost")
  if (url.pathname !== "/emit") {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }))
    return
  }
  const auth = req.headers["x-realtime-token"]
  if (auth !== INTERNAL_TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }))
    return
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  let body: any
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "bad json" }))
    return
  }
  const { room, event, data } = body || {}
  if (!room || !event) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "room and event required" }))
    return
  }
  io.to(room).emit(event, data ?? {})
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }))
})

const WS_PORT = 3003
const EMIT_PORT = 3004

wsServer.listen(WS_PORT, () => console.log(`Realtime (socket.io) on port ${WS_PORT}`))
emitServer.listen(EMIT_PORT, () => console.log(`Realtime emit API on port ${EMIT_PORT}`))

const shutdown = (srv: HttpServer, name: string) => srv.close(() => console.log(`${name} closed`))
process.on("SIGTERM", () => { shutdown(wsServer, "ws"); shutdown(emitServer, "emit") })
process.on("SIGINT", () => { shutdown(wsServer, "ws"); shutdown(emitServer, "emit") })
