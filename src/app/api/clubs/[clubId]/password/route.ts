import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { decryptClubPassword, encryptClubPassword } from "@/lib/club-crypto"
import { logActivity } from "@/lib/activity"

/**
 * GET /api/clubs/[clubId]/password
 * Returns the DECRYPTED club join password. Executives only.
 * Members never receive this — the API refuses before serialization.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can view the club password", 403)
  const club = await db.club.findUnique({ where: { id: clubId }, select: { clubPasswordEnc: true } })
  if (!club) return error("Club not found", 404)
  try {
    const plaintext = decryptClubPassword(club.clubPasswordEnc)
    return json({ password: plaintext })
  } catch {
    return error("Could not decrypt club password", 500)
  }
}

const changeSchema = z.object({
  newPassword: z.string().min(4).max(60),
})

/**
 * PATCH /api/clubs/[clubId]/password
 * Sets a new club join password. Executives only. The old password immediately
 * stops working because we overwrite the encrypted value.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can change the club password", 403)
  const body = await req.json().catch(() => null)
  const parsed = changeSchema.safeParse(body)
  if (!parsed.success) return error("Password must be 4–60 characters", 400)
  const enc = encryptClubPassword(parsed.data.newPassword)
  await db.club.update({ where: { id: clubId }, data: { clubPasswordEnc: enc } })
  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "club_password_changed",
    targetType: "club",
    targetId: clubId,
    description: `${c.user.name} changed the club join password`,
  })
  return json({ ok: true })
}
