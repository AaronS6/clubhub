import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * POST /api/clubs/[clubId]/announcements/[id]/restore
 * Executive only. Unsets `deletedAt` on a soft-deleted announcement so it
 * re-appears in the default feed.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can restore announcements", 403)

  const announcement = await db.announcement.findUnique({ where: { id } })
  if (!announcement || announcement.clubId !== clubId) {
    return error("Announcement not found", 404)
  }
  if (!announcement.deletedAt) {
    // Already restored — idempotent OK
    return json({ ok: true, alreadyRestored: true })
  }

  await db.announcement.update({
    where: { id },
    data: { deletedAt: null },
  })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "announcement_restored",
    targetType: "announcement",
    targetId: id,
    description: `${c.user.name} restored an announcement: "${announcement.title}"`,
  })

  await emitClubEvent(clubId, "announcement_updated", { announcementId: id, restored: true })

  return json({ ok: true })
}
