import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { logActivity } from "@/lib/activity"

// PATCH /api/clubs/[clubId]/chat/conversations/[conversationId]/messages/[messageId]
// Author only. Body: { body }. Sets editedAt=now.
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string; messageId: string }> }) {
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
  if (message.deletedAt) return error("Cannot edit a deleted message", 400)
  if (message.authorId !== c.user.id) return error("Only the author can edit", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const text = typeof body.body === "string" ? body.body.trim() : ""
  if (!text) return error("Message body cannot be empty", 400)
  if (text.length > 8000) return error("Message must be 8000 characters or fewer", 400)

  const updated = await db.message.update({
    where: { id: messageId },
    data: { body: text, editedAt: new Date() },
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

  await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "chat_message_edited",
    targetType: "message",
    targetId: messageId,
    description: `${c.user.name} edited a chat message`,
  })
  await emitClubEvent(clubId, "chat_message", { conversationId })

  return json({
    message: {
      id: updated.id,
      body: updated.body,
      createdAt: updated.createdAt,
      editedAt: updated.editedAt,
      deletedAt: updated.deletedAt,
      pinnedAt: updated.pinnedAt,
      authorId: updated.authorId,
      author: {
        id: updated.author.id,
        name: updated.author.name,
        avatarUrl: updated.author.avatarUrl ?? null,
      },
      reactions: groupReactions(updated.reactions, c.user.id).reactions,
      myReaction: groupReactions(updated.reactions, c.user.id).myReaction,
      isMine: true,
    },
  })
}

function groupReactions(
  reactions: { emoji: string; userId: string; user: { id: string; name: string; avatarUrl: string | null } }[],
  myUserId: string,
) {
  const groups: Record<string, { emoji: string; count: number; users: { id: string; name: string; avatarUrl: string | null }[] }> = {}
  let myReaction: string | null = null
  for (const r of reactions) {
    const g = groups[r.emoji]
    const u = { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? null }
    if (g) {
      g.count += 1
      g.users.push(u)
    } else {
      groups[r.emoji] = { emoji: r.emoji, count: 1, users: [u] }
    }
    if (r.userId === myUserId) myReaction = r.emoji
  }
  return { reactions: Object.values(groups), myReaction }
}

// DELETE /api/clubs/[clubId]/chat/conversations/[conversationId]/messages/[messageId]
// Author OR conversation owner OR executive. Soft-deletes (deletedAt=now).
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string; messageId: string }> }) {
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
  if (message.deletedAt) return json({ ok: true })

  const isAuthor = message.authorId === c.user.id
  const isOwner = membership.role === "owner"
  const isExec = c.membership.role === "executive"
  if (!isAuthor && !isOwner && !isExec) {
    return error("Only the author, conversation owner, or an executive can delete", 403)
  }

  await db.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "chat_message_deleted",
    targetType: "message",
    targetId: messageId,
    description: `${c.user.name} deleted a chat message`,
  })
  await emitClubEvent(clubId, "chat_message", { conversationId })
  return json({ ok: true })
}
