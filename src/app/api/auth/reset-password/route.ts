import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 *
 * Verifies the reset token (must exist + not be expired), then updates the
 * user's password. Deletes the token after use (single-use).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid input"
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    const { token, password } = parsed.data

    // Validate password strength (same rules as signup)
    if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
      return NextResponse.json(
        { error: "Password must contain a letter and a number" },
        { status: 400 },
      )
    }

    // Find the token
    const resetToken = await db.verificationToken.findUnique({ where: { token } })
    if (!resetToken) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
    }
    if (resetToken.expires < new Date()) {
      // Clean up expired token
      await db.verificationToken.delete({ where: { id: resetToken.id } })
      return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 })
    }

    // Find the user by email (identifier)
    const user = await db.user.findUnique({ where: { email: resetToken.identifier } })
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 })
    }

    // Hash the new password + update the user
    const hash = await hashPassword(password)
    await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } })

    // Delete the token (single-use)
    await db.verificationToken.delete({ where: { id: resetToken.id } })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[reset-password] error:", err?.message)
    return NextResponse.json({ error: "Failed to reset password: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
