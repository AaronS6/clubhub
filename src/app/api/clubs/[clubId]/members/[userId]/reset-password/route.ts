import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"

/**
 * POST /api/clubs/[clubId]/members/[userId]/reset-password
 * Executive-only. Generates a password-reset token for the specified member
 * and returns the reset URL (no email sent — the exec copies the link and
 * sends it to the member manually via chat/text/etc).
 *
 * This is the "no email service" alternative to the forgot-password flow.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ clubId: string; userId: string }> }) {
  try {
    const { clubId, userId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    // Find the member in this club
    const member = await db.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!member || member.status !== "active") {
      return error("Member not found", 404)
    }

    // Generate a secure random token (32 bytes hex)
    const token = randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Delete any existing tokens for this email, then create the new one
    await db.verificationToken.deleteMany({ where: { identifier: member.user.email } })
    await db.verificationToken.create({
      data: { identifier: member.user.email, token, expires },
    })

    // Build the reset URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000"
    const resetUrl = `${baseUrl}/?reset=${token}`

    // Log the action
    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "password_reset_generated",
      targetType: "user",
      targetId: userId,
      description: `${c.user.name} generated a password reset link for ${member.user.name}`,
    })

    return json({ resetUrl, memberName: member.user.name })
  } catch (err: any) {
    console.error("[admin reset-password] error:", err?.message)
    return NextResponse.json({ error: "Failed to generate reset link: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
