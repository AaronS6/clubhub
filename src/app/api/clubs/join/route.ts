import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/server-auth"
import { verifyClubPassword } from "@/lib/club-crypto"
import { logActivity, notifyClub } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

const joinSchema = z.object({
  clubCode: z.string().min(4).max(10),
  clubPassword: z.string().min(1),
})

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  const parsed = joinSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid club code or password" }, { status: 400 })
  }
  const { clubCode, clubPassword } = parsed.data
  const club = await db.club.findUnique({ where: { clubCode: clubCode.toUpperCase() } })
  if (!club) return NextResponse.json({ error: "No club found with that code" }, { status: 404 })
  const ok = verifyClubPassword(clubPassword, club.clubPasswordEnc)
  if (!ok) return NextResponse.json({ error: "Wrong club password" }, { status: 400 })

  const existing = await db.clubMember.findUnique({
    where: { clubId_userId: { clubId: club.id, userId: user.id } },
  })
  if (existing && existing.status === "active") {
    return NextResponse.json({ error: "You are already a member of this club" }, { status: 409 })
  }
  if (existing && existing.status === "removed") {
    // re-activate
    await db.clubMember.update({ where: { id: existing.id }, data: { status: "active", role: "member" } })
  } else {
    await db.clubMember.create({ data: { clubId: club.id, userId: user.id, role: "member" } })
  }
  await logActivity({
    clubId: club.id,
    actorUserId: user.id,
    actionType: "new_member",
    targetType: "user",
    targetId: user.id,
    description: `${user.name} joined the club`,
  })
  await notifyClub({
    clubId: club.id,
    excludeUserId: user.id,
    type: "new_member",
    message: `${user.name} joined ${club.name}`,
    linkUrl: "?view=members",
  })
  await emitClubEvent(club.id, "new_member", { userId: user.id })
  return NextResponse.json({
    ok: true,
    club: { id: club.id, name: club.name, clubCode: club.clubCode, accentColor: club.accentColor, role: "member" },
  })
}
