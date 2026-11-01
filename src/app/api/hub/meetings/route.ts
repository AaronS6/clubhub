import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * GET /api/hub/meetings — the combined calendar: meetings across every club
 * the student belongs to inside a date window.
 *
 * Query params:
 *   ?from=ISO&to=ISO   window bounds (default: the current calendar month,
 *                       padded a few days either side for the grid)
 *   ?club=<id>          filter to one club (intersected with memberships)
 *
 * Includes cancelled meetings (flagged) so the calendar can render them
 * struck-through instead of silently vanishing — same convention as the club
 * meetings view. The viewer's RSVP rides along for badges.
 */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return error("Not authenticated", 401)

  const url = new URL(req.url)
  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
  defaultFrom.setDate(defaultFrom.getDate() - 3)
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  defaultTo.setDate(defaultTo.getDate() + 3)

  let from = defaultFrom
  let to = defaultTo
  try {
    const f = url.searchParams.get("from")
    if (f) from = new Date(f)
    const t = url.searchParams.get("to")
    if (t) to = new Date(t)
  } catch {
    // fall back to defaults
  }
  if (isNaN(from.getTime())) from = defaultFrom
  if (isNaN(to.getTime())) to = defaultTo
  // Hard cap on the window (a year) so a bad query can't scan the DB.
  if (to.getTime() - from.getTime() > 366 * 24 * 3600 * 1000) to = defaultTo

  const clubFilter = url.searchParams.get("club")

  const memberships = await db.clubMember.findMany({
    where: { userId: user.id, status: "active" },
    select: {
      club: { select: { id: true, name: true, logoUrl: true, accentColor: true } },
    },
    orderBy: { joinedAt: "asc" },
  })
  let clubIds = memberships.map((m) => m.club.id)
  if (clubFilter) clubIds = clubIds.filter((id) => id === clubFilter)
  const clubById = new Map(memberships.map((m) => [m.club.id, m.club]))

  if (clubIds.length === 0) {
    return json({ meetings: [], clubs: [], from, to })
  }

  const meetings = await db.meeting.findMany({
    where: {
      clubId: { in: clubIds },
      startTime: { gte: from, lte: to },
    },
    orderBy: { startTime: "asc" },
    take: 400,
    select: {
      id: true,
      clubId: true,
      title: true,
      description: true,
      location: true,
      startTime: true,
      endTime: true,
      cancelledAt: true,
      team: { select: { name: true } },
      rsvps: { where: { userId: user.id }, select: { status: true } },
    },
  })

  return json({
    meetings: meetings.map((m) => {
      const c = clubById.get(m.clubId)!
      return {
        id: m.id,
        clubId: m.clubId,
        club: {
          clubId: c.id,
          clubName: c.name,
          logoUrl: c.logoUrl,
          accentColor: c.accentColor,
        },
        title: m.title,
        description: m.description,
        location: m.location,
        startTime: m.startTime,
        endTime: m.endTime,
        teamName: m.team?.name ?? null,
        cancelledAt: m.cancelledAt,
        myRsvp: (m.rsvps[0]?.status as string | undefined) ?? null,
      }
    }),
    clubs: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      logoUrl: m.club.logoUrl,
      accentColor: m.club.accentColor,
    })),
    from,
    to,
  })
}
