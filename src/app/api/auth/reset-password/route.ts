import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPassword, isPasswordStrong } from "@/lib/auth"
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit"

// 10 attempts per IP per 15 min — the token itself is 256-bit entropy so
// brute-forcing is hopeless; this just stops a script from hammering the
// endpoint (log noise + bcrypt CPU burn).
const RESET_LIMIT = 10
const RESET_WINDOW = 15 * 60_000

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 *
 * Verifies the reset token exists + isn't expired, updates the user's
 * password, then deletes the token (single-use). Password must be 8+ chars
 * with at least one letter and one number.
 *
 * The token maps to a `VerificationToken` row whose `identifier` is the
 * user's email (lowercased). We look up the user by that email.
 */
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`reset:ip:${getClientIp(req)}`, RESET_LIMIT, RESET_WINDOW)
    if (!rl.ok) return tooManyRequests(rl.retryAfterMs)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
    const { token, password } = body as { token?: unknown; password?: unknown }

    if (typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }
    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 })
    }
    if (!isPasswordStrong(password)) {
      return NextResponse.json(
        { error: "Password must be at least 8 chars with a letter and a number" },
        { status: 400 },
      )
    }

    // Find the token — must exist + not be expired.
    const vt = await db.verificationToken.findUnique({ where: { token } })
    if (!vt) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 })
    }
    if (vt.expires.getTime() < Date.now()) {
      // Clean up the expired token; reject the request.
      try {
        await db.verificationToken.delete({ where: { id: vt.id } })
      } catch {
        // ignore
      }
      return NextResponse.json({ error: "Reset token has expired" }, { status: 400 })
    }

    // The identifier is the user's email (lowercased, per forgot-password).
    const user = await db.user.findUnique({ where: { email: vt.identifier } })
    if (!user) {
      // Token is valid but no user — clean it up + reject.
      try {
        await db.verificationToken.delete({ where: { id: vt.id } })
      } catch {
        // ignore
      }
      return NextResponse.json({ error: "Invalid reset token" }, { status: 400 })
    }

    // Update the password + delete the token (single-use enforcement).
    const newHash = await hashPassword(password)
    await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash } })
    try {
      await db.verificationToken.delete({ where: { id: vt.id } })
    } catch (e) {
      console.error("[reset-password] failed to delete used token:", e)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[reset-password] failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to reset password" },
      { status: 500 },
    )
  }
}
