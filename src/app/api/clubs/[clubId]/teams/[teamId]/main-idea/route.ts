import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

const MAX_LENGTH = 280

/** PATCH /api/clubs/[clubId]/teams/[teamId]/main-idea — exec only. Sets the
 *  team-level "main idea" — what this team is contributing to the club's main
 *  goal. Empty string clears it (stored as null). Emits `team_updated` so the
 *  Tasks view + Teams view both invalidate. */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; teamId: string }> }) {
  const { clubId, teamId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can set the team main idea", 403)

  // Confirm the team belongs to this club.
  const team = await db.team.findFirst({ where: { id: teamId, clubId } })
  if (!team) return error("Team not found", 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { mainIdea } = body as { mainIdea?: string }

  if (typeof mainIdea !== "string") return error("mainIdea must be a string", 400)
  if (mainIdea.length > MAX_LENGTH)
    return error(`Team main idea must be ${MAX_LENGTH} characters or fewer`, 400)

  const trimmed = mainIdea.trim()
  const next = trimmed.length === 0 ? null : trimmed

  await db.team.update({ where: { id: team.id }, data: { mainIdea: next } })

  // Reuse the existing `team_updated` realtime type so every place that
  // already listens for team changes (Tasks view, Teams view, dashboard)
  // picks up the new value with no extra wiring.
  await emitClubEvent(clubId, "team_updated", { teamId: team.id })

  return json({ mainIdea: next })
}
