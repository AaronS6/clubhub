import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * GET /api/clubs/[clubId]/hours
 * - Members: see their own hours.
 * - Executives: default to their own; pass ?scope=all to see all members, or ?userId=X for a specific member.
 * - Optional ?status=pending|approved|rejected filter.
 * Returns items + totals (approved hours sum for the queried scope's primary user)
 *   + clubHoursGoal (for the progress bar).
 */
export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const url = new URL(req.url)
  const scope = url.searchParams.get("scope")
  const userIdParam = url.searchParams.get("userId")
  const status = url.searchParams.get("status")

  const isExec = c.membership.role === "executive"
  const seeAll = isExec && scope === "all"
  const targetUserId = userIdParam ?? (seeAll ? undefined : c.user.id)

  const where: any = { clubId }
  if (targetUserId) where.userId = targetUserId
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    where.status = status
  }

  // Bounded at 500 rows — service-hour history per scope. A single user's
  // history rarely exceeds a few dozen rows; an exec viewing `?scope=all`
  // for a large club could grow unbounded over years, so we cap. The frontend
  // already shows the totals separately (computed via `aggregate`), so the
  // row list is just the recent activity.
  const [items, approvedAgg, club] = await Promise.all([
    db.serviceHour.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatarUrl: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: [{ dateOfService: "desc" }, { submittedAt: "desc" }],
      take: 500,
    }),
    db.serviceHour.aggregate({
      where: {
        clubId,
        userId: targetUserId ?? c.user.id,
        status: "approved",
      },
      _sum: { hours: true },
    }),
    db.club.findUnique({ where: { id: clubId }, select: { hoursGoal: true } }),
  ])

  return json({
    items,
    totals: {
      approvedHours: approvedAgg._sum.hours ?? 0,
    },
    clubHoursGoal: club?.hoursGoal ?? 0,
    myRole: c.membership.role,
    myUserId: c.user.id,
    filteredUserId: targetUserId ?? null,
  })
}

/**
 * POST /api/clubs/[clubId]/hours
 * Body: { dateOfService (ISO string), hours (number), reasonText, categoryId?, proofFileUrl? }
 * Creates a pending entry, logs activity, notifies all executives.
 */
export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { dateOfService, hours, reasonText, categoryId, proofFileUrl } = body as any

  if (!dateOfService || typeof dateOfService !== "string") return error("dateOfService is required", 400)
  const date = new Date(dateOfService)
  if (isNaN(date.getTime())) return error("Invalid dateOfService", 400)
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return error("dateOfService cannot be in the future", 400)

  if (typeof hours !== "number" || !isFinite(hours) || hours <= 0 || hours > 1000) {
    return error("hours must be a positive number up to 1000", 400)
  }

  if (!reasonText || typeof reasonText !== "string" || reasonText.trim().length === 0) {
    return error("reasonText is required", 400)
  }
  if (reasonText.length > 2000) return error("reasonText too long (max 2000)", 400)

  let category: { id: string } | null = null
  if (categoryId) {
    if (typeof categoryId !== "string") return error("Invalid categoryId", 400)
    category = await db.serviceCategory.findUnique({ where: { id: categoryId, clubId }, select: { id: true } })
    if (!category) return error("Invalid category for this club", 400)
  }

  let proofUrl: string | null = null
  if (proofFileUrl !== undefined && proofFileUrl !== null) {
    if (typeof proofFileUrl !== "string") return error("Invalid proofFileUrl", 400)
    // must point into our own uploads directory for this club
    if (!proofFileUrl.startsWith(`/uploads/clubs/${clubId}/hours/`)) {
      return error("Invalid proof file URL", 400)
    }
    proofUrl = proofFileUrl
  }

  const entry = await db.serviceHour.create({
    data: {
      clubId,
      userId: c.user.id,
      categoryId: category?.id ?? null,
      dateOfService: date,
      hours,
      reasonText: reasonText.trim(),
      proofFileUrl: proofUrl,
      status: "pending",
      submittedAt: new Date(),
    },
    include: { category: { select: { id: true, name: true } } },
  })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "hours_submitted",
    targetType: "service_hour",
    targetId: entry.id,
    description: `${c.user.name} submitted ${hours} service hour(s)`,
  })

  // Notify executives
  try {
    const execs = await db.clubMember.findMany({
      where: { clubId, status: "active", role: "executive" },
      select: { userId: true },
    })
    if (execs.length > 0) {
      await db.notification.createMany({
        data: execs.map((e) => ({
          userId: e.userId,
          clubId,
          type: "hours_submitted",
          message: `${c.user.name} submitted ${hours} service hour(s) for review`,
          linkUrl: "/?view=approvals",
        })),
      })
    }
  } catch (e) {
    console.error("notify execs failed", e)
  }

  await emitClubEvent(clubId, "hours_submitted", { hourId: entry.id })

  return json({ entry }, 201)
}
