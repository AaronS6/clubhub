import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { hashPassword, isPasswordStrong } from "@/lib/auth"
import { issueVerificationCode, sendVerificationEmail } from "@/lib/email-verification"

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
    // emailVerified stays false — the account is gated until the user enters
    // the 6-digit code we're about to email them (Google signups skip this:
    // Google proves email ownership at sign-in and authOptions marks those
    // users verified directly).
    const user = await db.user.create({
      data: { name, email: email.toLowerCase(), passwordHash: hash, emailVerified: false },
    })

    // Issue + send the verification code. Best-effort: a failed send must
    // not 500 the signup — the user can hit "Resend code" on the verify
    // step (and the welcome notify moves to verify-email, post-verification).
    let emailSent = false
    try {
      const code = await issueVerificationCode(user.email)
      const result = await sendVerificationEmail(user.email, code)
      emailSent = result.ok
      // Dev escape hatch: with no email transport configured (local dev),
      // surface the code in the response so the flow is testable. Production
      // with Brevo/SendGrid configured sends for real and never leaks it.
      if (!result.ok && process.env.NODE_ENV !== "production") {
        console.log("[signup] Dev-only — verification code for", user.email, "is", code)
        return NextResponse.json({ ok: true, email: user.email, emailSent: false, devCode: code })
      }
    } catch (e) {
      console.error("[signup] verification email failed (non-fatal):", e)
    }
    return NextResponse.json({ ok: true, email: user.email, emailSent })
  } catch (err: any) {
    console.error("[signup] error:", err?.message, err?.code, err?.meta)
    // Generic message — never echo internal error text to the client.
    return NextResponse.json({ error: "Signup failed — please try again" }, { status: 500 })
  }
}
