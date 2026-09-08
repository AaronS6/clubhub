import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

const STATUS_ORDER: Record<string, number> = { going: 0, maybe: 1, not_going: 2 }

/** GET /api/clubs/[clubId]/meetings/[id]/attendees — exec only. Returns RSVP list with user info. */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can view attendees", 403)

  const meeting = await db.meeting.findUnique({ where: { id }, select: { clubId: true, title: true, startTime: true } })
  if (!meeting || meeting.clubId !== clubId) return error("Meeting not found", 404)

  const rsvps = await db.meetingRsvp.findMany({
    where: { meetingId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { respondedAt: "desc" },
  })

  const sorted = [...rsvps].sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99))

  return json({
    meeting: { id, title: meeting.title, startTime: meeting.startTime },
    attendees: sorted.map((r) => ({
      id: r.id,
      status: r.status,
      respondedAt: r.respondedAt,
      user: r.user,
    })),
  })
}
