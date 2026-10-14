import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * Badge award routes for a single member of a club.
 *
 * This file used to host the auto-achievement system (BADGE_DEFS + computeEarned).
 * It's been replaced with the manual award model — executives create custom
 * badges via /api/clubs/[clubId]/badges and award them here.
 *
 *   GET    — list all club badges + which ones this user has been awarded
 *   POST   — exec-only, award a badge to a member (creates a Notification)
 *   DELETE — exec-only, revoke a badge
 */

type Params = { clubId: string; userId: string }

/**
 * GET /api/clubs/[clubId]/members/[userId]/badges
 *
 * Returns the full badge catalog for the club with `awarded: boolean` flags
 * for this specific member. Awarded badges also include `awardedBy` name +
 * `awardedAt`. Any active member of the club can call this — the catalog is
 * public to the club; only the award/revoke actions are exec-gated.
 */
export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { clubId, userId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  // The target user must be an active member of this club.
  const targetMembership = await db.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { id: true, status: true, role: true, joinedAt: true },
  })
  if (!targetMembership || targetMembership.status !== "active") {
    return error("Member not found", 404)
  }

  // Fan out the catalog + this user's award rows in parallel.
  const [badges, awards] = await Promise.all([
    db.badge.findMany({
      where: { clubId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        emoji: true,
        createdAt: true,
      },
    }),
    db.memberBadge.findMany({
      where: { clubId, userId },
      select: {
        badgeId: true,
        awardedAt: true,
        awardedBy: true,
        awarder: { select: { id: true, name: true } },
      },
    }),
  ])

  const awardMap = new Map(awards.map((a) => [a.badgeId, a]))

  return json({
    badges: badges.map((b) => {
      const award = awardMap.get(b.id)
      return {
        id: b.id,
        name: b.name,
        description: b.description,
        emoji: b.emoji,
        createdAt: b.createdAt,
        awarded: !!award,
        awardedAt: award?.awardedAt ?? null,
        awardedById: award?.awardedBy ?? null,
        awardedByName: award?.awarder?.name ?? null,
      }
    }),
    target: {
      userId,
      role: targetMembership.role as "member" | "executive",
      joinedAt: targetMembership.joinedAt,
    },
  })
}

/**
 * POST /api/clubs/[clubId]/members/[userId]/badges
 *
 * Executive-only. Body: { badgeId }. Awards a badge to a member. Stores
 * `awardedBy` = the exec's user ID. Creates a Notification for the member
 * (type="badge_awarded") and logs activity. Realtime fan-out wakes the
 * member's notification bell instantly.
 */
export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const { clubId, userId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { badgeId } = body as { badgeId?: unknown }
  if (typeof badgeId !== "string" || !badgeId.trim()) {
    return error("badgeId is required", 400)
  }

  // Badge must belong to this club.
  const badge = await db.badge.findUnique({
    where: { id: badgeId },
    select: { id: true, name: true, emoji: true, clubId: true },
  })
  if (!badge || badge.clubId !== clubId) {
    return error("Badge not found", 404)
  }

  // Target user must be an active member of this club.
  const targetMembership = await db.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { id: true, status: true, user: { select: { id: true, name: true } } },
  })
  if (!targetMembership || targetMembership.status !== "active") {
    return error("Member not found", 404)
  }

  // Enforce the (badgeId, userId) uniqueness — if they already have this
  // badge, return a friendly 409 instead of crashing on the unique constraint.
  const existing = await db.memberBadge.findUnique({
    where: { badgeId_userId: { badgeId, userId } },
    select: { id: true },
  })
  if (existing) {
    return error("Member already has this badge", 409)
  }

  const award = await db.memberBadge.create({
    data: {
      badgeId,
      userId,
      clubId,
      awardedBy: c.user.id,
    },
    select: {
      id: true,
      badgeId: true,
      userId: true,
      awardedAt: true,
      awardedBy: true,
    },
  })

  const message = `You were awarded the "${badge.emoji} ${badge.name}" badge by ${c.user.name}`

  // Best-effort side effects — never fail the award if a side channel misses.
  await Promise.allSettled([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "badge_awarded",
      targetType: "badge",
      targetId: badge.id,
      description: `${c.user.name} awarded the "${badge.emoji} ${badge.name}" badge to ${targetMembership.user.name}`,
    }),
    notify({
      userId,
      clubId,
      type: "badge_awarded",
      message,
      linkUrl: "/?view=members",
    }),
    emitClubEvent(clubId, "badge_awarded", {
      badgeId: badge.id,
      userId,
      awardedBy: c.user.id,
    }),
  ])

  return json({ award }, 201)
}

/**
 * DELETE /api/clubs/[clubId]/members/[userId]/badges
 *
 * Executive-only. Body: { badgeId }. Revokes a badge from a member. Removes
 * the MemberBadge entry. Best-effort activity log + realtime fan-out.
 */
export async function DELETE(req: Request, ctx: { params: Promise<Params> }) {
  const { clubId, userId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 400)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { badgeId } = body as { badgeId?: unknown }
  if (typeof badgeId !== "string" || !badgeId.trim()) {
    return error("badgeId is required", 400)
  }

  const award = await db.memberBadge.findUnique({
    where: { badgeId_userId: { badgeId, userId } },
    select: {
      id: true,
      badgeId: true,
      clubId: true,
      badge: { select: { name: true, emoji: true } },
      user: { select: { name: true } },
    },
  })
  if (!award || award.clubId !== clubId) {
    return error("Award not found", 404)
  }

  await db.memberBadge.delete({ where: { id: award.id } })

  await Promise.allSettled([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "badge_revoked",
      targetType: "badge",
      targetId: badgeId,
      description: `${c.user.name} revoked the "${award.badge.emoji} ${award.badge.name}" badge from ${award.user.name}`,
    }),
    emitClubEvent(clubId, "badge_revoked", { badgeId, userId }),
  ])

  return json({ ok: true })
}
