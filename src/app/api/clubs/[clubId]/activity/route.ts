import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

/** Activity log retention window — entries older than this are pruned. */
const ACTIVITY_RETENTION_DAYS = 14

/**
 * Best-effort pruning of activity-log entries older than the retention window.
 * Never throws — callers don't await it (fire-and-forget). Returns the count
 * of deleted rows so callers can log if they want.
 */
export async function pruneOldActivity(clubId: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const result = await db.activityLog.deleteMany({
      where: { clubId, createdAt: { lt: cutoff } },
    })
    return result.count
  } catch (e) {
    console.error("[activity] pruneOldActivity failed:", e)
    return 0
  }
}

/**
 * GET /api/clubs/[clubId]/activity
 * Returns activity log entries (newest first), paginated with
 * `?page=&pageSize=50`. Supports filtering by `?actionType=`.
 *
 * Accessible to any active member of the club. Activity log entries describe
 * actions already visible to members via other endpoints (announcements,
 * tasks, meetings, hours submissions, role changes) — exposing the unified
 * feed here powers the dashboard "Recent activity" card without leaking
 * anything members can't already see elsewhere.
 *
 * Best-effort: prunes entries older than 14 days at the start of each GET.
 */
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // Best-effort prune of stale entries — don't await; never block the read.
    void pruneOldActivity(clubId)

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
    )
    const actionType = url.searchParams.get("actionType") || null

    const where = {
      clubId,
      ...(actionType ? { actionType } : {}),
    }

    const [items, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize + 1, // fetch one extra to determine hasMore
        include: {
          actor: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      db.activityLog.count({ where }),
    ])

    const hasMore = items.length > pageSize
    const trimmed = hasMore ? items.slice(0, pageSize) : items

    return json({
      items: trimmed.map((entry) => ({
        id: entry.id,
        actorUserId: entry.actorUserId,
        actorName: entry.actor.name,
        actorAvatarUrl: entry.actor.avatarUrl ?? null,
        actionType: entry.actionType,
        targetType: entry.targetType,
        targetId: entry.targetId,
        description: entry.description,
        createdAt: entry.createdAt,
      })),
      hasMore,
      total,
      page,
      pageSize,
    })
  } catch (e) {
    console.error("[activity] GET failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load activity log" },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/clubs/[clubId]/activity
 * Executive-only. Clears ALL activity log entries for the club. Useful when
 * rotating semesters / resetting the audit trail.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const result = await db.activityLog.deleteMany({ where: { clubId } })
    return json({ ok: true, deleted: result.count })
  } catch (e) {
    console.error("[activity] DELETE failed:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear activity log" },
      { status: 500 },
    )
  }
}
