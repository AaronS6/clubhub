import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { logActivity } from "@/lib/activity"

// DELETE /api/clubs/[clubId]/chat/conversations/[conversationId]/members/[userId]
// Removes a member. Owner, exec, or the user themselves (leave) can call this.
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string; userId: string }> }) {
  const { clubId, conversationId, userId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)

  const myMembership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: c.user.id } },
  })
  if (!myMembership) return error("Not a member of this conversation", 403)

  const isSelf = userId === c.user.id
  const isOwner = myMembership.role === "owner"
  const isExec = c.membership.role === "executive"
  if (!isSelf && !isOwner && !isExec) {
    return error("Only the user themselves, conversation owner, or an executive can remove a member", 403)
  }

  const target = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  if (!target) return json({ ok: true })

  await db.conversationMember.delete({ where: { id: target.id } })

  // If owner left the conversation, promote the longest-tenured remaining
  // member to owner (only for group chats where ownership matters).
  if (target.role === "owner" && conv.type === "group") {
    const remaining = await db.conversationMember.findFirst({
      where: { conversationId },
      orderBy: { joinedAt: "asc" },
    })
    if (remaining) {
      await db.conversationMember.update({
        where: { id: remaining.id },
        data: { role: "owner" },
      })
    }
  }

  // If no members remain, soft-clean the conversation (delete it entirely
  // since nobody can see it anyway). Only for non-club-wide conversations.
  const remainingCount = await db.conversationMember.count({ where: { conversationId } })
  if (remainingCount === 0 && conv.type !== "club_wide") {
    await db.message.deleteMany({ where: { conversationId } })
    await db.conversation.delete({ where: { id: conversationId } })
  }

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "chat_member_removed",
    targetType: "conversation",
    targetId: conversationId,
    description: isSelf
      ? `${c.user.name} left a chat`
      : `${c.user.name} removed a member from "${conv.name}"`,
  })

  await emitClubEvent(clubId, "chat_message", { conversationId })
  return json({ ok: true })
}
