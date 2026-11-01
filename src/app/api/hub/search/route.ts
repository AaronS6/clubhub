import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * GET /api/hub/search?q=… — cross-club search for My Hub.
 *
 * Searches the student's OWN items across every club they belong to: tasks
 * assigned to them, announcements, upcoming meetings, and chat messages in
 * their conversations. Every hit carries its club identity so results are
 * instantly attributable; selecting a hit deep-links into the item's
 * original club workspace.
 *
 * SECURITY: the club set comes from active memberships (validated on every
 * request). Message search is additionally scoped to conversations the user
 * is a member of — the same two-layer rule as the club search route.
 *
 * Members are NOT searched here: a cross-club people search has no natural
 * destination in My Hub (people live inside a club's directory), so the hub
 * palette omits that section rather than half-working.
 */
const LIMIT = 5

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return error("Not authenticated", 401)

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim()
  if (!q) return json({ tasks: [], announcements: [], meetings: [], messages: [] })

  const memberships = await db.clubMember.findMany({
    where: { userId: user.id, status: "active" },
    select: { club: { select: { id: true, name: true, logoUrl: true, accentColor: true } } },
    orderBy: { joinedAt: "asc" },
  })
  const clubIds = memberships.map((m) => m.club.id)
  if (clubIds.length === 0) {
    return json({ tasks: [], announcements: [], meetings: [], messages: [] })
  }
  const clubById = new Map(memberships.map((m) => [m.club.id, m.club]))
  const clubBadge = (clubId: string) => {
    const c = clubById.get(clubId)!
    return { clubId: c.id, clubName: c.name, logoUrl: c.logoUrl, accentColor: c.accentColor }
  }

  const now = new Date()
  const [tasks, announcements, meetings, myConversationMembers] = await Promise.all([
    db.task.findMany({
      where: {
        clubId: { in: clubIds },
        deletedAt: null,
        assignedToUserId: user.id,
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: LIMIT,
      select: {
        id: true,
        clubId: true,
        title: true,
        status: true,
        dueDate: true,
      },
    }),
    db.announcement.findMany({
      where: {
        clubId: { in: clubIds },
        deletedAt: null,
        OR: [{ title: { contains: q } }, { body: { contains: q } }],
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { id: true, clubId: true, title: true, createdAt: true },
    }),
    db.meeting.findMany({
      where: {
        clubId: { in: clubIds },
        startTime: { gte: now },
        OR: [{ title: { contains: q } }, { location: { contains: q } }],
      },
      orderBy: { startTime: "asc" },
      take: LIMIT,
      select: { id: true, clubId: true, title: true, startTime: true, location: true },
    }),
    db.conversationMember.findMany({
      where: { userId: user.id },
      select: { conversationId: true },
    }),
  ])

  const conversationIds = myConversationMembers.map((m) => m.conversationId)
  const messages = conversationIds.length
    ? await db.message.findMany({
        where: {
          conversationId: { in: conversationIds },
          deletedAt: null,
          body: { contains: q },
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT,
        select: {
          id: true,
          conversationId: true,
          body: true,
          createdAt: true,
          conversation: { select: { clubId: true } },
        },
      })
    : []

  return json({
    tasks: tasks.map((t) => ({
      id: t.id,
      clubId: t.clubId,
      club: clubBadge(t.clubId),
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      type: "task" as const,
    })),
    announcements: announcements.map((a) => ({
      id: a.id,
      clubId: a.clubId,
      club: clubBadge(a.clubId),
      title: a.title,
      createdAt: a.createdAt,
      type: "announcement" as const,
    })),
    meetings: meetings.map((m) => ({
      id: m.id,
      clubId: m.clubId,
      club: clubBadge(m.clubId),
      title: m.title,
      startTime: m.startTime,
      type: "meeting" as const,
    })),
    messages: messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      clubId: m.conversation.clubId,
      club: clubBadge(m.conversation.clubId),
      body: m.body,
      createdAt: m.createdAt,
      type: "message" as const,
    })),
  })
}
