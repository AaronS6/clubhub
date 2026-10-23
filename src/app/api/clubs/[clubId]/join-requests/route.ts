import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"

/**
 * GET /api/clubs/[clubId]/join-requests
 *
 * Executive-only review queue for approval-based joining. Returns:
 *   { myRole, pending: ReqItem[], reviewed: ReqItem[] }
 *
 *   pending  — status "pending", newest first (these need action)
 *   reviewed — status "approved" | "rejected", newest reviewed first, capped
 *              at 20 (recent history for context; the full audit trail lives
 *              in the activity log)
 *
 * ReqItem = { id, message, status, createdAt, reviewedAt, user: { id, name,
 * avatarUrl, avatarDecoration } }. Pending requests NEVER include anything
 * the student hasn't chosen to share — just their public profile + their
 * note (avatar decoration is part of the public profile, like the avatar).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const select = {
      id: true,
      message: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      user: { select: { id: true, name: true, avatarUrl: true, avatarDecoration: true } },
    } as const

    const [pending, reviewed] = await Promise.all([
      db.joinRequest.findMany({
        where: { clubId, status: "pending" },
        select,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.joinRequest.findMany({
        where: { clubId, status: { in: ["approved", "rejected"] } },
        select,
        orderBy: { reviewedAt: "desc" },
        take: 20,
      }),
    ])

    return NextResponse.json({
      myRole: c.membership.role,
      pending,
      reviewed,
    })
  } catch (e) {
    console.error("[join-requests] GET failed:", e)
    return error(e instanceof Error ? e.message : "Failed to load join requests", 500)
  }
}
