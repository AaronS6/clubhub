import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * GET /api/me/badges
 *
 * Returns every badge the session user has been awarded across ALL their
 * clubs. Used by the app-shell's confetti popup to surface newly-awarded
 * badges on app load.
 *
 * Wrapped in try/catch — if the Badge tables don't exist yet (e.g. the user
 * hasn't run the SQL in Supabase), returns an empty array instead of 500ing.
 * This prevents the confetti popup from breaking the app.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) return error("Unauthorized", 401)

    const url = new URL(req.url)
    const sinceParam = url.searchParams.get("since")
    let since: Date | null = null
    if (sinceParam) {
      const parsed = new Date(sinceParam)
      if (!isNaN(parsed.getTime())) since = parsed
    }

    const awards = await db.memberBadge.findMany({
      where: {
        userId: user.id,
        ...(since ? { awardedAt: { gt: since } } : {}),
      },
      orderBy: { awardedAt: "desc" },
      select: {
        id: true,
        badgeId: true,
        awardedAt: true,
        clubId: true,
        awardedBy: true,
        awarder: { select: { id: true, name: true } },
        badge: { select: { id: true, name: true, emoji: true, description: true } },
        club: { select: { id: true, name: true } },
      },
    })

    return json({
      awards: awards.map((a) => ({
        id: a.id,
        badgeId: a.badgeId,
        awardedAt: a.awardedAt,
        clubId: a.clubId,
        clubName: a.club.name,
        awardedById: a.awardedBy,
        awardedByName: a.awarder?.name ?? "Unknown",
        badge: {
          id: a.badge.id,
          name: a.badge.name,
          emoji: a.badge.emoji,
          description: a.badge.description,
        },
      })),
    })
  } catch (err: any) {
    // If the Badge tables don't exist yet, return empty — never break the app
    console.error("[me/badges] error:", err?.message)
    return json({ awards: [] })
  }
}
