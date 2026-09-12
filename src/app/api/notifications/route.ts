import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * DELETE /api/notifications
 *
 * Permanently deletes ALL of the current user's notifications (both read
 * and unread). Used by the bell dropdown's "Clear all" button — distinct
 * from POST /api/notifications/read-all which only flips `isRead` to true.
 *
 * Returns `{ ok: true, deleted: <count> }` where `deleted` is the number of
 * rows actually removed (handy for toasts / analytics).
 *
 * Auth: requires a valid session (`getSessionUser`). A user can only ever
 * clear their own notifications — the `where` clause is always scoped to
 * their `userId`, so even a malformed request body cannot affect others.
 */
export async function DELETE() {
  try {
    const user = await getSessionUser()
    if (!user) return error("Unauthorized", 401)

    const result = await db.notification.deleteMany({
      where: { userId: user.id },
    })

    return json({ ok: true, deleted: result.count })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to clear notifications"
    return error(message, 500)
  }
}

/**
 * GET /api/notifications
 *
 * Returns the current user's notifications, newest first.
 *
 * Query params (all optional):
 *   - page       default 1
 *   - pageSize   default 50, capped at 200
 *   - filter     "all" (default) | "unread"
 *   - type       filter by a specific notification type (e.g. `task_assigned`)
 *
 * Response shape:
 *   { items: NotifItem[], hasMore: boolean, total: number, unread: number,
 *     page: number, pageSize: number }
 *
 * The bell dropdown fetches without params (page 1, 50) for the preview list.
 * The full NotificationsView paginates with `?page=&pageSize=20`.
 *
 * `unread` is the user's total unread count across ALL notifications
 * (independent of `filter` / `page`) so the badge stays accurate even when
 * the view is filtered to "unread only".
 */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return error("Unauthorized", 401)

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50)
  )
  const filter = url.searchParams.get("filter") === "unread" ? "unread" : "all"
  const typeFilter = url.searchParams.get("type")?.trim() || null

  const where = {
    userId: user.id,
    ...(filter === "unread" ? { isRead: false } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  }

  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize + 1, // fetch one extra to determine hasMore
      select: {
        id: true,
        type: true,
        message: true,
        linkUrl: true,
        isRead: true,
        createdAt: true,
        clubId: true,
      },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ])

  const hasMore = rows.length > pageSize
  const items = hasMore ? rows.slice(0, pageSize) : rows

  return json({
    items,
    hasMore,
    total,
    unread,
    page,
    pageSize,
  })
}
