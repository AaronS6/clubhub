import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { generateClubCode } from "@/lib/auth"
import { logActivity } from "@/lib/activity"

/**
 * POST /api/clubs/[clubId]/regenerate
 * Body: {}                → generate a fresh random 6-char code (classic behavior)
 *        { clubCode: "X" } → set a CUSTOM code chosen by the executive
 *
 * Custom codes are normalized (uppercased, non-alphanumerics stripped) and
 * validated: 4–10 chars, A–Z / 0–9 only (same length window the join route
 * accepts), globally unique. Returns friendly 409s for taken/same-as-current
 * so the dialog can surface exactly what went wrong.
 *
 * Regenerating/changing the code does NOT kick anyone out — existing members
 * keep their memberships; only future joiners need the new code.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can change the club code", 403)

  const body = await req.json().catch(() => ({}))

  // ── Custom code path ──────────────────────────────────────────────────────
  if (body && typeof body === "object" && typeof (body as any).clubCode === "string") {
    const requested = String((body as any).clubCode)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")

    if (requested.length < 4 || requested.length > 10) {
      return error("Custom codes are 4–10 letters and numbers (no spaces or symbols)", 400)
    }

    const current = await db.club.findUnique({
      where: { id: clubId },
      select: { clubCode: true },
    })
    if (!current) return error("Club not found", 404)
    if (current.clubCode === requested) {
      return error("That's already your club code", 409)
    }

    const taken = await db.club.findUnique({ where: { clubCode: requested }, select: { id: true } })
    if (taken) {
      return error(`"${requested}" is taken by another club — try a different one`, 409)
    }

    await db.club.update({ where: { id: clubId }, data: { clubCode: requested } })
    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "change_code",
      targetType: "club",
      targetId: clubId,
      description: `${c.user.name} set the club code to ${requested}`,
    })
    return json({ clubCode: requested })
  }

  // ── Random regeneration (classic) ────────────────────────────────────────
  let code = generateClubCode()
  let tries = 0
  while (await db.club.findUnique({ where: { clubCode: code } }) && tries < 10) {
    code = generateClubCode()
    tries++
  }
  await db.club.update({ where: { id: clubId }, data: { clubCode: code } })
  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "regenerate_code",
    targetType: "club",
    targetId: clubId,
    description: `${c.user.name} regenerated the club code`,
  })
  return json({ clubCode: code })
}
