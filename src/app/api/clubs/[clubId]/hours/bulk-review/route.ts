import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"
import { promises as fs } from "fs"
import path from "path"

async function deleteProofFile(proofUrl: string | null | undefined) {
  if (!proofUrl) return
  try {
    const rel = proofUrl.replace(/^\//, "")
    const fullPath = path.join(process.cwd(), "public", rel)
    await fs.unlink(fullPath)
  } catch {
    // ignore
  }
}

/**
 * POST /api/clubs/[clubId]/hours/bulk-review
 * Executive-only. Body: { hourIds: string[], status: "approved"|"rejected", reviewComment?: string }
 * Applies the review to every entry, deletes each proof file, notifies each submitter.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { hourIds, status, reviewComment } = body as any

  if (!Array.isArray(hourIds) || hourIds.length === 0) {
    return error("hourIds must be a non-empty array", 400)
  }
  if (hourIds.length > 200) return error("Too many entries in one bulk action (max 200)", 400)
  if (status !== "approved" && status !== "rejected") {
    return error("status must be 'approved' or 'rejected'", 400)
  }
  let comment: string | null = null
  if (reviewComment !== undefined && reviewComment !== null) {
    if (typeof reviewComment !== "string") return error("Invalid reviewComment", 400)
    if (reviewComment.length > 1000) return error("reviewComment too long (max 1000)", 400)
    comment = reviewComment.trim() || null
  }

  const entries = await db.serviceHour.findMany({
    where: { id: { in: hourIds }, clubId, status: "pending" },
    select: { id: true, userId: true, hours: true, proofFileUrl: true },
  })

  if (entries.length === 0) return error("No pending entries found for the given IDs", 404)

  // Update all in a single query
  await db.serviceHour.updateMany({
    where: { id: { in: entries.map((e) => e.id) } },
    data: {
      status,
      reviewComment: comment,
      reviewedBy: c.user.id,
      reviewedAt: new Date(),
    },
  })

  // Delete proof files + null out their URLs
  for (const e of entries) {
    await deleteProofFile(e.proofFileUrl)
  }
  await db.serviceHour.updateMany({
    where: { id: { in: entries.map((e) => e.id) }, proofFileUrl: { not: null } },
    data: { proofFileUrl: null },
  })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: status === "approved" ? "hours_approved" : "hours_rejected",
    targetType: "service_hour",
    description: `${c.user.name} bulk ${status} ${entries.length} service hour entr${entries.length === 1 ? "y" : "ies"}`,
  })

  // Notify each submitter (collapse by user — sum their approved/rejected hours)
  const userHours = new Map<string, number>()
  for (const e of entries) {
    userHours.set(e.userId, (userHours.get(e.userId) ?? 0) + e.hours)
  }
  for (const [userId, totalHours] of userHours) {
    await notify({
      userId,
      clubId,
      type: status === "approved" ? "hours_approved" : "hours_rejected",
      message:
        status === "approved"
          ? `${totalHours} of your service hour(s) were approved${comment ? `: ${comment}` : ""}`
          : `${totalHours} of your service hour(s) were rejected${comment ? `: ${comment}` : ""}`,
      linkUrl: "/?view=hours",
    })
  }

  await emitClubEvent(clubId, status === "approved" ? "hours_approved" : "hours_rejected", { hourIds: entries.map((e) => e.id) })

  return json({ ok: true, reviewed: entries.length })
}
