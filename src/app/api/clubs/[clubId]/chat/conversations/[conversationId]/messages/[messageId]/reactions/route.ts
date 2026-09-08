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

  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)

  const membership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: c.user.id } },
  })
  if (!membership) return error("Not a member of this conversation", 403)

  const message = await db.message.findUnique({ where: { id: messageId } })
  if (!message || message.conversationId !== conversationId) {
    return error("Message not found", 404)
  }
  if (message.deletedAt) return error("Cannot react to a deleted message", 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const emoji = typeof body.emoji === "string" ? body.emoji : ""
  if (!ALLOWED_EMOJIS.includes(emoji)) return error("Unsupported emoji", 400)

  const existing = await db.messageReaction.findUnique({
    where: {
      messageId_userId: { messageId, userId: c.user.id },
    },
  })

  let myReaction: string | null = null

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
      if (message.authorId !== c.user.id) {
        await notify({
          userId: message.authorId,
          clubId,
          type: "new_reaction",
          message: `${c.user.name} reacted ${emoji} to your message`,
          linkUrl: "/chat",
        })
      }
    }
  } else {
    await db.messageReaction.create({
      data: { messageId, userId: c.user.id, emoji },
    })
    myReaction = emoji
    if (message.authorId !== c.user.id) {
      await notify({
        userId: message.authorId,
        clubId,
        type: "new_reaction",
        message: `${c.user.name} reacted ${emoji} to your message`,
        linkUrl: "/chat",
      })
    }
  }

  await emitClubEvent(clubId, "chat_message", { conversationId })

  // Recompute reactions for the response.
  const reactions = await db.messageReaction.findMany({
    where: { messageId },
    select: {
      userId: true,
      emoji: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

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
