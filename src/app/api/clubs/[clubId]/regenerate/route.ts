import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { hashPassword, generateClubCode } from "@/lib/auth"
import { logActivity } from "@/lib/activity"

export async function POST(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can regenerate codes", 403)
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
