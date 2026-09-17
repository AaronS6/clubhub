import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * DELETE /api/clubs/[clubId]/badges/[badgeId]
 *
 * Executive-only. Removes a badge from the club catalog. MemberBadge awards
 * cascade-delete via the schema's `onDelete: Cascade` on `Badge.awards`.
 * Best-effort side effects (activity log + realtime) are fanned out in
 * parallel — they must not block the response.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ clubId: string; badgeId: string }> }
) {
  const { clubId, badgeId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 403)

  // Fetch the badge first so we can include its name/emoji in the activity
  // log. The WHERE clause is scoped to (id, clubId) so a stray ID from
  // another club can't be deleted here.
  const badge = await db.badge.findUnique({
    where: { id: badgeId },
    select: { id: true, name: true, emoji: true, clubId: true },
  })
  if (!badge || badge.clubId !== clubId) {
    return error("Badge not found", 404)
  }

  // Cascade rule on the schema handles MemberBadge cleanup automatically.
  await db.badge.delete({ where: { id: badgeId } })

  await Promise.allSettled([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "badge_deleted",
      targetType: "badge",
      targetId: badgeId,
      description: `${c.user.name} deleted the "${badge.emoji} ${badge.name}" badge`,
    }),
    emitClubEvent(clubId, "badge_deleted", { badgeId }),
  ])

  return json({ ok: true })
}
