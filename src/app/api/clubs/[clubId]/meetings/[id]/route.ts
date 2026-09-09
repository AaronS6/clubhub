import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notifyClub } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().min(1).max(200).optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  teamId: z.string().optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.enum(["weekly", "biweekly", "monthly"]).optional().nullable(),
})

/** PATCH /api/clubs/[clubId]/meetings/[id] — exec only. Update fields of a single meeting. */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Only executives can edit meetings", 403)

    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return error(parsed.error.issues[0]?.message ?? "Invalid input", 400)
    }
    const meeting = await db.meeting.findUnique({ where: { id }, select: { clubId: true } })
    if (!meeting || meeting.clubId !== clubId) return error("Meeting not found", 404)

    const data: Record<string, unknown> = {}
    const v = parsed.data
    if (v.title !== undefined) data.title = v.title
    if (v.description !== undefined) data.description = v.description
    if (v.location !== undefined) data.location = v.location
    if (v.teamId !== undefined) data.teamId = v.teamId || null
    if (v.isRecurring !== undefined) data.isRecurring = v.isRecurring
    if (v.recurrenceRule !== undefined) data.recurrenceRule = v.recurrenceRule

    if (v.startTime !== undefined) {
      const s = new Date(v.startTime)
      if (isNaN(s.getTime())) return error("Invalid startTime", 400)
      data.startTime = s
    }
    if (v.endTime !== undefined) {
      const e = new Date(v.endTime)
      if (isNaN(e.getTime())) return error("Invalid endTime", 400)
      data.endTime = e
    }
    if (data.startTime && data.endTime && (data.endTime as Date) <= (data.startTime as Date)) {
      return error("End time must be after start time", 400)
    }
    if (Object.keys(data).length === 0) return error("No valid fields to update", 400)

    // Validate team if provided
    if (typeof data.teamId === "string" && data.teamId) {
      const team = await db.team.findUnique({ where: { id: data.teamId as string }, select: { clubId: true } })
      if (!team || team.clubId !== clubId) return error("Invalid team", 400)
    }

    const updated = await db.meeting.update({
      where: { id },
      data,
      select: { id: true, title: true, startTime: true, endTime: true, location: true },
    })

    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "meeting_updated",
        targetType: "meeting",
        targetId: id,
        description: `${c.user.name} updated meeting "${updated.title}"`,
      }),
      emitClubEvent(clubId, "meeting_updated", { meetingId: id }),
    ])
    return json({ meeting: updated })

  } catch (err: any) {
    console.error("[clubs/meetings PATCH] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to update meeting: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

/** DELETE /api/clubs/[clubId]/meetings/[id] — exec only. Soft-cancel.
 *  Supports ?scope=series to cancel all non-cancelled meetings in the club
 *  with the same title + recurrenceRule + createdById + teamId. */
export async function DELETE(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Only executives can cancel meetings", 403)

    const url = new URL(req.url)
    const scope = url.searchParams.get("scope")

    const meeting = await db.meeting.findUnique({
      where: { id },
      select: { id: true, clubId: true, title: true, recurrenceRule: true, isRecurring: true, createdById: true, teamId: true, cancelledAt: true },
    })
    if (!meeting || meeting.clubId !== clubId) return error("Meeting not found", 404)

    const now = new Date()
    let cancelledIds: string[] = []

    if (scope === "series" && meeting.isRecurring && meeting.recurrenceRule) {
      // Cancel all non-cancelled meetings in the club with same title + rule + creator + team.
      const siblings = await db.meeting.findMany({
        where: {
          clubId,
          title: meeting.title,
          recurrenceRule: meeting.recurrenceRule,
          createdById: meeting.createdById,
          teamId: meeting.teamId,
          cancelledAt: null,
        },
        select: { id: true },
      })
      cancelledIds = siblings.map((m) => m.id)
      if (cancelledIds.length > 0) {
        await db.meeting.updateMany({
          where: { id: { in: cancelledIds } },
          data: { cancelledAt: now },
        })
      }
    } else {
      if (meeting.cancelledAt) return error("Meeting already cancelled", 400)
      await db.meeting.update({ where: { id }, data: { cancelledAt: now } })
      cancelledIds = [id]
    }

    // logActivity + notifyClub + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "meeting_cancelled",
        targetType: "meeting",
        targetId: id,
        description: `${c.user.name} cancelled meeting "${meeting.title}"${scope === "series" ? " (whole series)" : ""}`,
      }),
      notifyClub({
        clubId,
        excludeUserId: c.user.id,
        type: "meeting_cancelled",
        message: `Meeting "${meeting.title}" was cancelled${scope === "series" ? " (whole series)" : ""}`,
        linkUrl: `/?view=meetings`,
      }),
      emitClubEvent(clubId, "meeting_cancelled", { meetingIds: cancelledIds, scope: scope === "series" ? "series" : "single" }),
    ])

    return json({ ok: true, cancelledIds, scope: scope === "series" ? "series" : "single" })

  } catch (err: any) {
    console.error("[clubs/meetings DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to delete meeting: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
