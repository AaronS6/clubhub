import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { notify, logActivity } from "@/lib/activity"

// POST /api/clubs/[clubId]/chat/conversations/[conversationId]/members
// Body: { userId }. Owner or executive only. Adds a new member.
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string; conversationId: string }> }) {
  const { clubId, conversationId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const conv = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)
  if (conv.type !== "group") return error("Only group chats can have members added", 400)

  const myMembership = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: c.user.id } },
  })
  if (!myMembership) return error("Not a member of this conversation", 403)
  const isOwner = myMembership.role === "owner"
  const isExec = c.membership.role === "executive"
  if (!isOwner && !isExec) {
    return error("Only the owner or an executive can add members", 403)
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const userId = typeof body.userId === "string" ? body.userId : ""
  if (!userId) return error("userId required", 400)

  // Validate the user is an active club member.
  const clubMembership = await db.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId } },
  })
  if (!clubMembership || clubMembership.status !== "active") {
    return error("User is not an active member of this club", 400)
  }

  // Already a member? Idempotent return.
  const existing = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  if (existing) return json({ ok: true, alreadyMember: true })

  await db.conversationMember.create({
    data: { conversationId, userId, role: "member" },
  })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "chat_member_added",
    targetType: "conversation",
    targetId: conversationId,
    description: `${c.user.name} added a member to "${conv.name}"`,
  })

  await notify({
    userId,
    clubId,
    type: "chat_message",
    message: `${c.user.name} added you to "${conv.name}"`,
    linkUrl: "/chat",
  })

  await emitClubEvent(clubId, "chat_message", { conversationId })
  return json({ ok: true }, 201)
}
