import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { logActivity } from "@/lib/activity"

// DELETE /api/clubs/[clubId]/chat/conversations/[conversationId]/members/[userId]
// Removes a member. Owner, exec, or the user themselves (leave) can call this.
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string; userId: string }> }) {
  try {
    const { clubId, conversationId, userId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // conv (existence + club scope), myMembership (caller auth), and target
    // (the row we're about to delete) are 3 independent lookups — fan them out.
    const [conv, myMembership, target] = await Promise.all([
      db.conversation.findUnique({ where: { id: conversationId } }),
      db.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: c.user.id } },
      }),
      db.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      }),
    ])

    if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)
    if (!myMembership) return error("Not a member of this conversation", 403)

    const isSelf = userId === c.user.id
    const isOwner = myMembership.role === "owner"
    const isExec = c.membership.role === "executive"
    if (!isSelf && !isOwner && !isExec) {
      return error("Only the user themselves, conversation owner, or an executive can remove a member", 403)
    }

    if (!target) return json({ ok: true })

    await db.conversationMember.delete({ where: { id: target.id } })

    // After the delete, two independent post-conditions to evaluate in parallel:
    //   (a) If the owner left a group chat, promote the longest-tenured remaining member.
    //   (b) Count remaining members to decide whether to soft-clean the conversation.
    const needsOwnerPromotion = target.role === "owner" && conv.type === "group"
    const [remaining, remainingCount] = await Promise.all([
      needsOwnerPromotion
        ? db.conversationMember.findFirst({
            where: { conversationId },
            orderBy: { joinedAt: "asc" },
          })
        : Promise.resolve(null),
      db.conversationMember.count({ where: { conversationId } }),
    ])

    // Cleanup actions are independent of each other — fan them out.
    const cleanup: Promise<unknown>[] = []
    if (remaining) {
      cleanup.push(
        db.conversationMember.update({
          where: { id: remaining.id },
          data: { role: "owner" },
        }),
      )
    }
    // If no members remain, soft-clean the conversation. The Message → Conversation
    // FK is `onDelete: Cascade`, so deleting the conversation auto-removes its
    // messages (no separate deleteMany needed).
    if (remainingCount === 0 && conv.type !== "club_wide") {
      cleanup.push(db.conversation.delete({ where: { id: conversationId } }))
    }
    if (cleanup.length > 0) await Promise.all(cleanup)

    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "chat_member_removed",
        targetType: "conversation",
        targetId: conversationId,
        description: isSelf
          ? `${c.user.name} left a chat`
          : `${c.user.name} removed a member from "${conv.name}"`,
      }),
      emitClubEvent(clubId, "chat_message", { conversationId }),
    ])
    return json({ ok: true })

  } catch (err: any) {
    console.error("[clubs/chat/conversations/members DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to remove member: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
