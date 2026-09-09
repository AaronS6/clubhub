import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { sendEmail, renderEmailHtml, isEmailConfigured } from "@/lib/email"

const schema = z.object({
  email: z.string().email(),
})

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Generates a password-reset token, stores it in the VerificationToken table
 * (expires in 1 hour), and emails a reset link to the user.
 *
 * SECURITY: always returns `{ ok: true }` regardless of whether the email
 * exists — this prevents email enumeration. BUT if email SENDING fails, we
 * return the error reason so the user can diagnose the problem (wrong API
 * key, wrong EMAIL_FROM, etc.).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: true })
    }
    const email = parsed.data.email.toLowerCase().trim()

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      // Email doesn't exist — return ok anyway (anti-enumeration)
      return NextResponse.json({ ok: true })
    }

    // Generate a secure random token (32 bytes hex)
    const { randomBytes } = await import("crypto")
    const token = randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Delete any existing tokens for this email, then create the new one
    await db.verificationToken.deleteMany({ where: { identifier: email } })
    await db.verificationToken.create({
      data: { identifier: email, token, expires },
    })

    // Build the reset URL. NEXTAUTH_URL is the app's public base URL.
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
    const resetUrl = `${baseUrl}/?reset=${token}`

    // Check if email is configured
    if (!isEmailConfigured()) {
      console.error("[forgot-password] RESEND_API_KEY is NOT set. Email not sent.")
      console.error("[forgot-password] Reset URL (for manual testing):", resetUrl)
      return NextResponse.json({
        ok: true,
        error: "Email is not configured. Set RESEND_API_KEY in Render env vars.",
        resetUrl: resetUrl, // Include the URL so the user can test manually
      })
    }

    // Send the email — check the result!
    const result = await sendEmail({
      to: email,
      subject: "Reset your ClubHub password",
      html: renderEmailHtml({
        title: "Reset your password",
        preheader: "Click the link to set a new password.",
        bodyLines: [
          `Hi ${user.name},`,
          "We received a request to reset your ClubHub password. Click the button below to choose a new one.",
          "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.",
        ],
        ctaText: "Reset password",
        ctaUrl: resetUrl,
      }),
    })

    if (!result.ok) {
      console.error("[forgot-password] Email send FAILED:", result.reason)
      return NextResponse.json({
        ok: true,
        error: `Email failed to send: ${result.reason}`,
        resetUrl: resetUrl, // Include the URL so the user can test manually
      })
    }

    console.log("[forgot-password] Email sent successfully to:", email, "ID:", result.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[forgot-password] error:", err?.message)
    return NextResponse.json({ ok: true, error: err?.message || "Unknown error" })
  }
}
