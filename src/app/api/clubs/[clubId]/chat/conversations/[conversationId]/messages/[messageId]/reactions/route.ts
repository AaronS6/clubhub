import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { notify } from "@/lib/activity"

const ALLOWED_EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83C\uDF89", "\uD83D\uDC4F", "\uD83D\uDE02"] // thumbsup, heart, party, clap, laugh

// POST /api/clubs/[clubId]/chat/conversations/[conversationId]/messages/[messageId]/reactions
// Body: { emoji }. Toggle/swap (one reaction per user per message).
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string; messageId: string }> }) {
  const { clubId, conversationId, messageId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  // Parse body up front so we can fan out all independent lookups in one wave.
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const emoji = typeof body.emoji === "string" ? body.emoji : ""
  if (!ALLOWED_EMOJIS.includes(emoji)) return error("Unsupported emoji", 400)

  // conv (existence + club scope), membership (caller auth), message (existence
  // + scope + not-deleted), and the caller's existing reaction row are 4
  // independent lookups — fan them out as a single parallel wave.
  const [conv, membership, message, existing] = await Promise.all([
    db.conversation.findUnique({ where: { id: conversationId } }),
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: c.user.id } },
    }),
    db.message.findUnique({ where: { id: messageId } }),
    db.messageReaction.findUnique({
      where: {
        messageId_userId: { messageId, userId: c.user.id },
      },
    }),
  ])

  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)
  if (!membership) return error("Not a member of this conversation", 403)
  if (!message || message.conversationId !== conversationId) {
    return error("Message not found", 404)
  }
  if (message.deletedAt) return error("Cannot react to a deleted message", 400)

  let myReaction: string | null = null
  const shouldNotifyAuthor = message.authorId !== c.user.id

  if (existing) {
    if (existing.emoji === emoji) {
      // Same emoji → remove
      await db.messageReaction.delete({ where: { id: existing.id } })
      myReaction = null
    } else {
      // Different emoji → swap
      await db.messageReaction.update({
        where: { id: existing.id },
        data: { emoji },
      })
      myReaction = emoji
    }
  } else {
    await db.messageReaction.create({
      data: { messageId, userId: c.user.id, emoji },
    })
    myReaction = emoji
  }

  // notify (if we swapped/added and author isn't us) + emitClubEvent + the
  // recompute-findMany are all independent best-effort side effects. The
  // findMany is the response payload source; notify/emit are fire-and-forget.
  const notifyPromise =
    shouldNotifyAuthor && myReaction !== null
      ? notify({
          userId: message.authorId,
          clubId,
          type: "new_reaction",
          message: `${c.user.name} reacted ${emoji} to your message`,
          linkUrl: "/chat",
        })
      : Promise.resolve()
  const [reactions] = await Promise.all([
    db.messageReaction.findMany({
      where: { messageId },
      select: {
        userId: true,
        emoji: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    notifyPromise,
    emitClubEvent(clubId, "chat_message", { conversationId }),
  ])

  type ReactionUser = { id: string; name: string; avatarUrl: string | null }
  type ReactionGroup = { emoji: string; count: number; users: ReactionUser[] }
  const groups: Record<string, ReactionGroup> = {}
  for (const r of reactions) {
    const g = groups[r.emoji]
    const u: ReactionUser = { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? null }
    if (g) {
      g.count += 1
      g.users.push(u)
    } else {
      groups[r.emoji] = { emoji: r.emoji, count: 1, users: [u] }
    }
  }

  return json({ reactions: Object.values(groups), myReaction })
}
