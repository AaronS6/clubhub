import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { logActivity } from "@/lib/activity"

// PATCH /api/clubs/[clubId]/chat/conversations/[conversationId]
// Body: { name? } — rename a group conversation. Owner or executive only.
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string }> }) {
  try {
    const { clubId, conversationId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const conv = await db.conversation.findUnique({ where: { id: conversationId } })
    if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)
    if (conv.type !== "group") return error("Only group chats can be renamed", 400)

    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: c.user.id } },
    })
    if (!membership) return error("Not a member of this conversation", 403)

    const isOwner = membership.role === "owner"
    const isExec = c.membership.role === "executive"
    if (!isOwner && !isExec) return error("Only the owner or an executive can rename", 403)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return error("Name cannot be empty", 400)
    if (name.length > 100) return error("Name must be 100 characters or fewer", 400)

    const updated = await db.conversation.update({
      where: { id: conversationId },
      data: { name },
    })
    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "chat_conversation_renamed",
      targetType: "conversation",
      targetId: conversationId,
      description: `${c.user.name} renamed a group chat to "${name}"`,
    })
    await emitClubEvent(clubId, "chat_message", { conversationId })
    return json({ conversation: { id: updated.id, name: updated.name } })

  } catch (err: any) {
    console.error("[clubs/chat/conversations PATCH] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to update conversation: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
