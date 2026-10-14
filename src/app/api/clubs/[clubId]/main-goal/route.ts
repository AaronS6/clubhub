import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

const MAX_LENGTH = 280

/** PATCH /api/clubs/[clubId]/main-goal — exec only. Sets the club-wide main goal
 *  shown at the top of the Tasks view. Empty string clears it (stored as null).
 *  Emits a `main_goal_updated` realtime:club event for instant cross-client sync. */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can set the main goal", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { mainGoal } = body as { mainGoal?: string }

  if (typeof mainGoal !== "string") return error("mainGoal must be a string", 400)
  if (mainGoal.length > MAX_LENGTH)
    return error(`Main goal must be ${MAX_LENGTH} characters or fewer`, 400)

  const trimmed = mainGoal.trim()
  // Empty string -> store as null so the empty-state UI kicks in cleanly.
  const next = trimmed.length === 0 ? null : trimmed

  await db.club.update({ where: { id: clubId }, data: { mainGoal: next } })

  // Realtime fan-out (best-effort). Members viewing the Tasks view invalidate
  // their cached `tasks` query (which we extend to include mainGoal) and re-render.
  await emitClubEvent(clubId, "main_goal_updated", {})

  return json({ mainGoal: next })
}
