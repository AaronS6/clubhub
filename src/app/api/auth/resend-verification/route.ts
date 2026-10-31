import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { issueVerificationCode, sendVerificationEmail } from "@/lib/email-verification"
import { rateLimit, tooManyRequests } from "@/lib/rate-limit"

const schema = z.object({ email: z.string().email() })

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }
    const email = parsed.data.email.toLowerCase().trim()

    const user = await db.user.findUnique({ where: { email } })
    // Silent no-op for unknown/already-verified emails — the endpoint must
    // not let anyone probe which emails have ClubHub accounts.
    if (!user || user.emailVerified) {
      return NextResponse.json({ ok: true })
    }

    // Resend caps (per email, matching the no-IP-limit campus-NAT posture):
    // 1 / minute, 5 / hour — enough for a flaky inbox, useless for spamming.
    const perMinute = rateLimit(`resend:${email}`, 1, 60 * 1000)
    if (!perMinute.ok) return tooManyRequests(perMinute.retryAfterMs, "Code already sent")
    const perHour = rateLimit(`resend-hourly:${email}`, 5, 60 * 60 * 1000)
    if (!perHour.ok) return tooManyRequests(perHour.retryAfterMs, "Too many codes requested")

    const code = await issueVerificationCode(email)
    const result = await sendVerificationEmail(email, code)

    // Dev escape hatch (same policy as signup): no email transport locally →
    // surface the code so the flow is testable; production never leaks it.
    if (!result.ok && process.env.NODE_ENV !== "production") {
      console.log("[resend-verification] Dev-only — code for", email, "is", code)
      return NextResponse.json({ ok: true, emailSent: false, devCode: code })
    }
    return NextResponse.json({ ok: true, emailSent: result.ok })
  } catch (err: any) {
    console.error("[resend-verification] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Couldn't send the code — please try again" }, { status: 500 })
  }
}
