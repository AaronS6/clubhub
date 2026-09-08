import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { logActivity, notify } from "@/lib/activity"
import { rateLimit } from "@/lib/rate-limit"

const PAGE_SIZE = 50
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000

type ReactionUser = { id: string; name: string; avatarUrl: string | null }
type ReactionGroup = { emoji: string; count: number; users: ReactionUser[] }

interface RawMessage {
  id: string
  body: string
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  pinnedAt: Date | null
  authorId: string
  author: { id: string; name: string; avatarUrl: string | null }
  reactions: {
    emoji: string
    userId: string
    user: { id: string; name: string; avatarUrl: string | null }
  }[]
}

/** Matches `@Name` patterns where Name is one of the active club members' names. */
function parseMentions(text: string, members: { user: { id: string; name: string } }[]): string[] {
  const seen = new Set<string>()
  const lowerByName = new Map<string, string>()
  for (const m of members) {
    lowerByName.set(m.user.name.toLowerCase(), m.user.id)
  }
  // @Name terminated by whitespace, end of string, or punctuation (other than
  // . _ - which can appear inside an identifier). Names with spaces aren't
  // supported in v1 — the picker inserts `@FirstName LastName ` but the parse
  // only matches the first token, which is fine for notifications.
  const re = /(?:^|\s)@([A-Za-z0-9._-]+[A-Za-z0-9])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const id = lowerByName.get(m[1].toLowerCase())
    if (id) seen.add(id)
  }
  return Array.from(seen)
}

function serialize(m: RawMessage, myUserId: string) {
  const groups: Record<string, ReactionGroup> = {}
  let myReaction: string | null = null
  for (const r of m.reactions) {
    const g = groups[r.emoji]
    const u: ReactionUser = { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? null }
    if (g) {
      g.count += 1
      g.users.push(u)
    } else {
      groups[r.emoji] = { emoji: r.emoji, count: 1, users: [u] }
    }
    if (r.userId === myUserId) myReaction = r.emoji
  }
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    pinnedAt: m.pinnedAt,
    authorId: m.authorId,
    author: {
      id: m.author.id,
      name: m.author.name,
      avatarUrl: m.author.avatarUrl ?? null,
    },
    reactions: Object.values(groups),
    myReaction,
    isMine: m.authorId === myUserId,
  }
}

// GET /api/clubs/[clubId]/chat/conversations/[conversationId]/messages
//   ?before=<messageId>  → older messages (for scroll-up pagination)
//   ?after=<messageId>   → newer messages (for polling/updates)
//   no params             → latest PAGE_SIZE messages
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string }> }) {
  const { clubId, conversationId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)

  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: c.user.id } },
  })
  if (!membership) return error("Not a member of this conversation", 403)

  const url = new URL(req.url)
  const before = url.searchParams.get("before")
  const after = url.searchParams.get("after")

  const messageIncludes = {
    author: { select: { id: true, name: true, avatarUrl: true } },
    reactions: {
      select: {
        emoji: true,
        userId: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    },
  } as const

  let messages: RawMessage[] = []

  if (before) {
    // Cursor: createdAt of the message with id=before. Fetch messages older than that.
    const cursor = await db.message.findUnique({ where: { id: before }, select: { createdAt: true } })
    if (!cursor) return json({ messages: [], hasMore: false })
    messages = await db.message.findMany({
      where: { conversationId, createdAt: { lt: cursor.createdAt } },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: messageIncludes,
    })
    // Reverse so oldest-first for display.
    messages.reverse()
    // Check if there are older messages still.
    const hasMore = messages.length > 0
      ? (await db.message.count({
          where: { conversationId, createdAt: { lt: messages[0].createdAt } },
        })) > 0
      : false
    return json({ messages: messages.map((m) => serialize(m, c.user.id)), hasMore })
  }

  if (after) {
    const cursor = await db.message.findUnique({ where: { id: after }, select: { createdAt: true } })
    if (!cursor) return json({ messages: [], hasMore: false })
    messages = await db.message.findMany({
      where: { conversationId, createdAt: { gt: cursor.createdAt } },
      orderBy: { createdAt: "asc" },
      take: PAGE_SIZE * 2,
      include: messageIncludes,
    })
    // Mark as read since the user is presumably at the bottom fetching updates.
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: c.user.id } },
      data: { lastReadAt: new Date() },
    })
    return json({ messages: messages.map((m) => serialize(m, c.user.id)), hasMore: false })
  }

  // No cursor — latest PAGE_SIZE messages.
  messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: messageIncludes,
  })
  messages.reverse()

  // Mark as read (only when fetching latest, not when paginating older).
  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: c.user.id } },
    data: { lastReadAt: new Date() },
  })

  const hasMore = messages.length > 0
    ? (await db.message.count({
        where: { conversationId, createdAt: { lt: messages[0].createdAt } },
      })) > 0
    : false

  return json({ messages: messages.map((m) => serialize(m, c.user.id)), hasMore })
}

// POST /api/clubs/[clubId]/chat/conversations/[conversationId]/messages
// Body: { body }
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string }> }) {
  const { clubId, conversationId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)

  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: c.user.id } },
  })
  if (!membership) return error("Not a member of this conversation", 403)

  // Rate limit: 30 messages per user per minute per conversation.
  const rlKey = `${c.user.id}:${conversationId}`
  const rl = rateLimit(rlKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
    return Response.json(
      { error: "You're sending messages too fast. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const text = typeof body.body === "string" ? body.body : ""
  const trimmed = text.trim()
  if (!trimmed) return error("Message body cannot be empty", 400)
  if (trimmed.length > 8000) return error("Message must be 8000 characters or fewer", 400)

  const created = await db.message.create({
    data: { conversationId, authorId: c.user.id, body: trimmed },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      reactions: {
        select: {
          emoji: true,
          userId: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  })

  // Bump conversation.updatedAt so it sorts first in the list.
  await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })

  // Fan out a notification to the OTHER members of THIS conversation. Rules:
  // - Direct/group: notify all members except the author.
  // - Club-wide: only notify members who have NEVER opened the conversation
  //   (i.e. lastReadAt === joinedAt, meaning they never fetched messages).
  //
  // IMPORTANT: the `where` MUST scope by `conversationId`. An earlier version
  // omitted it (only filtered `userId != author`), which would notify every
  // ConversationMember row in the database — leaking the conversation's name
  // and preview to users who aren't even in it. Scoping by `conversationId`
  // ensures only actual members of THIS conversation are notified.
  const otherMembers = await db.conversationMember.findMany({
    where: { conversationId, userId: { not: c.user.id } },
    select: { userId: true, lastReadAt: true, joinedAt: true },
  })

  // Parse @mentions and notify each mentioned user (excluding the author).
  // Uses the type `new_comment` per the spec (keeps the notify pipeline
  // simple — the frontend already knows how to render this type).
  const clubMembers = await db.clubMember.findMany({
    where: { clubId, status: "active" },
    select: { user: { select: { id: true, name: true } } },
  })
  const mentionedUserIds = parseMentions(trimmed, clubMembers)

  const preview = trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed
  const notifyPayload = (recipientId: string) => ({
    userId: recipientId,
    clubId,
    type: "chat_message",
    message:
      conv.type === "direct"
        ? `${c.user.name}: ${preview}`
        : conv.type === "group"
          ? `${c.user.name} in ${conv.name}: ${preview}`
          : `${c.user.name} in ${conv.name ?? "club chat"}: ${preview}`,
    linkUrl: "/chat",
  })

  if (conv.type === "club_wide") {
    // Only notify members who have never opened the conversation. We detect
    // "never opened" by comparing lastReadAt to joinedAt — both default to
    // now() at creation time, so an exact equality means no GET has updated
    // lastReadAt since the row was created.
    for (const m of otherMembers) {
      if (m.lastReadAt.getTime() === m.joinedAt.getTime()) {
        await notify(notifyPayload(m.userId))
      }
    }
  } else {
    for (const m of otherMembers) {
      await notify(notifyPayload(m.userId))
    }
  }

  // Mention notifications: a separate, distinct message so the recipient
  // sees they were @-mentioned (not just that a new message arrived).
  for (const mentionedId of mentionedUserIds) {
    if (mentionedId === c.user.id) continue // never self-notify
    await notify({
      userId: mentionedId,
      clubId,
      type: "new_comment",
      message: `${c.user.name} mentioned you in chat`,
      linkUrl: "/chat",
    })
  }

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "chat_message_sent",
    targetType: "message",
    targetId: created.id,
    description:
      conv.type === "direct"
        ? `${c.user.name} sent a direct message`
        : `${c.user.name} sent a message in ${conv.name ?? "club chat"}`,
  })

  await emitClubEvent(clubId, "chat_message", { conversationId })

  return json({ message: serialize(created, c.user.id) }, 201)
}
