import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/search?q=<query>
 * Requires active membership of the club. Returns categorized matches for
 * navigation-relevant content within this club: members, tasks,
 * announcements, meetings, and CHAT MESSAGES (scoped to conversations the
 * requesting user is a member of — DMs never leak into other members'
 * search results).
 *
 * Notes:
 *   - SQLite's LIKE is ASCII-case-insensitive by default, so we use plain
 *     `contains` (no `mode: 'insensitive'`, which SQLite does not support).
 *   - q must be at least 1 char (after trim); empty/whitespace returns empty arrays.
 *   - Soft-deleted tasks/announcements/messages and cancelled meetings are excluded.
 *   - Each category is capped at 8 results.
 */
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const url = new URL(req.url)
  const qRaw = (url.searchParams.get("q") ?? "").trim()
  if (!qRaw) {
    return json({ members: [], tasks: [], announcements: [], meetings: [], messages: [] })
  }
  // Bounded to a sane length to avoid pathological LIKE patterns.
  const q = qRaw.slice(0, 200)
  const LIMIT = 8

  const [members, tasks, announcements, meetings, messages] = await Promise.all([
    db.clubMember.findMany({
      where: {
        clubId,
        status: "active",
        OR: [
          { user: { name: { contains: q } } },
          { user: { email: { contains: q } } },
        ],
      },
      take: LIMIT,
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: [{ role: "desc" }, { joinedAt: "asc" }],
    }),
    db.task.findMany({
      where: {
        clubId,
        deletedAt: null,
        title: { contains: q },
      },
      take: LIMIT,
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
    db.announcement.findMany({
      where: {
        clubId,
        deletedAt: null,
        title: { contains: q },
      },
      take: LIMIT,
      select: {
        id: true,
        title: true,
        createdAt: true,
        isPinned: true,
      },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    }),
    db.meeting.findMany({
      where: {
        clubId,
        cancelledAt: null,
        title: { contains: q },
      },
      take: LIMIT,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        location: true,
      },
      orderBy: { startTime: "asc" },
    }),
    // Chat messages — only conversations THIS user belongs to (a member's
    // DMs must never surface in someone else's search results). Latest
    // first; the client renders a context snippet around the match.
    db.message.findMany({
      where: {
        deletedAt: null,
        body: { contains: q },
        conversation: {
          clubId,
          members: { some: { userId: c.user.id } },
        },
      },
      take: LIMIT,
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorId: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
        conversation: {
          select: {
            id: true,
            type: true,
            name: true,
            members: {
              where: { userId: { not: c.user.id } },
              select: { user: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return json({
    members: members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl ?? null,
      role: m.role as "member" | "executive",
      type: "member" as const,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      type: "task" as const,
    })),
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      createdAt: a.createdAt,
      isPinned: a.isPinned,
      type: "announcement" as const,
    })),
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      startTime: m.startTime,
      endTime: m.endTime,
      location: m.location,
      type: "meeting" as const,
    })),
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      authorId: m.authorId,
      authorName: m.author.name,
      authorAvatarUrl: m.author.avatarUrl ?? null,
      conversationId: m.conversation.id,
      conversationType: m.conversation.type,
      // Display label for the conversation: group name, the other member
      // for DMs, or the club-wide room.
      conversationName:
        m.conversation.type === "direct"
          ? m.conversation.members[0]?.user.name ?? "Direct chat"
          : m.conversation.type === "club_wide"
            ? "Club chat"
            : m.conversation.name ?? "Group chat",
      type: "message" as const,
    })),
  })
}
