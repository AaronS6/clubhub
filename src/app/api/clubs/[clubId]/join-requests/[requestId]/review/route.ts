import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getClubContext, error } from "@/lib/server-auth"
import { logActivity, notify, notifyClub } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * POST /api/clubs/[clubId]/join-requests/[requestId]/review
 * JSON { action: "approve" | "reject" }
 *
 * Executive-only decision on a pending join request.
 *
 * approve:
 *   - creates (or re-activates) the requester's ClubMember row as an active
 *     "member" — exactly the same state the code+password flow produces
 *   - marks the request approved (reviewer + timestamp)
 *   - activity log + "new_member" notification to the club (same as the
 *     classic join), plus a personal "join_request_approved" notification
 *     to the requester
 *   - emits `new_member` + `join_request_reviewed` realtime events
 *
 * reject:
 *   - marks the request rejected (the student can re-send it later)
 *   - personal "join_request_rejected" notification to the requester
 *   - activity log entry + `join_request_reviewed` realtime event
 *
 * Idempotency: reviewing a request that is no longer "pending" returns 409
 * so two execs clicking at once can't double-create memberships.
 */

const reviewSchema = z.object({ action: z.enum(["approve", "reject"]) })

export async function POST(
  req: Request,
  ctx: { params: Promise<{ clubId: string; requestId: string }> },
) {
  try {
    const { clubId, requestId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const body = await req.json().catch(() => null)
    const parsed = reviewSchema.safeParse(body)
    if (!parsed.success) return error('action must be "approve" or "reject"', 400)
    const action = parsed.data.action

    const request = await db.joinRequest.findUnique({
      where: { id: requestId },
      select: { id: true, clubId: true, userId: true, status: true },
    })
    if (!request || request.clubId !== clubId) {
      return error("Join request not found", 404)
    }
    if (request.status !== "pending") {
      return error(`This request was already ${request.status}`, 409)
    }

    const club = await db.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true },
    })
    if (!club) return error("Club not found", 404)

    const requester = await db.user.findUnique({
      where: { id: request.userId },
      select: { id: true, name: true },
    })
    if (!requester) return error("Requesting user no longer exists", 404)

    if (action === "approve") {
      // Create or re-activate the membership — identical end state to the
      // code+password join flow (role "member", status "active").
      const membership = await db.clubMember.findUnique({
        where: { clubId_userId: { clubId, userId: request.userId } },
        select: { id: true, status: true },
      })
      if (membership && membership.status === "active") {
        // Race: they got in another way (e.g. an exec used the password flow
        // for them). Just mark the request approved — nothing else to do.
        await db.joinRequest.update({
          where: { id: requestId },
          data: { status: "approved", reviewedAt: new Date(), reviewedByUserId: c.user.id },
        })
        return NextResponse.json({ ok: true, status: "approved", alreadyMember: true })
      }
      if (membership) {
        await db.clubMember.update({
          where: { id: membership.id },
          data: { status: "active", role: "member" },
        })
      } else {
        await db.clubMember.create({
          data: { clubId, userId: request.userId, role: "member" },
        })
      }

      await db.joinRequest.update({
        where: { id: requestId },
        data: { status: "approved", reviewedAt: new Date(), reviewedByUserId: c.user.id },
      })

      await logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "new_member",
        targetType: "user",
        targetId: request.userId,
        description: `${requester.name} joined the club (request approved)`,
      })

      // Notify the club (mirrors the classic join) + the requester.
      await notifyClub({
        clubId,
        excludeUserId: request.userId,
        type: "new_member",
        message: `${requester.name} joined ${club.name}`,
        linkUrl: "?view=members",
      })
      await notify({
        userId: request.userId,
        clubId,
        type: "join_request_approved",
        message: `Your request to join ${club.name} was approved — welcome!`,
        linkUrl: "?view=dashboard",
      })

      await emitClubEvent(clubId, "new_member", { userId: request.userId })
      await emitClubEvent(clubId, "join_request_reviewed", { clubId })

      return NextResponse.json({ ok: true, status: "approved" })
    }

    // ── reject ──
    await db.joinRequest.update({
      where: { id: requestId },
      data: { status: "rejected", reviewedAt: new Date(), reviewedByUserId: c.user.id },
    })

    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "join_request_rejected",
      targetType: "user",
      targetId: request.userId,
      description: `Join request from ${requester.name} declined`,
    })

    await notify({
      userId: request.userId,
      clubId,
      type: "join_request_rejected",
      message: `Your request to join ${club.name} was declined`,
      linkUrl: "?view=dashboard",
    })

    await emitClubEvent(clubId, "join_request_reviewed", { clubId })

    return NextResponse.json({ ok: true, status: "rejected" })
  } catch (e) {
    console.error("[join-requests/review] POST failed:", e)
    return error(e instanceof Error ? e.message : "Failed to review join request", 500)
  }
}
