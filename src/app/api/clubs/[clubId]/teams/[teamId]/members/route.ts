import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

type Ctx = { params: Promise<{ clubId: string; teamId: string }> }

/** POST /api/clubs/[clubId]/teams/[teamId]/members — exec only. Body { userId }.
 *  Adds a member to the team. Unique constraint prevents duplicates. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { clubId, teamId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const team = await db.team.findFirst({ where: { id: teamId, clubId } })
    if (!team) return error("Team not found", 404)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const { userId } = body as { userId?: string }
    if (!userId || typeof userId !== "string") return error("userId is required", 400)

    // Ensure the target user is an active member of this club.
    const membership = await db.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
      include: { user: { select: { id: true, name: true } } },
    })
    if (!membership || membership.status !== "active")
      return error("User is not an active member of this club", 404)

    // Check for existing membership to give a friendly error (unique constraint).
    const existing = await db.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    })
    if (existing) return error("User is already on this team", 400)

    const tm = await db.teamMember.create({
      data: { teamId, userId },
      select: {
        id: true,
        teamId: true,
        userId: true,
        joinedAt: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "team_member_added",
      targetType: "team",
      targetId: team.id,
      description: `${c.user.name} added ${membership.user.name} to team "${team.name}"`,
    })
    await notify({
      userId,
      clubId,
      type: "team_member_added",
      message: `You were added to team "${team.name}"`,
      linkUrl: "?view=teams",
    }).catch(() => {})

    await emitClubEvent(clubId, "team_member_added", { teamId: team.id, userId })

    return json({ member: tm }, 201)

  } catch (err: any) {
    console.error("[clubs/teams/members POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to add member: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
