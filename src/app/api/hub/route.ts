import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * GET /api/hub — the My Hub dashboard aggregate.
 *
 * Cross-club overview for the authenticated student: upcoming meetings,
 * recent announcements, their open tasks, summary stats, and participation
 * (service hours + badges) — drawn from EVERY club they actively belong to.
 *
 * SECURITY: the club set is derived from the user's active ClubMember rows
 * on every request. Nothing the client sends influences authorization.
 *
 * PERFORMANCE: one membership query, then a single parallel wave of ~10
 * Prisma calls (same pattern as the club dashboard route). This endpoint
 * backs the most-visited screen for multi-club students, so it stays at
 * exactly one round-trip wave.
 */
export async function GET() {
  const user = await getSessionUser()
  if (!user) return error("Not authenticated", 401)

  const memberships = await db.clubMember.findMany({
    where: { userId: user.id, status: "active" },
    select: {
      role: true,
      club: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          accentColor: true,
          clubCode: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  })
  const clubIds = memberships.map((m) => m.club.id)
  if (clubIds.length === 0) {
    return json({
      clubs: [],
      stats: {
        upcomingEvents: 0,
        pendingTasks: 0,
        unreadUpdates: 0,
        approvedHours: 0,
        pendingHours: 0,
        unreadMessages: 0,
      },
      week: [],
      updates: [],
      tasks: [],
      activity: {
        approvedHours: 0,
        pendingHours: 0,
        pendingCount: 0,
        badgesTotal: 0,
        recentBadges: [],
        recentHours: [],
      },
    })
  }

  const now = new Date()
  const userId = user.id

  // ---- Single parallel wave ------------------------------------------------
  const [
    upcomingMeetingsRaw,
    recentAnnouncementsRaw,
    myTasksRaw,
    upcomingEventsCount,
    pendingTasksCount,
    unreadUpdatesCount,
    approvedHoursAgg,
    pendingHoursAgg,
    pendingHoursCount,
    badgesTotal,
    recentBadgesRaw,
    recentHoursRaw,
    myConversationMemberships,
  ] = await Promise.all([
    // Upcoming meetings across clubs (agenda "Your Week" + per-club next
    // meeting are both derived from this one query). ALL rsvps ride along
    // (userId + status only): the viewer's own row feeds `myRsvp` while a
    // status filter would drop non-"going" responses — so goingCount and
    // myRsvp are both derived in memory from the same rows.
    db.meeting.findMany({
      where: { clubId: { in: clubIds }, startTime: { gte: now }, cancelledAt: null },
      orderBy: { startTime: "asc" },
      take: 40,
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        location: true,
        clubId: true,
        team: { select: { name: true } },
        rsvps: { select: { userId: true, status: true } },
      },
    }),
    // Recent announcements across clubs (feed preview).
    db.announcement.findMany({
      where: { clubId: { in: clubIds }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        clubId: true,
        title: true,
        body: true,
        isPinned: true,
        isUrgent: true,
        accent: true,
        tag: true,
        createdAt: true,
        author: { select: { name: true, avatarUrl: true } },
        poll: { select: { id: true } },
        _count: { select: { reactions: true, comments: true } },
      },
    }),
    // My open tasks across clubs.
    db.task.findMany({
      where: {
        clubId: { in: clubIds },
        assignedToUserId: userId,
        status: { not: "done" },
        deletedAt: null,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        clubId: true,
        title: true,
        description: true,
        dueDate: true,
        status: true,
        team: { select: { name: true } },
        subtasks: { select: { isDone: true } },
      },
    }),
    db.meeting.count({
      where: { clubId: { in: clubIds }, startTime: { gte: now }, cancelledAt: null },
    }),
    db.task.count({
      where: {
        clubId: { in: clubIds },
        assignedToUserId: userId,
        status: { not: "done" },
        deletedAt: null,
      },
    }),
    // "Unread updates" = unread new-announcement notifications (the bell's
    // total unread is a different, broader number).
    db.notification.count({
      where: { userId, isRead: false, type: "new_announcement" },
    }),
    db.serviceHour.aggregate({
      where: { userId, status: "approved", clubId: { in: clubIds } },
      _sum: { hours: true },
    }),
    db.serviceHour.aggregate({
      where: { userId, status: "pending", clubId: { in: clubIds } },
      _sum: { hours: true },
    }),
    db.serviceHour.count({
      where: { userId, status: "pending", clubId: { in: clubIds } },
    }),
    db.memberBadge.count({ where: { userId } }),
    db.memberBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: "desc" },
      take: 3,
      select: {
        id: true,
        awardedAt: true,
        badge: { select: { name: true, emoji: true } },
        club: { select: { name: true } },
        awarder: { select: { name: true } },
      },
    }),
    db.serviceHour.findMany({
      where: { userId, clubId: { in: clubIds }, status: { in: ["approved", "pending"] } },
      orderBy: { dateOfService: "desc" },
      take: 4,
      select: {
        id: true,
        clubId: true,
        hours: true,
        status: true,
        dateOfService: true,
        reasonText: true,
        club: { select: { name: true, accentColor: true } },
      },
    }),
    // My conversation memberships — feeds the "unread messages" stat (and
    // shortcuts dot) without loading any message bodies. The dashboard only
    // needs the COUNT of unread, so we fetch per-conversation read cursors
    // and count newer non-own messages in one grouped pass below.
    db.conversationMember.findMany({
      where: { userId, conversation: { clubId: { in: clubIds } } },
      select: {
        lastReadAt: true,
        conversationId: true,
      },
    }),
  ])

  // ---- Assemble (pure in-memory) --------------------------------------------
  const clubById = new Map(memberships.map((m) => [m.club.id, m.club]))
  const clubBadge = (clubId: string) => {
    const c = clubById.get(clubId)!
    return {
      clubId: c.id,
      clubName: c.name,
      logoUrl: c.logoUrl,
      accentColor: c.accentColor,
    }
  }

  const toHubMeeting = (m: (typeof upcomingMeetingsRaw)[number]) => ({
    id: m.id,
    title: m.title,
    startTime: m.startTime,
    endTime: m.endTime,
    location: m.location,
    clubId: m.clubId,
    club: clubBadge(m.clubId),
    description: null as string | null,
    teamName: m.team?.name ?? null,
    cancelledAt: null as string | null,
    myRsvp: (m.rsvps.find((r) => r.userId === userId)?.status as string | undefined) ?? null,
    goingCount: m.rsvps.filter((r) => r.status === "going").length,
  })

  // First upcoming meeting per club (club cards).
  const nextMeetingByClub = new Map<string, (typeof upcomingMeetingsRaw)[number]>()
  for (const m of upcomingMeetingsRaw) {
    if (!nextMeetingByClub.has(m.clubId)) nextMeetingByClub.set(m.clubId, m)
  }

  const week = upcomingMeetingsRaw.slice(0, 8).map(toHubMeeting)

  // Unread messages across clubs for the Messages shortcut dot. Per-row
  // read cursors can't be expressed in one Prisma `where`, so we take one
  // lean indexed pass over recent non-own messages in the user's
  // conversations (ids + timestamps only) and count past each
  // conversation's cursor in memory. Capped at 600 rows — past that the
  // exact count stops mattering (it renders as a badge either way).
  let unreadMessages = 0
  if (myConversationMemberships.length > 0) {
    const readCursorByConv = new Map(
      myConversationMemberships.map((m) => [m.conversationId, m.lastReadAt])
    )
    const candidates = await db.message.findMany({
      where: {
        conversationId: { in: Array.from(readCursorByConv.keys()) },
        deletedAt: null,
        authorId: { not: userId },
      },
      select: { conversationId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 600,
    })
    unreadMessages = candidates.filter((c) => {
      const cursor = readCursorByConv.get(c.conversationId)
      return !cursor || c.createdAt > cursor
    }).length
  }

  const updates = recentAnnouncementsRaw.map((a) => ({
    id: a.id,
    clubId: a.clubId,
    club: clubBadge(a.clubId),
    title: a.title,
    body: a.body,
    isPinned: a.isPinned,
    isUrgent: a.isUrgent,
    accent: a.accent,
    tag: a.tag,
    createdAt: a.createdAt,
    authorName: a.author?.name ?? null,
    authorAvatarUrl: a.author?.avatarUrl ?? null,
    hasPoll: !!a.poll,
    reactionCount: a._count.reactions,
    commentCount: a._count.comments,
  }))

  const tasks = myTasksRaw.map((t) => ({
    id: t.id,
    clubId: t.clubId,
    club: clubBadge(t.clubId),
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    status: t.status as "not_started" | "in_progress" | "done",
    teamName: t.team?.name ?? null,
    subtaskTotal: t.subtasks.length,
    subtaskDone: t.subtasks.filter((s) => s.isDone).length,
  }))

  const clubs = memberships.map((m) => {
    const next = nextMeetingByClub.get(m.club.id)
    return {
      clubId: m.club.id,
      clubName: m.club.name,
      logoUrl: m.club.logoUrl,
      accentColor: m.club.accentColor,
      clubCode: m.club.clubCode,
      role: m.role as "member" | "executive",
      nextMeeting: next
        ? { id: next.id, title: next.title, startTime: next.startTime }
        : null,
    }
  })

  return json({
    clubs,
    stats: {
      upcomingEvents: upcomingEventsCount,
      pendingTasks: pendingTasksCount,
      unreadUpdates: unreadUpdatesCount,
      unreadMessages,
      approvedHours: approvedHoursAgg._sum.hours ?? 0,
      pendingHours: pendingHoursAgg._sum.hours ?? 0,
    },
    week,
    updates,
    tasks,
    activity: {
      approvedHours: approvedHoursAgg._sum.hours ?? 0,
      pendingHours: pendingHoursAgg._sum.hours ?? 0,
      pendingCount: pendingHoursCount,
      badgesTotal,
      recentBadges: recentBadgesRaw.map((b) => ({
        id: b.id,
        name: b.badge.name,
        emoji: b.badge.emoji,
        clubName: b.club.name,
        awardedAt: b.awardedAt,
        awardedByName: b.awarder?.name ?? null,
      })),
      recentHours: recentHoursRaw.map((h) => ({
        id: h.id,
        clubId: h.clubId,
        clubName: h.club.name,
        clubAccent: h.club.accentColor,
        hours: h.hours,
        status: h.status,
        dateOfService: h.dateOfService,
        reasonText: h.reasonText,
      })),
    },
  })
}
