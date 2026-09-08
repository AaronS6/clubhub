import { z } from "zod"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notifyClub } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"
import { rateLimit } from "@/lib/rate-limit"

type RsvpStatus = "going" | "not_going" | "maybe"

// Generous cap — exec-only already, but each recurring meeting creates up to
// 9 rows in a transaction. A compromised exec could spam-create to bloat the
// calendar/DB. 30/min/user is well above any legitimate scheduling cadence.
const MEETING_RATE_LIMIT_MAX = 30
const MEETING_RATE_LIMIT_WINDOW_MS = 60_000

interface RsvpRow {
  status: string
  userId: string
}

function summarizeRsvps(rsvps: RsvpRow[], currentUserId: string) {
  let going = 0
  let notGoing = 0
  let maybe = 0
  let myStatus: RsvpStatus | null = null
  for (const r of rsvps) {
    if (r.status === "going") going++
    else if (r.status === "not_going") notGoing++
    else if (r.status === "maybe") maybe++
    if (r.userId === currentUserId) {
      myStatus = r.status as RsvpStatus
    }
  }
  return { going, notGoing, maybe, myStatus }
}

/** GET /api/clubs/[clubId]/meetings — list upcoming + recent meetings. */
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const url = new URL(req.url)
  const teamId = url.searchParams.get("teamId")
  const now = new Date()
  // "recent" window: include meetings that ended in the last 7 days.
  const recentSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // meetings + teams are independent — fan them out in parallel.
  const [meetings, teams] = await Promise.all([
    db.meeting.findMany({
      where: {
        clubId,
        cancelledAt: null,
        endTime: { gte: recentSince },
        ...(teamId ? { teamId } : {}),
      },
      include: {
        creator: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
        rsvps: { select: { status: true, userId: true } },
      },
      orderBy: { startTime: "asc" },
      take: 200,
    }),
    db.team.findMany({
      where: { clubId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  return json({
    meetings: meetings.map((m) => {
      const counts = summarizeRsvps(m.rsvps, c.user.id)
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        location: m.location,
        startTime: m.startTime,
        endTime: m.endTime,
        isRecurring: m.isRecurring,
        recurrenceRule: m.recurrenceRule,
        cancelledAt: m.cancelledAt,
        createdAt: m.createdAt,
        teamId: m.teamId,
        team: m.team,
        createdById: m.createdById,
        creator: m.creator,
        rsvpCounts: { going: counts.going, notGoing: counts.notGoing, maybe: counts.maybe },
        myRsvp: counts.myStatus,
      }
    }),
    teams,
    now: now.toISOString(),
    myUserId: c.user.id,
    myRole: c.membership.role,
  })
}

const recurrenceRuleSchema = z.enum(["weekly", "biweekly", "monthly"])

const createSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().min(1).max(200),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  teamId: z.string().optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurrenceRule: recurrenceRuleSchema.optional().nullable(),
})

function addInterval(date: Date, rule: "weekly" | "biweekly" | "monthly", n: number) {
  const d = new Date(date.getTime())
  if (rule === "weekly") d.setDate(d.getDate() + 7 * n)
  else if (rule === "biweekly") d.setDate(d.getDate() + 14 * n)
  else if (rule === "monthly") d.setMonth(d.getMonth() + n)
  return d
}

/** POST /api/clubs/[clubId]/meetings — executive only. Creates a meeting (and ~8 occurrences if recurring). */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can create meetings", 403)

  // Rate limit: 30 meetings per user per minute. Recurring meetings create
  // up to 9 rows each, so this caps DB writes at ~270/min in the worst case.
  const rlKey = `meeting:${c.user.id}`
  const rl = rateLimit(rlKey, MEETING_RATE_LIMIT_MAX, MEETING_RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
    return Response.json(
      { error: "You're scheduling too quickly. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid input", 400)
  }
  const { title, description, location, startTime, endTime, teamId, isRecurring, recurrenceRule } = parsed.data

  const start = new Date(startTime)
  const end = new Date(endTime)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return error("Invalid start or end time", 400)
  if (end <= start) return error("End time must be after start time", 400)

  if (isRecurring && !recurrenceRule) {
    return error("recurrenceRule is required when isRecurring is true", 400)
  }

  // validate team if provided
  if (teamId) {
    const team = await db.team.findUnique({ where: { id: teamId }, select: { clubId: true } })
    if (!team || team.clubId !== clubId) return error("Invalid team", 400)
  }

  const durationMs = end.getTime() - start.getTime()
  const baseData = {
    clubId,
    teamId: teamId ?? null,
    title,
    description: description ?? null,
    location,
    isRecurring: !!isRecurring,
    recurrenceRule: isRecurring ? recurrenceRule! : null,
    createdById: c.user.id,
  }

  // Create the first (anchor) occurrence + the next ~8 occurrences.
  const OCCURRENCE_COUNT = isRecurring ? 9 : 1 // 1 original + 8 next = 9 total
  const meetingsToCreate: Array<{ startTime: Date; endTime: Date }> = []
  for (let i = 0; i < OCCURRENCE_COUNT; i++) {
    if (isRecurring) {
      meetingsToCreate.push({
        startTime: addInterval(start, recurrenceRule!, i),
        endTime: new Date(addInterval(start, recurrenceRule!, i).getTime() + durationMs),
      })
    } else {
      meetingsToCreate.push({ startTime: start, endTime: end })
    }
  }

  const created = await db.$transaction(
    meetingsToCreate.map((m) =>
      db.meeting.create({
        data: { ...baseData, startTime: m.startTime, endTime: m.endTime },
        select: { id: true, startTime: true, endTime: true },
      })
    )
  )

  const first = created[0]
  // logActivity + notifyClub + emitClubEvent are independent best-effort side
  // effects — fan them out in parallel.
  await Promise.all([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "meeting_created",
      targetType: "meeting",
      targetId: first.id,
      description: `${c.user.name} scheduled "${title}"${isRecurring ? ` (recurring ${recurrenceRule}, ${OCCURRENCE_COUNT} occurrences)` : ""}`,
    }),
    notifyClub({
      clubId,
      excludeUserId: c.user.id,
      type: "meeting_created",
      message: `New meeting: "${title}" — ${start.toLocaleString()}`,
      linkUrl: `/?view=meetings`,
    }),
    emitClubEvent(clubId, "meeting_created", { meetingIds: created.map((m) => m.id) }),
  ])

  return json({ ok: true, ids: created.map((m) => m.id), count: created.length }, 201)
}
