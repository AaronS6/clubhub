import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/my-goal
 * Returns the current user's personal service-hours goal for this club plus
 * the club-wide goal (for context) and the user's role. Used by the
 * introduction tour's goal step to prefill the picker, and by the hours
 * view if we ever surface inline goal editing.
 *
 * Response: { personalGoal: number, clubGoal: number, role: "member" | "executive" }
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const [membership, club] = await Promise.all([
    db.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId: c.user.id } },
      select: { personalHoursGoal: true, role: true },
    }),
    db.club.findUnique({ where: { id: clubId }, select: { hoursGoal: true } }),
  ])
  if (!membership || !club) return error("Club not found", 404)

  return json({
    personalGoal: membership.personalHoursGoal ?? 0,
    clubGoal: club.hoursGoal ?? 0,
    role: membership.role as "member" | "executive",
  })
}

/**
 * PATCH /api/clubs/[clubId]/my-goal
 * Sets the current user's PERSONAL service-hours goal for this club.
 * Any active member can set their own goal (this is intentionally NOT
 * exec-gated — a personal goal is the member's own commitment).
 *
 * Body: { goal: number }  (0 – 10000, 0 = no personal goal)
 * Response: { goal: number }
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const body = await req.json().catch(() => null)
  const goal = body?.goal
  if (typeof goal !== "number" || !isFinite(goal) || goal < 0 || goal > 10000) {
    return error("Goal must be a number between 0 and 10000 hours", 400)
  }

  const updated = await db.clubMember.update({
    where: { clubId_userId: { clubId, userId: c.user.id } },
    data: { personalHoursGoal: goal },
    select: { personalHoursGoal: true },
  })
  return json({ goal: updated.personalHoursGoal })
}
