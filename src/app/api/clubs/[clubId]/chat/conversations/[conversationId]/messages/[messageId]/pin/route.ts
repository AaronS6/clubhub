import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { logActivity } from "@/lib/activity"

// PATCH /api/clubs/[clubId]/chat/conversations/[conversationId]/messages/[messageId]/pin
// Body: { pinned: boolean }. Exec or conversation owner only.
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string; messageId: string }> }) {
  const { clubId, conversationId, messageId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  // conv + membership + message are 3 independent existence checks — fan them out.
  const [conv, membership, message] = await Promise.all([
    db.conversation.findUnique({ where: { id: conversationId } }),
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: c.user.id } },
    }),
    db.message.findUnique({ where: { id: messageId } }),
  ])
  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)
  if (!membership) return error("Not a member of this conversation", 403)

  const isOwner = membership.role === "owner"
  const isExec = c.membership.role === "executive"
  if (!isOwner && !isExec) {
    return error("Only the conversation owner or an executive can pin messages", 403)
  }

  if (!message || message.conversationId !== conversationId) {
    return error("Message not found", 404)
  }
  if (message.deletedAt) return error("Cannot pin a deleted message", 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const pinned = typeof body.pinned === "boolean" ? body.pinned : null
  if (pinned === null) return error("`pinned` boolean required", 400)

  if (pinned && !message.pinnedAt) {
    await db.message.update({ where: { id: messageId }, data: { pinnedAt: new Date() } })
  } else if (!pinned && message.pinnedAt) {
    await db.message.update({ where: { id: messageId }, data: { pinnedAt: null } })
  }

  // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
  await Promise.all([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: pinned ? "chat_message_pinned" : "chat_message_unpinned",
      targetType: "message",
      targetId: messageId,
      description: `${c.user.name} ${pinned ? "pinned" : "unpinned"} a chat message`,
    }),
    emitClubEvent(clubId, "chat_message", { conversationId }),
  ])
  return json({ ok: true, pinnedAt: pinned ? new Date().toISOString() : null })
}
