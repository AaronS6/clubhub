import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"
import { logActivity } from "@/lib/activity"

// GET /api/clubs/[clubId]/chat/conversations
// Returns the conversations the current user is a member of in this club.
// Also bootstraps a club-wide conversation (and seeds members) if missing.
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  await ensureClubWideConversation(clubId, c.user.id)

  // Pull every ConversationMember row the current user has in this club.
  const memberships = await db.conversationMember.findMany({
    where: { userId: c.user.id, conversation: { clubId } },
    include: {
      conversation: {
        include: {
          members: {
            select: {
              userId: true,
              lastReadAt: true,
              joinedAt: true,
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            where: { deletedAt: null },
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  })

  // For each membership, compute unread count, member count, and (for DMs) the other user.
  const conversations = await Promise.all(
    memberships.map(async (m) => {
      const conv = m.conversation
      const lastReadAt = m.lastReadAt
      const unreadCount = await db.message.count({
        where: {
          conversationId: conv.id,
          createdAt: { gt: lastReadAt },
          deletedAt: null,
          authorId: { not: c.user.id },
        },
      })
      const memberCount = conv.members.length

      let otherUser: { id: string; name: string; avatarUrl: string | null } | null = null
      if (conv.type === "direct") {
        const other = conv.members.find((mm) => mm.userId !== c.user.id)
        if (other) {
          otherUser = {
            id: other.user.id,
            name: other.user.name,
            avatarUrl: other.user.avatarUrl ?? null,
          }
        }
      }

      const lastMessage = conv.messages[0]
        ? {
            id: conv.messages[0].id,
            body: conv.messages[0].body,
            createdAt: conv.messages[0].createdAt,
            authorId: conv.messages[0].author.id,
            authorName: conv.messages[0].author.name,
          }
        : null

      return {
        id: conv.id,
        type: conv.type as "club_wide" | "group" | "direct",
        name: conv.name,
        lastMessage,
        unreadCount,
        memberCount,
        myRole: m.role as "owner" | "member",
        otherUser,
        updatedAt: conv.updatedAt,
      }
    }),
  )

  return json({ conversations, myUserId: c.user.id })
}

/**
 * Creates a club-wide conversation for this club if none exists yet.
 * Adds ALL active club members as conversation members (role=member).
 * Idempotent — safe to call every GET.
 */
async function ensureClubWideConversation(clubId: string, currentUserId: string) {
  const existing = await db.conversation.findFirst({
    where: { clubId, type: "club_wide" },
    include: { members: { select: { userId: true } } },
  })

  if (!existing) {
    // First executive becomes the "creator" of the club-wide conversation.
    // firstExec + club.findUnique are independent lookups — fan them out in parallel.
    const [firstExec, club] = await Promise.all([
      db.clubMember.findFirst({
        where: { clubId, status: "active", role: "executive" },
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
      }),
      db.club.findUnique({ where: { id: clubId }, select: { name: true } }),
    ])
    const createdBy = firstExec?.userId ?? currentUserId
    const name = club?.name ?? "Club chat"
    await db.conversation.create({
      data: {
        clubId,
        type: "club_wide",
        name,
        createdBy,
        members: { create: { userId: currentUserId, role: "member" } },
      },
    })
  }

  // Ensure ALL active club members are in the club-wide conversation. This
  // handles members who joined the club after the conversation was created.
  // The conv re-fetch + active-members lookup are independent — fan them out.
  const [conv, activeMembers] = await Promise.all([
    db.conversation.findFirst({
      where: { clubId, type: "club_wide" },
      include: { members: { select: { userId: true } } },
    }),
    db.clubMember.findMany({
      where: { clubId, status: "active" },
      select: { userId: true },
    }),
  ])
  if (!conv) return
  const existingUserIds = new Set(conv.members.map((mm) => mm.userId))
  const missing = activeMembers.filter((m) => !existingUserIds.has(m.userId))
  // Fan out the per-missing-member creates in parallel. Each is independent;
  // failures (already-exists race) are swallowed.
  await Promise.all(
    missing.map((m) =>
      db.conversationMember
        .create({ data: { conversationId: conv.id, userId: m.userId, role: "member" } })
        .catch(() => {
          // Already exists — skip silently.
        }),
    ),
  )
}

// POST /api/clubs/[clubId]/chat/conversations
// Body: { type: "group"|"direct", name?, memberUserIds: string[] }
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const type = typeof body.type === "string" ? body.type : ""
  if (type !== "group" && type !== "direct") {
    return error("type must be 'group' or 'direct'", 400)
  }

  const memberUserIds: string[] = Array.isArray(body.memberUserIds)
    ? body.memberUserIds.filter((x: unknown) => typeof x === "string" && x.length > 0)
    : []
  // Validate the members are active members of the club.
  const validMembers = await db.clubMember.findMany({
    where: { clubId, status: "active", userId: { in: memberUserIds } },
    select: { userId: true },
  })
  const validSet = new Set(validMembers.map((m) => m.userId))
  const invalid = memberUserIds.filter((id) => !validSet.has(id))
  if (invalid.length > 0) {
    return error(`Not all selected users are active members of this club`, 400)
  }

  if (type === "direct") {
    // memberUserIds should be exactly the OTHER user (creator is added implicitly).
    if (memberUserIds.length !== 1) {
      return error("Direct chats must include exactly one other user", 400)
    }
    const otherUserId = memberUserIds[0]
    if (otherUserId === c.user.id) {
      return error("Cannot create a direct chat with yourself", 400)
    }

    // Look for an existing direct conversation between these two users in this club.
    // The two ConversationMember lookups (mine + theirs) are independent — fan them out.
    const [mine, theirIds] = await Promise.all([
      db.conversationMember.findMany({
        where: { userId: c.user.id, conversation: { clubId, type: "direct" } },
        select: { conversationId: true },
      }),
      db.conversationMember.findMany({
        where: { userId: otherUserId, conversation: { clubId, type: "direct" } },
        select: { conversationId: true },
      }),
    ])
    const mineSet = new Set(mine.map((m) => m.conversationId))
    const existingId = theirIds.find((t) => mineSet.has(t.conversationId))?.conversationId
    if (existingId) {
      const existing = await db.conversation.findUnique({
        where: { id: existingId },
        include: {
          members: {
            select: { userId: true, role: true, user: { select: { id: true, name: true, avatarUrl: true } } },
          },
        },
      })
      if (!existing) return error("Conversation not found", 404)
      const mine = existing.members.find((mm) => mm.userId === c.user.id)
      const other = existing.members.find((mm) => mm.userId !== c.user.id)
      return json({
        conversation: {
          id: existing.id,
          type: "direct",
          name: existing.name,
          myRole: (mine?.role ?? "member") as "owner" | "member",
          memberCount: existing.members.length,
          otherUser: other
            ? { id: other.user.id, name: other.user.name, avatarUrl: other.user.avatarUrl ?? null }
            : null,
          createdAt: existing.createdAt,
        },
      })
    }

    const created = await db.conversation.create({
      data: {
        clubId,
        type: "direct",
        createdBy: c.user.id,
        members: {
          create: [
            { userId: c.user.id, role: "member" },
            { userId: otherUserId, role: "member" },
          ],
        },
      },
      include: {
        members: { select: { userId: true, user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    })
    const other = created.members.find((mm) => mm.userId !== c.user.id)
    // logActivity + notification.create + emitClubEvent are independent side effects — fan them out.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "chat_conversation_created",
        targetType: "conversation",
        targetId: created.id,
        description: `${c.user.name} started a direct chat`,
      }),
      // Notify the other participant so the conversation appears in their list.
      db.notification.create({
        data: {
          userId: otherUserId,
          clubId,
          type: "chat_message",
          message: `${c.user.name} started a chat with you`,
          linkUrl: "/chat",
        },
      }),
      emitClubEvent(clubId, "chat_message", { conversationId: created.id }),
    ])
    return json(
      {
        conversation: {
          id: created.id,
          type: "direct",
          name: created.name,
          myRole: "member",
          memberCount: created.members.length,
          otherUser: other
            ? { id: other.user.id, name: other.user.name, avatarUrl: other.user.avatarUrl ?? null }
            : null,
          createdAt: created.createdAt,
        },
      },
      201,
    )
  }

  // group
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) return error("Group chats require a name", 400)
  if (name.length > 100) return error("Name must be 100 characters or fewer", 400)
  if (memberUserIds.length === 0) return error("Add at least one other member", 400)

  const created = await db.conversation.create({
    data: {
      clubId,
      type: "group",
      name,
      createdBy: c.user.id,
      members: {
        create: [
          { userId: c.user.id, role: "owner" },
          ...memberUserIds
            .filter((id) => id !== c.user.id)
            .map((id) => ({ userId: id, role: "member" as const })),
        ],
      },
    },
    include: {
      members: {
        select: { userId: true, role: true, user: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  })
  // logActivity + emitClubEvent are independent side effects — fan them out in parallel.
  await Promise.all([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "chat_conversation_created",
      targetType: "conversation",
      targetId: created.id,
      description: `${c.user.name} created group chat "${name}"`,
    }),
    emitClubEvent(clubId, "chat_message", { conversationId: created.id }),
  ])
  return json(
    {
      conversation: {
        id: created.id,
        type: "group",
        name: created.name,
        myRole: "owner",
        memberCount: created.members.length,
        otherUser: null,
        members: created.members.map((m) => ({
          userId: m.userId,
          role: m.role,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl ?? null,
        })),
        createdAt: created.createdAt,
      },
    },
    201,
  )
}
