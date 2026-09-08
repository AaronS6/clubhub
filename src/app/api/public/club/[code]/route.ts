import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/**
 * GET /api/public/club/[code]
 *
 * Public, UNAUTHENTICATED endpoint that returns safe, recruiting-friendly info
 * about a club by its `clubCode`. Powers the `/?public=<code>` landing page.
 *
 * Returned fields:
 *   - name, description, accentColor, logoUrl, clubCode
 *   - memberCount (active members)
 *   - totalHoursLogged (sum of approved ServiceHour.hours)
 *   - upcomingMeetingCount (future, non-cancelled meetings)
 *
 * NO sensitive data: no passwords, no member lists, no emails, no club internals.
 *
 * The route is intentionally permissive — anyone with the (6-char) club code
 * can view this. If a club wants to be truly hidden, they shouldn't share the
 * code. The club join password (stored encrypted separately) still gates actual
 * membership.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const normalized = (code ?? "").trim().toUpperCase()
  if (!normalized) {
    return NextResponse.json({ error: "Missing club code" }, { status: 400 })
  }

  const club = await db.club.findUnique({
    where: { clubCode: normalized },
    select: {
      id: true,
      name: true,
      description: true,
      accentColor: true,
      logoUrl: true,
      clubCode: true,
      createdAt: true,
      _count: { select: { members: { where: { status: "active" } } } },
    },
  })
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 })
  }

  // Aggregate approved hours + upcoming meetings in parallel.
  const [hoursAgg, upcomingMeetings] = await Promise.all([
    db.serviceHour.aggregate({
      where: { clubId: club.id, status: "approved" },
      _sum: { hours: true },
    }),
    db.meeting.count({
      where: {
        clubId: club.id,
        cancelledAt: null,
        startTime: { gt: new Date() },
      },
    }),
  ])

  return NextResponse.json({
    club: {
      name: club.name,
      description: club.description,
      accentColor: club.accentColor,
      logoUrl: club.logoUrl,
      clubCode: club.clubCode,
      createdAt: club.createdAt,
      memberCount: club._count.members,
      totalHoursLogged: hoursAgg._sum.hours ?? 0,
      upcomingMeetingCount: upcomingMeetings,
    },
  })
}
