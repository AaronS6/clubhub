import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getSessionUser, error } from "@/lib/server-auth"
import { notifyClub } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * POST /api/join-requests
 *
 * A signed-in student sends a join request to ANY club. Body: { clubCode,
 * message? } — the club is resolved by code because the requester is NOT a
 * member, so the clubId-scoped endpoints (which use getClubContext) can't be
 * used here.
 *
 * Both join paths are ALWAYS available side by side:
 *   - students WITH the club code + password use POST /api/clubs/join
 *   - students WITHOUT the code send a join request here, and the club's
 *     executives approve or decline it from Members → Join requests
 *
 * Guards:
 *   - session required
 *   - requester must not already be an active member
 *   - at most one request per user per club (unique constraint); a previously
 *     REJECTED request can be re-sent (re-opens the row — people change,
 *     clubs change); an APPROVED request can't exist without the user
 *     already being a member, so that path is unreachable.
 *   - message capped at 280 chars
 *
 * On success the club's executives get a notification ("X requested to join
 * …") and a `join_request_created` realtime event so the Members view's
 * review queue refreshes instantly.
 */

const createSchema = z.object({
  clubCode: z.string().min(4).max(10),
  message: z.string().max(280).optional().nullable(),
})

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return error("Unauthorized", 401)

    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return error("Invalid club code or message", 400)
    }
    const clubCode = parsed.data.clubCode.trim().toUpperCase()
    const message = (parsed.data.message ?? "").trim() || null

    const club = await db.club.findUnique({
      where: { clubCode },
      select: { id: true, name: true, clubCode: true },
    })
    if (!club) return error("No club found with that code", 404)

    // Already a member? Nothing to request.
    const membership = await db.clubMember.findUnique({
      where: { clubId_userId: { clubId: club.id, userId: user.id } },
      select: { id: true, status: true },
    })
    if (membership && membership.status === "active") {
      return error("You are already a member of this club", 409)
    }
    // A removed member re-requesting is fine — they go back through review.

    const existing = await db.joinRequest.findUnique({
      where: { clubId_userId: { clubId: club.id, userId: user.id } },
      select: { id: true, status: true },
    })
    if (existing && existing.status === "pending") {
      return error("You already have a pending request for this club", 409)
    }

    // Create (first time) or re-open (after rejection) the request.
    if (existing) {
      await db.joinRequest.update({
        where: { id: existing.id },
        data: {
          status: "pending",
          message,
          createdAt: new Date(),
          reviewedAt: null,
          reviewedByUserId: null,
        },
      })
    } else {
      await db.joinRequest.create({
        data: { clubId: club.id, userId: user.id, message },
      })
    }

    // Tell the executives. notifyClub fans out to everyone; execs are the
    // ones who act on it, but members seeing "X asked to join" is honest.
    // Realtime event refreshes the exec review queue instantly.
    await notifyClub({
      clubId: club.id,
      excludeUserId: user.id,
      type: "join_request_pending",
      message: `${user.name} requested to join ${club.name}`,
      linkUrl: "?view=members",
    })
    await emitClubEvent(club.id, "join_request_created", { clubId: club.id })

    return NextResponse.json({
      ok: true,
      club: { id: club.id, name: club.name, clubCode: club.clubCode },
    })
  } catch (e) {
    console.error("[join-requests] POST failed:", e)
    return error(e instanceof Error ? e.message : "Failed to send join request", 500)
  }
}
