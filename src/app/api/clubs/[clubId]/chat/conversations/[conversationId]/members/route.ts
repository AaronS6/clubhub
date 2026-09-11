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

  // Parse body early so we can fan out all the independent lookups in one wave.
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const userId = typeof body.userId === "string" ? body.userId : ""
  if (!userId) return error("userId required", 400)

  // conv (existence + club scope + type), myMembership (caller auth),
  // clubMembership (target must be active club member), and the existing
  // ConversationMember row (idempotency check) are 4 independent lookups.
  const [conv, myMembership, clubMembership, existing] = await Promise.all([
    db.conversation.findUnique({ where: { id: conversationId } }),
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: c.user.id } },
    }),
    db.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
    }),
    db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    }),
  ])

  if (!conv || conv.clubId !== clubId) return error("Conversation not found", 404)
  if (conv.type !== "group") return error("Only group chats can have members added", 400)
  if (!myMembership) return error("Not a member of this conversation", 403)
  const isOwner = myMembership.role === "owner"
  const isExec = c.membership.role === "executive"
  if (!isOwner && !isExec) {
    return error("Only the owner or an executive can add members", 403)
  }
  if (!clubMembership || clubMembership.status !== "active") {
    return error("User is not an active member of this club", 400)
  }
  // Already a member? Idempotent return.
  if (existing) return json({ ok: true, alreadyMember: true })

  await db.conversationMember.create({
    data: { conversationId, userId, role: "member" },
  })

  // logActivity + notify + emitClubEvent are independent best-effort side effects — fan them out in parallel.
  await Promise.all([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "chat_member_added",
      targetType: "conversation",
      targetId: conversationId,
      description: `${c.user.name} added a member to "${conv.name}"`,
    }),
    notify({
      userId,
      clubId,
      type: "chat_message",
      message: `${c.user.name} added you to "${conv.name}"`,
      linkUrl: "/chat",
    }),
    emitClubEvent(clubId, "chat_message", { conversationId }),
  ])
  return json({ ok: true }, 201)
}
