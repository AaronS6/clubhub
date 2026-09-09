import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/** GET /api/clubs/[clubId]/teams — list teams with members, counts, upcoming meetings. */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // Bounded: 200 teams per club is more than any realistic club has, and the
    // inner per-team task/meeting lists are capped too so a single team can't
    // blow up the response.
    const teams = await db.team.findMany({
      where: { clubId },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        members: {
          select: {
            id: true,
            userId: true,
            joinedAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { joinedAt: "asc" },
          take: 200,
        },
        tasks: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 50,
        },
        meetings: {
          where: {
            cancelledAt: null,
            startTime: { gte: new Date() },
          },
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            location: true,
          },
          orderBy: { startTime: "asc" },
          take: 50,
        },
      },
    })

    return json({
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        createdAt: t.createdAt,
        members: t.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          joinedAt: m.joinedAt,
          user: m.user,
        })),
        memberCount: t.members.length,
        taskCount: t.tasks.length,
        upcomingMeetingCount: t.meetings.length,
        tasks: t.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          dueDate: task.dueDate,
          assignee: task.assignee,
        })),
        upcomingMeetings: t.meetings.map((mtg) => ({
          id: mtg.id,
          title: mtg.title,
          startTime: mtg.startTime,
          endTime: mtg.endTime,
          location: mtg.location,
        })),
      })),
      myRole: c.membership.role,
      myUserId: c.user.id,
    })

  } catch (err: any) {
    console.error("[clubs/teams GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load teams: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

/** POST /api/clubs/[clubId]/teams — exec only, creates a new team. */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const { name, description } = body as { name?: string; description?: string }
    if (!name || typeof name !== "string" || name.trim().length === 0)
      return error("Team name is required", 400)
    if (name.length > 80) return error("Team name must be 80 characters or fewer", 400)
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") return error("Description must be a string", 400)
      if (description.length > 1000) return error("Description must be 1000 characters or fewer", 400)
    }

    const team = await db.team.create({
      data: {
        clubId,
        name: name.trim(),
        description: description?.trim() || undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
      },
    })

    // logActivity + notify-members (best-effort try/catch) + emitClubEvent are
    // independent side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "team_created",
        targetType: "team",
        targetId: team.id,
        description: `${c.user.name} created team "${team.name}"`,
      }),
      emitClubEvent(clubId, "team_created", { teamId: team.id }),
      // Notify all other members of the club about the new team (best-effort).
      (async () => {
        try {
          const members = await db.clubMember.findMany({
            where: { clubId, status: "active", userId: { not: c.user.id } },
            select: { userId: true },
          })
          if (members.length > 0) {
            await db.notification.createMany({
              data: members.map((m) => ({
                userId: m.userId,
                clubId,
                type: "new_team",
                message: `A new team "${team.name}" was created.`,
                linkUrl: "?view=teams",
              })),
            })
          }
        } catch (e) {
          console.error("notify new team failed", e)
        }
      })(),
    ])

    return json({ team }, 201)

  } catch (err: any) {
    console.error("[clubs/teams POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to create team: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
