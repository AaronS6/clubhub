import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * GET /api/clubs/[clubId]/badges
 *
 * Returns every badge defined for this club. Any active member can view the
 * catalog (only executives can create/award them). Includes the exec who
 * created each badge + the award count (cheap aggregate, useful for the
 * manage UI later).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clubId: string }> }
) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const badges = await db.badge.findMany({
    where: { clubId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      emoji: true,
      createdAt: true,
      createdBy: true,
      creator: { select: { id: true, name: true } },
      _count: { select: { awards: true } },
    },
  })

  return json({
    badges: badges.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      emoji: b.emoji,
      createdAt: b.createdAt,
      createdBy: b.createdBy,
      creatorName: b.creator?.name ?? "Unknown",
      awardCount: b._count.awards,
    })),
  })
}

/**
 * POST /api/clubs/[clubId]/badges
 *
 * Executive-only. Body: { name, description?, emoji? }. Creates a new badge
 * for this club. `createdBy` is the exec's user ID. Emoji defaults to "🏆".
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ clubId: string }> }
) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)

  const { name, description, emoji } = body as {
    name?: unknown
    description?: unknown
    emoji?: unknown
  }

  if (typeof name !== "string" || !name.trim()) {
    return error("name is required", 400)
  }
  const trimmedName = name.trim().slice(0, 60)
  if (trimmedName.length > 60) return error("name too long (max 60)", 400)

  let desc: string | null = null
  if (description !== undefined && description !== null) {
    if (typeof description !== "string") return error("Invalid description", 400)
    desc = description.trim().slice(0, 280) || null
  }

  let emojiStr = "🏆"
  if (emoji !== undefined && emoji !== null) {
    if (typeof emoji !== "string") return error("Invalid emoji", 400)
    // Take the first grapheme cluster — emoji pickers sometimes send a
    // variant selector or trailing whitespace. Cap at 8 chars to allow a
    // ZWJ-joined multi-codepoint emoji (e.g. 👩‍🚀) without accepting
    // arbitrary strings.
    const trimmed = emoji.trim().slice(0, 8)
    if (trimmed) emojiStr = trimmed
  }

  const badge = await db.badge.create({
    data: {
      clubId,
      name: trimmedName,
      description: desc,
      emoji: emojiStr,
      createdBy: c.user.id,
    },
    select: {
      id: true,
      name: true,
      description: true,
      emoji: true,
      createdAt: true,
      createdBy: true,
      creator: { select: { id: true, name: true } },
    },
  })

  // Best-effort side effects — don't fail the create if logging/realtime miss.
  await Promise.allSettled([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "badge_created",
      targetType: "badge",
      targetId: badge.id,
      description: `${c.user.name} created the "${badge.emoji} ${badge.name}" badge`,
    }),
    emitClubEvent(clubId, "badge_created", { badgeId: badge.id }),
  ])

  return json(
    {
      badge: {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        emoji: badge.emoji,
        createdAt: badge.createdAt,
        createdBy: badge.createdBy,
        creatorName: badge.creator?.name ?? "Unknown",
      },
    },
    201
  )
}
