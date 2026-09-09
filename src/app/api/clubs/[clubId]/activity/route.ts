import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

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
 */
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

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

  } catch (err: any) {
    console.error("[clubs/activity GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load activity: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
