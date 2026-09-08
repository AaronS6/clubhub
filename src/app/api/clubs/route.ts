import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/server-auth"
import { hashPassword, generateClubCode } from "@/lib/auth"
import { encryptClubPassword } from "@/lib/club-crypto"
import { logActivity, notify } from "@/lib/activity"

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#16a34a"),
  clubPassword: z.string().min(4).max(60),
})

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { name, description, accentColor, clubPassword } = parsed.data
  let code = generateClubCode()
  let tries = 0
  while (await db.club.findUnique({ where: { clubCode: code } }) && tries < 10) {
    code = generateClubCode()
    tries++
  }
  const enc = encryptClubPassword(clubPassword)
  const club = await db.club.create({
    data: {
      name,
      description,
      accentColor,
      clubCode: code,
      clubPasswordEnc: enc,
      createdBy: user.id,
      members: { create: { userId: user.id, role: "executive" } },
    },
  })
  await logActivity({
    clubId: club.id,
    actorUserId: user.id,
    actionType: "club_created",
    targetType: "club",
    targetId: club.id,
    description: `${user.name} created the club "${name}"`,
  })
  return NextResponse.json({
    ok: true,
    club: { id: club.id, name: club.name, clubCode: club.clubCode, accentColor: club.accentColor, role: "executive" },
  })
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ clubs: [] })
  const memberships = await db.clubMember.findMany({
    where: { userId: user.id, status: "active" },
    include: {
      club: { select: { id: true, name: true, logoUrl: true, accentColor: true, clubCode: true, description: true } },
    },
    orderBy: { joinedAt: "asc" },
  })
  return NextResponse.json({
    clubs: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      logoUrl: m.club.logoUrl,
      accentColor: m.club.accentColor,
      clubCode: m.club.clubCode,
      description: m.club.description,
      role: m.role,
    })),
  })
}
