import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function toIcsDateTime(date: Date) {
  // UTC, format YYYYMMDDTHHMMSSZ
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

function escapeIcs(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/** GET /api/clubs/[clubId]/meetings/ics — generate a .ics calendar for the club's upcoming non-cancelled meetings. */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const now = new Date()
    const meetings = await db.meeting.findMany({
      where: {
        clubId,
        cancelledAt: null,
        startTime: { gte: now },
      },
      orderBy: { startTime: "asc" },
      take: 100,
      include: { team: { select: { name: true } } },
    })

    const dtstamp = toIcsDateTime(now)
    const lines: string[] = []
    lines.push("BEGIN:VCALENDAR")
    lines.push("VERSION:2.0")
    lines.push("PRODID:-//ClubHub//Meetings//EN")
    lines.push("CALSCALE:GREGORIAN")
    lines.push("METHOD:PUBLISH")
    lines.push(`X-WR-CALNAME:${escapeIcs(c.club.name)} Meetings`)

    for (const m of meetings) {
      const descriptionParts: string[] = []
      if (m.description) descriptionParts.push(m.description)
      if (m.team?.name) descriptionParts.push(`Team: ${m.team.name}`)
      if (m.isRecurring && m.recurrenceRule) {
        descriptionParts.push(`Recurring: ${m.recurrenceRule}`)
      }
      lines.push("BEGIN:VEVENT")
      lines.push(`UID:${m.id}@clubhub`)
      lines.push(`DTSTAMP:${dtstamp}`)
      lines.push(`DTSTART:${toIcsDateTime(m.startTime)}`)
      lines.push(`DTEND:${toIcsDateTime(m.endTime)}`)
      lines.push(`SUMMARY:${escapeIcs(m.title)}`)
      lines.push(`LOCATION:${escapeIcs(m.location)}`)
      if (descriptionParts.length > 0) {
        lines.push(`DESCRIPTION:${escapeIcs(descriptionParts.join("\n"))}`)
      }
      lines.push("END:VEVENT")
    }

    lines.push("END:VCALENDAR")

    const body = lines.join("\r\n")

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="club-meetings.ics"`,
        "Cache-Control": "no-store",
      },
    })

  } catch (err: any) {
    console.error("[clubs/meetings/ics GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to generate calendar feed: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
