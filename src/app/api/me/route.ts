import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getSessionUser, getSessionUserWithMemberships } from "@/lib/server-auth"
import { hashPassword, verifyPassword } from "@/lib/auth"

export async function GET() {
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
      avatarDecoration: user.avatarDecoration ?? "none",
    },
    memberships: user.memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      logoUrl: m.club.logoUrl,
      accentColor: m.club.accentColor,
      clubCode: m.club.clubCode,
      role: m.role,
      // Executive Admin Handbook acknowledgment (null until an executive
      // confirms the handbook popup — shown once per club lifetime).
      handbookAcceptedAt: m.club.handbookAcceptedAt?.toISOString() ?? null,
    })),
  })
}

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  /** Must be one of the forms the app itself produces: a served image route
   *  (`/api/avatars/…`, `/api/club-images/…`), an external https avatar
   *  (Google sign-in), or a legacy inline data:image URL. Capped at 2KB so a
   *  hostile client can't stuff megabytes of junk into the DB row that every
   *  member-list / chat payload ships. */
  avatarUrl: z
    .string()
    .max(2048)
    .refine(
      (v) =>
        v.startsWith("/api/avatars/") ||
        v.startsWith("/api/club-images/") ||
        v.startsWith("https://") ||
        /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v),
      { message: "Invalid avatar URL" },
    )
    .nullable()
    .optional(),
  /** Discord-style decorative frame id — validated against the known set. */
  avatarDecoration: z
    .enum(["none", "ring", "aura", "sparkles", "orbit", "petals", "glitch", "sunset", "aurora", "halo"])
    .optional(),
})

export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }
  await db.user.update({ where: { id: user.id }, data: parsed.data })
  return NextResponse.json({ ok: true })
}

const pwSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8),
})

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await req.json().catch(() => null)
    const parsed = pwSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
    }
    const { currentPassword, newPassword } = parsed.data

    // ⚠️ SECURITY: EVERYONE who already has a password must confirm it before
    // changing it — including executives. The old "execs skip the current
    // password" rule meant a stolen exec session could silently take over the
    // account (attacker swaps the password; the real owner is locked out).
    // The ONLY exception: accounts with no local password yet (Google
    // sign-in) setting their first one — there's no secret to confirm.
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    })
    if (!dbUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (dbUser.passwordHash) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 })
      }
      const ok = await verifyPassword(currentPassword, dbUser.passwordHash)
      if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
      return NextResponse.json({ error: "Password must contain a letter and a number" }, { status: 400 })
    }
    const hash = await hashPassword(newPassword)
    await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[me PUT] error:", err?.message)
    return NextResponse.json({ error: "Failed to change password — please try again" }, { status: 500 })
  }
}
