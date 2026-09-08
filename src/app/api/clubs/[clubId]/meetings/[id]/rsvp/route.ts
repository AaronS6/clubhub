import { z } from "zod"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

const rsvpSchema = z.object({
  status: z.enum(["going", "not_going", "maybe"]),
})

/** POST /api/clubs/[clubId]/meetings/[id]/rsvp — upsert the current user's RSVP for a meeting. */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const body = await req.json().catch(() => null)
  const parsed = rsvpSchema.safeParse(body)
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid status", 400)
  }

  const meeting = await db.meeting.findUnique({ where: { id }, select: { clubId: true, cancelledAt: true } })
  if (!meeting || meeting.clubId !== clubId) return error("Meeting not found", 404)
  if (meeting.cancelledAt) return error("Cannot RSVP to a cancelled meeting", 400)

  const rsvp = await db.meetingRsvp.upsert({
    where: { meetingId_userId: { meetingId: id, userId: c.user.id } },
    create: { meetingId: id, userId: c.user.id, status: parsed.data.status },
    update: { status: parsed.data.status, respondedAt: new Date() },
    select: { id: true, status: true },
  })

  // Recompute counts after the upsert.
  const rsvps = await db.meetingRsvp.findMany({ where: { meetingId: id }, select: { status: true } })
  const counts = { going: 0, notGoing: 0, maybe: 0 }
  for (const r of rsvps) {
    if (r.status === "going") counts.going++
    else if (r.status === "not_going") counts.notGoing++
    else if (r.status === "maybe") counts.maybe++
  }

  await emitClubEvent(clubId, "meeting_rsvp", { meetingId: id, userId: c.user.id, status: rsvp.status })

  return json({ ok: true, rsvp, rsvpCounts: counts })
}
