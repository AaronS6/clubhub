import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/dashboard
 * Returns a rich overview object combining the current user's stats, club-wide
 * stats, leaderboard, recent announcements, the user's open tasks, upcoming
 * meetings and a 30-day approved-hours trend. Executives additionally get an
 * `execStats` block.
 *
 * PERFORMANCE: all independent queries are batched with `Promise.all` so they
 * run concurrently against SQLite. The previous version fired 22 sequential
 * `await db.*` calls; this version fires ~3 parallel waves. Since the
 * dashboard is both the most-visited page AND polls frequently (realtime +
 * fallback), this is the single highest-value perf fix in the app.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const isExec = c.membership.role === "executive"
  const userId = c.user.id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const since = new Date(now)
  since.setDate(since.getDate() - 29)
  since.setHours(0, 0, 0, 0)
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  // ---- WAVE 1: club info + all independent counts/aggregates in parallel ----
  const [
    club,
    memberCount,
    myHoursAgg,
    myPendingHours,
    myOpenTasks,
    myTasksDone,
    upcomingMeetingsForMe,
    clubApprovedHoursAgg,
    pendingApprovals,
    openTasksCount,
    tasksDoneCount,
    upcomingMeetingsCount,
    announcementsThisMonth,
    teamsCount,
    hoursByUser,
    recentAnnouncements,
    myTasks,
    upcomingMeetingsRaw,
    recentApproved,
    activeMemberIds,
  ] = await Promise.all([
    db.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        description: true,
        accentColor: true,
        logoUrl: true,
        hoursGoal: true,
        createdAt: true,
      },
    }),
    db.clubMember.count({ where: { clubId, status: "active" } }),
    // My stats
    db.serviceHour.aggregate({
      where: { clubId, userId, status: "approved" },
      _sum: { hours: true },
    }),
    db.serviceHour.aggregate({
      where: { clubId, userId, status: "pending" },
      _sum: { hours: true },
    }),
    db.task.count({
      where: { clubId, assignedToUserId: userId, status: { not: "done" }, deletedAt: null },
    }),
    db.task.count({
      where: { clubId, assignedToUserId: userId, status: "done", deletedAt: null },
    }),
    db.meeting.count({
      where: {
        clubId,
        startTime: { gte: now },
        cancelledAt: null,
        rsvps: { some: { userId, status: "going" } },
      },
    }),
    // Club stats
    db.serviceHour.aggregate({
      where: { clubId, status: "approved" },
      _sum: { hours: true },
    }),
    db.serviceHour.count({ where: { clubId, status: "pending" } }),
    db.task.count({ where: { clubId, status: { not: "done" }, deletedAt: null } }),
    db.task.count({ where: { clubId, status: "done", deletedAt: null } }),
    db.meeting.count({ where: { clubId, startTime: { gte: now }, cancelledAt: null } }),
    db.announcement.count({
      where: { clubId, deletedAt: null, createdAt: { gte: startOfMonth } },
    }),
    db.team.count({ where: { clubId } }),
    // Leaderboard (top 5 by approved hours) — groupBy only, user lookup in wave 2
    db.serviceHour.groupBy({
      by: ["userId"],
      where: { clubId, status: "approved" },
      _sum: { hours: true },
    }),
    // Recent announcements (last 3)
    db.announcement.findMany({
      where: { clubId, deletedAt: null },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 3,
      select: {
        id: true,
        title: true,
        isPinned: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    }),
    // My open tasks (max 5)
    db.task.findMany({
      where: {
        clubId,
        assignedToUserId: userId,
        status: { not: "done" },
        deletedAt: null,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        team: { select: { name: true } },
      },
    }),
    // Upcoming meetings (next 3)
    db.meeting.findMany({
      where: { clubId, startTime: { gte: now }, cancelledAt: null },
      orderBy: { startTime: "asc" },
      take: 3,
      select: {
        id: true,
        title: true,
        startTime: true,
        location: true,
        rsvps: { where: { userId }, select: { status: true } },
      },
    }),
    // Hours trend (last 30 days approved)
    db.serviceHour.findMany({
      where: { clubId, status: "approved", dateOfService: { gte: since } },
      select: { dateOfService: true, hours: true },
    }),
    // Active member IDs — used to filter the leaderboard (removed members
    // with approved hours should NOT appear on the leaderboard).
    db.clubMember.findMany({
      where: { clubId, status: "active" },
      select: { userId: true },
    }),
  ])

  if (!club) return error("Club not found", 404)

  // ---- WAVE 2: leaderboard user names + exec stats (depend on wave 1) ----
  const activeIds = new Set(activeMemberIds.map((m) => m.userId))
  const topUserIds = [...hoursByUser]
    .filter((h) => activeIds.has(h.userId)) // exclude removed members
    .sort((a, b) => (b._sum.hours ?? 0) - (a._sum.hours ?? 0))
    .slice(0, 5)
    .map((h) => h.userId)

  const [topUsers, reviewedHours, submissionsThisWeek] = await Promise.all([
    topUserIds.length
      ? db.user.findMany({
          where: { id: { in: topUserIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : Promise.resolve([]),
    isExec
      ? db.serviceHour.findMany({
          where: { clubId, status: { in: ["approved", "rejected"] }, reviewedAt: { not: null } },
          select: { submittedAt: true, reviewedAt: true },
          take: 200,
          orderBy: { reviewedAt: "desc" },
        })
      : Promise.resolve([]),
    isExec
      ? db.serviceHour.count({ where: { clubId, submittedAt: { gte: weekAgo } } })
      : Promise.resolve(0),
  ])

  // ---- Build response (pure in-memory, no DB) ----
  const userMap = new Map<string, { id: string; name: string; avatarUrl: string | null }>(
    topUsers.map((u) => [u.id, u] as const)
  )
  const leaderboard = [...hoursByUser]
    .sort((a, b) => (b._sum.hours ?? 0) - (a._sum.hours ?? 0))
    .slice(0, 5)
    .map((h) => {
      const u = userMap.get(h.userId)
      return {
        userId: h.userId,
        name: u?.name ?? "Unknown",
        avatarUrl: u?.avatarUrl ?? null,
        hours: h._sum.hours ?? 0,
      }
    })

  // Build hours trend map
  const trendMap = new Map<string, number>()
  for (let i = 0; i < 30; i++) {
    const d = new Date(since)
    d.setDate(since.getDate() + i)
    trendMap.set(dateKey(d), 0)
  }
  for (const h of recentApproved) {
    const key = dateKey(new Date(h.dateOfService))
    if (trendMap.has(key)) trendMap.set(key, (trendMap.get(key) ?? 0) + (h.hours ?? 0))
  }
  const hoursTrend = Array.from(trendMap.entries()).map(([date, hours]) => ({ date, hours }))

  let execStats: {
    avgApprovalTurnaroundHours: number | null
    submissionsThisWeek: number
    taskCompletionRate: number
  } | null = null

  if (isExec) {
    let avgTurnaroundHours: number | null = null
    if (reviewedHours.length > 0) {
      const totalMs = reviewedHours.reduce((acc, h) => {
        if (!h.reviewedAt) return acc
        return acc + (h.reviewedAt.getTime() - h.submittedAt.getTime())
      }, 0)
      avgTurnaroundHours = totalMs / reviewedHours.length / (1000 * 60 * 60)
    }
    const totalAssignedTasks = openTasksCount + tasksDoneCount
    const taskCompletionRate =
      totalAssignedTasks === 0 ? 0 : Math.round((tasksDoneCount / totalAssignedTasks) * 100)
    execStats = {
      avgApprovalTurnaroundHours: avgTurnaroundHours,
      submissionsThisWeek,
      taskCompletionRate,
    }
  }

  const upcomingMeetings = upcomingMeetingsRaw.map((m) => ({
    id: m.id,
    title: m.title,
    startTime: m.startTime,
    location: m.location,
    myRsvp: (m.rsvps[0]?.status ?? null) as "going" | "not_going" | "maybe" | null,
  }))

  return json({
    club: { ...club, memberCount },
    myRole: c.membership.role,
    myStats: {
      approvedHours: myHoursAgg._sum.hours ?? 0,
      pendingHours: myPendingHours._sum.hours ?? 0,
      tasksAssigned: myOpenTasks,
      tasksDone: myTasksDone,
      upcomingMeetings: upcomingMeetingsForMe,
      myRsvpsGoing: upcomingMeetingsForMe,
    },
    clubStats: {
      totalMembers: memberCount,
      totalApprovedHours: clubApprovedHoursAgg._sum.hours ?? 0,
      pendingApprovals,
      openTasks: openTasksCount,
      tasksDone: tasksDoneCount,
      upcomingMeetingsCount,
      announcementsThisMonth,
      teamsCount,
    },
    leaderboard,
    recentAnnouncements: recentAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      isPinned: a.isPinned,
      createdAt: a.createdAt,
      authorName: a.author.name,
    })),
    myTasks: myTasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      status: t.status,
      teamName: t.team?.name ?? null,
    })),
    upcomingMeetings,
    hoursTrend,
    execStats,
  })
}

function dateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
