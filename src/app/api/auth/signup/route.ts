import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { hashPassword, isPasswordStrong } from "@/lib/auth"
import { notify } from "@/lib/activity"

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8),
})

// NOTE: no IP rate limit here by design. School networks NAT an entire campus
// to ONE public IP, so a signup cap per IP blocks the 6th+ student in an hour —
// real humans, not bots. Validation + the DB's unique-email constraint remain
// the guardrails.

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
    }
    const { name, email, password } = parsed.data
    if (!isPasswordStrong(password)) {
      return NextResponse.json({ error: "Password must be at least 8 chars with a letter and a number" }, { status: 400 })
    }
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 })
    }
    const hash = await hashPassword(password)
    const user = await db.user.create({
      data: { name, email: email.toLowerCase(), passwordHash: hash, emailVerified: true },
    })
    // notify is best-effort — don't let it break signup
    try {
      await notify({
        userId: user.id,
        type: "new_announcement",
        message: `Welcome to ClubHub, ${name}! Create or join a club to get started.`,
        linkUrl: "?view=clubs",
      })
    } catch (e) {
      console.error("[signup] notify failed (non-fatal):", e)
    }
    return NextResponse.json({ ok: true, userId: user.id })
  } catch (err: any) {
    console.error("[signup] error:", err?.message, err?.code, err?.meta)
    // Generic message — never echo internal error text to the client.
    return NextResponse.json({ error: "Signup failed — please try again" }, { status: 500 })
  }
}
