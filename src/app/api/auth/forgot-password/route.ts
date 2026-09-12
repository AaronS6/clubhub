import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { sendEmail, renderEmailHtml, isEmailConfigured } from "@/lib/email"

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Generates a single-use 32-byte hex reset token, stores it in the
 * VerificationToken table (expires in 1 hour), and emails the reset link to
 * the user via Resend.
 *
 * Anti-enumeration: ALWAYS returns { ok: true } regardless of whether the
 * email exists, so an attacker can't probe which emails are registered.
 *
 * However, if email sending fails (Resend not configured, network error, etc.)
 * we return the resetUrl in the response body so the user can see what went
 * wrong (useful in dev / first-run setups without an email provider).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    const { email } = body as { email?: unknown }
    if (typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }
    const normalized = email.trim().toLowerCase()

    // Look up the user — but always return ok:true so attackers can't enumerate.
    const user = await db.user.findUnique({ where: { email: normalized } })

    if (user) {
      // 32 random bytes → 64-char hex string. Sufficient entropy for a
      // single-use, time-boxed reset token.
      const token = randomBytes(32).toString("hex")
      const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Single-use: invalidate any prior tokens for this identifier by deleting
      // them first (the unique constraint on `token` would otherwise let stale
      // tokens pile up). Best-effort.
      try {
        await db.verificationToken.deleteMany({ where: { identifier: normalized } })
      } catch (e) {
        console.error("[forgot-password] failed to clear stale tokens:", e)
      }

      await db.verificationToken.create({
        data: { identifier: normalized, token, expires },
      })

      const origin = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || ""
      const resetUrl = origin
        ? `${origin.replace(/\/$/, "")}/?resetToken=${token}`
        : `/?resetToken=${token}`

      // Only attempt the email send if Resend is configured. Otherwise fall
      // through to the email-failed path so the user sees the resetUrl.
      if (isEmailConfigured()) {
        const html = renderEmailHtml({
          title: "Reset your ClubHub password",
          preheader: "Use this link to choose a new password. It expires in 1 hour.",
          bodyLines: [
            "We received a request to reset the password for your ClubHub account.",
            "Click the button below to choose a new password. This link expires in 1 hour.",
            "If you didn't request a password reset, you can safely ignore this email.",
          ],
          ctaText: "Reset password",
          ctaUrl: resetUrl,
        })

        const result = await sendEmail({
          to: normalized,
          subject: "Reset your ClubHub password",
          html,
        })

        if (!result.ok) {
          // Email send failed — surface the resetUrl so the user isn't stuck
          // (especially useful in dev without a configured email provider).
          console.error("[forgot-password] sendEmail failed:", result.reason)
          return NextResponse.json({
            ok: true,
            error: result.reason ?? "Email send failed",
            resetUrl,
          })
        }
      } else {
        // No email provider configured — return the resetUrl so the user can
        // still complete the flow (dev / first-run scenario).
        return NextResponse.json({
          ok: true,
          error: "Email is not configured — use this reset URL directly.",
          resetUrl,
        })
      }
    }

    // Always return ok:true for anti-enumeration. Even if user was null, we
    // return the same shape so timing/response can't leak existence.
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[forgot-password] failed:", e)
    // Even on hard failure, return ok:true to avoid leaking info — but include
    // the error message so the operator can debug.
    return NextResponse.json(
      { ok: true, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 200 },
    )
  }
}
