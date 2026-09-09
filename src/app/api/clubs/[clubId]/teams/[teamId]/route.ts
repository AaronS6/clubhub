import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

type Ctx = { params: Promise<{ clubId: string; teamId: string }> }

/** Resolve and authorize the team within the club. */
async function getTeam(clubId: string, teamId: string) {
  return db.team.findFirst({ where: { id: teamId, clubId } })
}

/** PATCH /api/clubs/[clubId]/teams/[teamId] — exec only, update name/description. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { clubId, teamId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const team = await getTeam(clubId, teamId)
    if (!team) return error("Team not found", 404)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const { name, description } = body as {
      name?: string
      description?: string | null
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0)
        return error("Team name must not be empty", 400)
      if (name.length > 80) return error("Team name must be 80 characters or fewer", 400)
      data.name = name.trim()
    }
    if (description !== undefined) {
      if (description !== null) {
        if (typeof description !== "string")
          return error("Description must be a string", 400)
        if (description.length > 1000)
          return error("Description must be 1000 characters or fewer", 400)
        data.description = description.trim() || null
      } else {
        data.description = null
      }
    }

    if (Object.keys(data).length === 0) return error("No valid fields to update", 400)

    const updated = await db.team.update({
      where: { id: team.id },
      data,
      select: { id: true, name: true, description: true, createdAt: true },
    })

    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "team_updated",
        targetType: "team",
        targetId: team.id,
        description: `${c.user.name} updated team "${updated.name}"`,
      }),
      emitClubEvent(clubId, "team_updated", { teamId: team.id }),
    ])

    return json({ team: updated })

  } catch (err: any) {
    console.error("[clubs/teams PATCH] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to update team: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

/** DELETE /api/clubs/[clubId]/teams/[teamId] — exec only. Cascades team_members; tasks/meetings get teamId=null. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const { clubId, teamId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const team = await getTeam(clubId, teamId)
    if (!team) return error("Team not found", 404)

    // team_members cascade on Team delete; tasks & meetings have onDelete: SetNull
    await db.team.delete({ where: { id: team.id } })

    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "team_deleted",
        targetType: "team",
        targetId: team.id,
        description: `${c.user.name} deleted team "${team.name}"`,
      }),
      emitClubEvent(clubId, "team_deleted", { teamId: team.id }),
    ])

    return json({ ok: true })

  } catch (err: any) {
    console.error("[clubs/teams DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to delete team: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
