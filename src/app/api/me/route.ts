import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getSessionUser, getSessionUserWithMemberships } from "@/lib/server-auth"
import { hashPassword, verifyPassword } from "@/lib/auth"

export async function GET() {
  try {
    // Bootstrap endpoint — gates the entire app's loading screen. Uses a single
    // db query (user + memberships via include) instead of 2 sequential calls.
    const user = await getSessionUserWithMemberships()
    if (!user) return NextResponse.json({ user: null, memberships: [] })
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      memberships: user.memberships.map((m) => ({
        clubId: m.club.id,
        clubName: m.club.name,
        logoUrl: m.club.logoUrl,
        accentColor: m.club.accentColor,
        clubCode: m.club.clubCode,
        role: m.role,
      })),
    })

  } catch (err: any) {
    console.error("[me GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load user: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().nullable().optional(),
})

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await req.json().catch(() => null)
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    await db.user.update({ where: { id: user.id }, data: parsed.data })
    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error("[me PATCH] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to update profile: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

const pwSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
})

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await req.json().catch(() => null)
    const parsed = pwSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    const { currentPassword, newPassword } = parsed.data
    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const ok = await verifyPassword(currentPassword, dbUser.passwordHash)
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
      return NextResponse.json({ error: "Password must contain a letter and a number" }, { status: 400 })
    }
    const hash = await hashPassword(newPassword)
    await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } })
    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error("[me PUT] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to change password: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
