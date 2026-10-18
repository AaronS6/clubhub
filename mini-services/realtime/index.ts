import { createServer, Server as HttpServer, IncomingMessage, ServerResponse } from "http"
import { Server } from "socket.io"
import crypto from "crypto"

// Socket.io server — gateway forwards browser ws connections to this port.
// Path MUST be "/" so Caddy routes it correctly.
const wsServer = createServer()
const io = new Server(wsServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ── Ticket verification ────────────────────────────────────────────────────
// The Next.js app issues short-lived HMAC tickets via /api/realtime/ticket:
//   ticket = HMAC-SHA256(`${userId}|${clubIds.join(",")}|${exp}`, REALTIME_TOKEN)
// The browser sends that payload on the "auth" event; we verify the HMAC +
// expiry and join rooms using the VERIFIED values only. This closes the old
// hole where any client could claim any userId / clubIds and eavesdrop on
// other clubs' realtime streams (presence, typing, change events).
const TICKET_TTL_SKEW_MS = 5 * 60_000 // tolerate modest clock drift app<->service
const INTERNAL_TOKEN = process.env.REALTIME_TOKEN || "dev-realtime-token"

function verifyTicket(payload: any): { userId: string; clubIds: string[] } | null {
  if (!payload || typeof payload !== "object") return null
  const { ticket, userId, clubIds, exp } = payload
  if (typeof ticket !== "string" || typeof userId !== "string") return null
  if (!Array.isArray(clubIds) || !clubIds.every((c: unknown) => typeof c === "string")) return null
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null
  if (exp + TICKET_TTL_SKEW_MS < Date.now()) return null // expired

  const expected = crypto
    .createHmac("sha256", INTERNAL_TOKEN)
    .update(`${userId}|${clubIds.join(",")}|${exp}`)
    .digest("hex")
  // Constant-time compare over equal-length hex digests.
  const a = Buffer.from(expected, "hex")
  const b = Buffer.from(ticket, "hex")
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  // Sanitize ids (defensive — the ticket was signed by our own app, but this
  // also keeps room names clean).
  const id = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "")
  return { userId: id(userId), clubIds: clubIds.map((c: string) => id(c)).filter(Boolean) }
}

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
  socket.on("auth", (payload: any) => {
    // SECURITY: verify the HMAC ticket issued by the Next.js app before
    // joining ANY room. The verified payload is authoritative — the
    // client's self-reported ids are never trusted.
    const verified = verifyTicket(payload)
    if (!verified) {
      console.warn(`[realtime] auth REJECTED (bad/expired ticket): socket=${socket.id}`)
      socket.emit("realtime:auth-error", { error: "invalid ticket" })
      return
    }
    console.log(`[realtime] auth: socket=${socket.id} user=${verified.userId} clubs=${verified.clubIds.length}`)
    const clubSet = new Set(verified.clubIds)
    socketPresence.set(socket.id, { userId: verified.userId, clubIds: clubSet })
    socket.join(`user:${verified.userId}`)
    for (const clubId of clubSet) {
      socket.join(`club:${clubId}`)
      broadcastPresence(clubId)
    }
  })
  socket.on("join-club", (clubId: string) => {
    if (!clubId || typeof clubId !== "string") return
    // Only clubs the VERIFIED ticket already covers may be joined. A client
    // joining a new club gets a fresh ticket (app-shell re-runs
    // authenticateSocket when its club list changes).
    const p = socketPresence.get(socket.id)
    if (!p || !p.clubIds.has(clubId)) return
    socket.join(`club:${clubId}`)
    broadcastPresence(clubId)
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
    // Only VERIFIED sockets broadcast, and always under their verified id.
    const p = socketPresence.get(socket.id)
    if (!p || !payload?.clubId || !payload.view || !p.clubIds.has(payload.clubId)) return
    io.to(`club:${payload.clubId}`).emit("realtime:viewing", {
      userId: p.userId,
      view: payload.view,
      clubId: payload.clubId,
    })
  })
  socket.on("stop-viewing", (payload: { clubId: string; view: string }) => {
    const p = socketPresence.get(socket.id)
    if (!p || !payload?.clubId || !p.clubIds.has(payload.clubId)) return
    io.to(`club:${payload.clubId}`).emit("realtime:stop-viewing", {
      userId: p.userId,
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
    // Only VERIFIED sockets broadcast typing, always under their VERIFIED id
    // (the client's self-reported userId is ignored).
    const presence = socketPresence.get(socket.id)
    if (!presence?.userId || !payload?.clubId || !payload.conversationId) return
    if (!presence.clubIds.has(payload.clubId)) return
    const userId = presence.userId
    // Track typing state for this socket so we can clear it on disconnect.
    let convs = socketTyping.get(socket.id)
    if (!convs) {
      convs = new Set()
      socketTyping.set(socket.id, convs)
    }
    convs.add(payload.conversationId)
    const key = `${userId}::${payload.conversationId}`
    let typers = conversationTypers.get(key)
    if (!typers) {
      typers = new Set()
      conversationTypers.set(key, typers)
    }
    typers.add(socket.id)
    io.to(`club:${payload.clubId}`).emit("realtime:club", {
      type: "chat_typing",
      conversationId: payload.conversationId,
      userId,
      clubId: payload.clubId,
    })
  })
  socket.on("typing:stop", (payload: { clubId?: string; conversationId?: string; userId?: string }) => {
    const presence = socketPresence.get(socket.id)
    if (!presence?.userId || !payload?.clubId || !payload.conversationId) return
    if (!presence.clubIds.has(payload.clubId)) return
    const userId = presence.userId
    // Mirror the tracking update so we don't leak memory in the maps.
    const convs = socketTyping.get(socket.id)
    if (convs) {
      convs.delete(payload.conversationId)
      if (convs.size === 0) socketTyping.delete(socket.id)
    }
    const key = `${userId}::${payload.conversationId}`
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
        userId,
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

// Ports — read from env so the service works in container environments
// (Render, Fly.io, etc.). Locally defaults to 3003 (ws) + 3004 (emit).
// In production, Render exposes ONE external port (PORT) for the WebSocket
// server so browsers can reach it; the emit API runs on EMIT_PORT internally.
const WS_PORT = parseInt(process.env.PORT || process.env.WS_PORT || "3003", 10)
const EMIT_PORT = parseInt(process.env.EMIT_PORT || "3004", 10)

wsServer.listen(WS_PORT, "0.0.0.0", () => console.log(`Realtime (socket.io) on port ${WS_PORT}`))
emitServer.listen(EMIT_PORT, "0.0.0.0", () => console.log(`Realtime emit API on port ${EMIT_PORT}`))

const shutdown = (srv: HttpServer, name: string) => srv.close(() => console.log(`${name} closed`))
process.on("SIGTERM", () => { shutdown(wsServer, "ws"); shutdown(emitServer, "emit") })
process.on("SIGINT", () => { shutdown(wsServer, "ws"); shutdown(emitServer, "emit") })
