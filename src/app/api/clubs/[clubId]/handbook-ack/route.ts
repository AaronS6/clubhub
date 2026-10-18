import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/**
 * POST /api/clubs/[clubId]/handbook-ack
 *
 * Records the Executive Admin Handbook acknowledgment for this club —
 * stamped ONCE (idempotent: an existing timestamp is never overwritten).
 * Only an ACTIVE EXECUTIVE of the club may acknowledge it.
 *
 * This powers the "shown exactly once per club lifetime" guarantee: the
 * client shows the handbook popup while `club.handbookAcceptedAt` is null
 * and the viewer is an executive; acknowledging flips the flag, and the
 * popup never renders again for that club.
 *
 * Response: { handbookAcceptedAt: string }
 */
export async function POST(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") {
    return error("Only executives can acknowledge the handbook", 403)
  }

  const club = await db.club.findUnique({
    where: { id: clubId },
    select: { handbookAcceptedAt: true },
  })
  if (!club) return error("Club not found", 404)

  // Already acknowledged — return the existing stamp (idempotent).
  if (club.handbookAcceptedAt) {
    return json({ handbookAcceptedAt: club.handbookAcceptedAt.toISOString() })
  }

  const updated = await db.club.update({
    where: { id: clubId },
    data: { handbookAcceptedAt: new Date() },
    select: { handbookAcceptedAt: true },
  })
  return json({ handbookAcceptedAt: updated.handbookAcceptedAt!.toISOString() })
}
