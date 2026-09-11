import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"
import { promises as fs } from "fs"
import path from "path"

/** Delete a proof file from disk given its public URL. Best-effort. */
async function deleteProofFile(proofUrl: string | null | undefined) {
  if (!proofUrl) return
  try {
    const rel = proofUrl.replace(/^\//, "")
    const fullPath = path.join(process.cwd(), "public", rel)
    await fs.unlink(fullPath)
  } catch {
    // ignore — file may already be gone
  }
}

/**
 * PATCH /api/clubs/[clubId]/hours/[hourId]
 * Executive-only. Body: { status: "approved"|"rejected", reviewComment?: string }
 * Sets reviewedBy / reviewedAt / reviewComment, deletes the proof file from disk,
 * notifies the submitter, logs activity.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; hourId: string }> }) {
  const { clubId, hourId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { status, reviewComment } = body as any
  if (status !== "approved" && status !== "rejected") {
    return error("status must be 'approved' or 'rejected'", 400)
  }
  let comment: string | null = null
  if (reviewComment !== undefined && reviewComment !== null) {
    if (typeof reviewComment !== "string") return error("Invalid reviewComment", 400)
    if (reviewComment.length > 1000) return error("reviewComment too long (max 1000)", 400)
    comment = reviewComment.trim() || null
  }

  const entry = await db.serviceHour.findUnique({ where: { id: hourId, clubId } })
  if (!entry) return error("Entry not found", 404)
  if (entry.status !== "pending") return error("Entry has already been reviewed", 400)

  // Single update covers both the review fields AND nulling out proofFileUrl —
  // previously this was two sequential update calls on the same row.
  const updated = await db.serviceHour.update({
    where: { id: hourId },
    data: {
      status,
      reviewComment: comment,
      reviewedBy: c.user.id,
      reviewedAt: new Date(),
      ...(entry.proofFileUrl ? { proofFileUrl: null } : {}),
    },
    include: {
      category: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
    },
  })

  // Best-effort proof-file deletion runs in parallel with the side-effects wave
  // (logActivity + notify + emitClubEvent) — it reads from `entry.proofFileUrl`
  // in memory and doesn't depend on the DB row.
  await Promise.all([
    deleteProofFile(entry.proofFileUrl),
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: status === "approved" ? "hours_approved" : "hours_rejected",
      targetType: "service_hour",
      targetId: hourId,
      description: `${c.user.name} ${status} ${entry.hours} service hour(s) submitted by ${updated.user?.name ?? "a member"}`,
    }),
    notify({
      userId: entry.userId,
      clubId,
      type: status === "approved" ? "hours_approved" : "hours_rejected",
      message:
        status === "approved"
          ? `Your ${entry.hours} service hour(s) were approved${comment ? `: ${comment}` : ""}`
          : `Your ${entry.hours} service hour(s) were rejected${comment ? `: ${comment}` : ""}`,
      linkUrl: "/?view=hours",
    }),
    emitClubEvent(clubId, status === "approved" ? "hours_approved" : "hours_rejected", { hourId }),
  ])

  return json({ entry: updated })
}

/**
 * DELETE /api/clubs/[clubId]/hours/[hourId]
 * - Members: delete their own PENDING entry (and its proof file).
 * - Executives: delete any entry (and its proof file).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; hourId: string }> }) {
  const { clubId, hourId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const entry = await db.serviceHour.findUnique({ where: { id: hourId, clubId } })
  if (!entry) return error("Entry not found", 404)

  const isExec = c.membership.role === "executive"
  if (!isExec && entry.userId !== c.user.id) {
    return error("Not authorized to delete this entry", 403)
  }
  if (!isExec && entry.status !== "pending") {
    return error("You can only delete pending entries", 400)
  }

  // deleteProofFile reads entry.proofFileUrl in memory; the DB row delete is
  // independent of the file unlink. Fan them out in parallel.
  await Promise.all([
    deleteProofFile(entry.proofFileUrl),
    db.serviceHour.delete({ where: { id: hourId } }),
  ])

  // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
  await Promise.all([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "hours_deleted",
      targetType: "service_hour",
      targetId: hourId,
      description: `${c.user.name} deleted a ${entry.status} service hours entry (${entry.hours}h)`,
    }),
    emitClubEvent(clubId, "hours_submitted", { hourId }),
  ])

  return json({ ok: true })
}
