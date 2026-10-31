import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { notify } from "@/lib/activity"
import { consumeVerificationCode } from "@/lib/email-verification"
import { rateLimit, tooManyRequests } from "@/lib/rate-limit"

const schema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
})

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter the 6-digit code from your email" }, { status: 400 })
    }
    const email = parsed.data.email.toLowerCase().trim()
    const { code } = parsed.data

    // Brute-force cap: 12 attempts / 15 min per email. A wrong code is one
    // guess; 1M combinations at this rate is hopeless, and the 15-minute
    // code TTL resets the math anyway.
    const rl = rateLimit(`verify:${email}`, 12, 15 * 60 * 1000)
    if (!rl.ok) return tooManyRequests(rl.retryAfterMs, "Too many attempts")

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      // No account-existence leak — same shape as an invalid code.
      return NextResponse.json({ error: "That code didn't match — check your email and try again" }, { status: 400 })
    }
    if (user.emailVerified) {
      // Idempotent — verifying twice (double-submit, stale tab) is fine.
      return NextResponse.json({ ok: true, alreadyVerified: true })
    }

    const result = await consumeVerificationCode(email, code)
    if (result === "expired") {
      return NextResponse.json({ error: "That code has expired — send yourself a new one" }, { status: 400 })
    }
    if (result === "invalid") {
      return NextResponse.json({ error: "That code didn't match — check your email and try again" }, { status: 400 })
    }

    await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })

    // Welcome notify (moved here from signup — it belongs post-verification).
    // Best-effort: never fails the verification itself.
    try {
      await notify({
        userId: user.id,
        type: "new_announcement",
        message: `Welcome to ClubHub, ${user.name}! Create or join a club to get started.`,
        linkUrl: "?view=clubs",
      })
    } catch (e) {
      console.error("[verify-email] welcome notify failed (non-fatal):", e)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[verify-email] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Verification failed — please try again" }, { status: 500 })
  }
}
