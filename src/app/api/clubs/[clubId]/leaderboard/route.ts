import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/leaderboard
 * Returns `[{ userId, name, avatarUrl, hours, tasksDone, meetingsAttended }]`
 * sorted by approved hours desc. Supports `?range=thisMonth|thisSemester|allTime`
 * and `?teamId=` to scope to a specific team's members.
 */
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const url = new URL(req.url)
  const range = url.searchParams.get("range") ?? "allTime"
  const teamId = url.searchParams.get("teamId") || null

  const now = new Date()
  let since: Date | null = null
  if (range === "thisMonth") {
    since = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (range === "thisSemester") {
    // Rough semester window: last 16 weeks
    since = new Date(now)
    since.setDate(since.getDate() - 16 * 7)
  }

  // -- Determine which users to include ------------------------------------
  let memberUserIds: string[] | null = null
  if (teamId) {
    const team = await db.team.findUnique({
      where: { id: teamId },
      select: { id: true, clubId: true },
    })
    if (!team || team.clubId !== clubId) return error("Team not found in this club", 404)
    const teamMembers = await db.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    })
    memberUserIds = teamMembers.map((tm) => tm.userId)
  } else {
    const clubMembers = await db.clubMember.findMany({
      where: { clubId, status: "active" },
      select: { userId: true },
    })
    memberUserIds = clubMembers.map((m) => m.userId)
  }

  if (memberUserIds.length === 0) return json({ items: [], range, teamId })

  // -- 4 independent aggregates/lookups, fanned out as a single parallel wave --
  // hoursByUser, tasksDoneByUser, rsvpsByUser, and users-info all depend only
  // on `memberUserIds` (computed above) — none of them needs the result of
  // another. Running them sequentially was a 4-roundtrip waterfall; Promise.all
  // collapses it to 1 roundtrip.
  const hoursWhere: Record<string, unknown> = {
    clubId,
    status: "approved",
    userId: { in: memberUserIds },
  }
  if (since) hoursWhere.dateOfService = { gte: since }

  const tasksDoneWhere: Record<string, unknown> = {
    clubId,
    status: "done",
    deletedAt: null,
    assignedToUserId: { in: memberUserIds },
  }

  const rsvpWhere: Record<string, unknown> = {
    status: "going",
    meeting: { clubId, cancelledAt: null, ...(since ? { startTime: { gte: since } } : {}) },
    userId: { in: memberUserIds },
  }

  const [hoursByUser, tasksDoneByUser, rsvpsByUser, users] = await Promise.all([
    db.serviceHour.groupBy({
      by: ["userId"],
      where: hoursWhere as any,
      _sum: { hours: true },
    }),
    db.task.groupBy({
      by: ["assignedToUserId"],
      where: tasksDoneWhere as any,
      _count: { _all: true },
    }),
    db.meetingRsvp.groupBy({
      by: ["userId"],
      where: rsvpWhere as any,
      _count: { _all: true },
    }),
    db.user.findMany({
      where: { id: { in: memberUserIds } },
      select: { id: true, name: true, avatarUrl: true },
    }),
  ])

  const hoursMap = new Map<string, number>(
    hoursByUser.map((h) => [h.userId, h._sum.hours ?? 0])
  )
  const tasksMap = new Map<string, number>(
    tasksDoneByUser
      .filter((t) => t.assignedToUserId)
      .map((t) => [t.assignedToUserId as string, t._count._all])
  )
  const rsvpsMap = new Map<string, number>(
    rsvpsByUser.map((r) => [r.userId, r._count._all])
  )

  // Include everyone with >0 hours OR all team members if filtered to a team
  // (so the leaderboard isn't empty for a brand new club).
  const items = users
    .map((u) => ({
      userId: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl ?? null,
      hours: hoursMap.get(u.id) ?? 0,
      tasksDone: tasksMap.get(u.id) ?? 0,
      meetingsAttended: rsvpsMap.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours || b.tasksDone - a.tasksDone)

  return json({ items, range, teamId })
}
