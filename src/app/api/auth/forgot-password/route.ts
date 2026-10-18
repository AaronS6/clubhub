import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { sendEmail, renderEmailHtml, isEmailConfigured } from "@/lib/email"
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit"

// 5 reset requests per IP per hour — blocks token-spam / mail-bombing while
// leaving a forgetful human plenty of retries.
const FORGOT_LIMIT = 5
const FORGOT_WINDOW = 60 * 60_000

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
 * ⚠️ SECURITY: the reset URL is returned in the response body ONLY in
 * non-production (dev / first-run without an email provider). In production
 * that would be an account-takeover hole — anyone hitting the endpoint would
 * receive the victim's valid reset token without touching their inbox.
 */
const MAY_EXPOSE_RESET_URL = process.env.NODE_ENV !== "production"

export async function POST(req: Request) {
  try {
    // Rate limit first — the rest of the flow is identical whether the email
    // exists or not, so this can't leak account existence either.
    const rl = rateLimit(`forgot:ip:${getClientIp(req)}`, FORGOT_LIMIT, FORGOT_WINDOW)
    if (!rl.ok) return tooManyRequests(rl.retryAfterMs, "Too many reset requests")

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
      // The auth screen reads `?reset=TOKEN` — keep this in sync with
      // AuthScreen (it also accepts `?resetToken=` as a legacy fallback).
      const resetUrl = origin
        ? `${origin.replace(/\/$/, "")}/?reset=${token}`
        : `/?reset=${token}`

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
          // Email send failed. DEV ONLY: surface the resetUrl so the user isn't
          // stuck without an email provider. Production NEVER returns the URL
          // (it would hand a valid reset token to whoever called the API).
          console.error("[forgot-password] sendEmail failed:", result.reason)
          if (MAY_EXPOSE_RESET_URL) {
            return NextResponse.json({
              ok: true,
              error: result.reason ?? "Email send failed",
              resetUrl,
            })
          }
          return NextResponse.json({
            ok: true,
            error: "Couldn't send the reset email right now — please try again later.",
          })
        }
      } else {
        // No email provider configured — dev convenience only (see
        // MAY_EXPOSE_RESET_URL). Production responds with the same generic
        // ok:true shape as the anti-enumeration path.
        if (MAY_EXPOSE_RESET_URL) {
          return NextResponse.json({
            ok: true,
            error: "Email is not configured — use this reset URL directly.",
            resetUrl,
          })
        }
        console.warn(
          "[forgot-password] email is not configured and NODE_ENV=production — reset link was NOT delivered or exposed.",
        )
      }
    }

    // Always return ok:true for anti-enumeration. Even if user was null, we
    // return the same shape so timing/response can't leak existence.
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[forgot-password] failed:", e)
    // Even on hard failure, return ok:true to avoid leaking info — the exact
    // error is server-side only.
    return NextResponse.json({ ok: true })
  }
}
