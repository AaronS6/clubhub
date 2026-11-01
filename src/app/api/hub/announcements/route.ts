import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * GET /api/hub/announcements — announcements from every club the student
 * belongs to, newest first, with full club identity so the feed can badge
 * every item.
 *
 * Query params:
 *   ?page=1      1-based page, 20 items per page
 *   ?club=<id>   filter to one club (intersected with memberships)
 *
 * Read-only aggregation: reactions, comments, polls and every other
 * interaction happen through the EXISTING club-scoped routes once the
 * student jumps into the original announcement.
 */
const PAGE_SIZE = 20

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return error("Not authenticated", 401)

  const url = new URL(req.url)
  const page = Math.max(1, Math.min(50, parseInt(url.searchParams.get("page") ?? "1", 10) || 1))
  const clubFilter = url.searchParams.get("club")

  const memberships = await db.clubMember.findMany({
    where: { userId: user.id, status: "active" },
    select: {
      club: { select: { id: true, name: true, logoUrl: true, accentColor: true } },
    },
    orderBy: { joinedAt: "asc" },
  })
  let clubIds = memberships.map((m) => m.club.id)
  if (clubFilter) clubIds = clubIds.filter((id) => id === clubFilter)
  const clubById = new Map(memberships.map((m) => [m.club.id, m.club]))

  if (clubIds.length === 0) {
    return json({ items: [], hasMore: false, page, clubs: [] })
  }

  const [items, total] = await Promise.all([
    db.announcement.findMany({
      where: { clubId: { in: clubIds }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        clubId: true,
        title: true,
        body: true,
        isPinned: true,
        isUrgent: true,
        accent: true,
        tag: true,
        createdAt: true,
        author: { select: { name: true, avatarUrl: true } },
        poll: { select: { id: true } },
        _count: { select: { reactions: true, comments: true } },
      },
    }),
    db.announcement.count({ where: { clubId: { in: clubIds }, deletedAt: null } }),
  ])

  const hasMore = items.length > PAGE_SIZE
  const pageItems = items.slice(0, PAGE_SIZE)

  return json({
    items: pageItems.map((a) => {
      const c = clubById.get(a.clubId)!
      return {
        id: a.id,
        clubId: a.clubId,
        club: {
          clubId: c.id,
          clubName: c.name,
          logoUrl: c.logoUrl,
          accentColor: c.accentColor,
        },
        title: a.title,
        body: a.body,
        isPinned: a.isPinned,
        isUrgent: a.isUrgent,
        accent: a.accent,
        tag: a.tag,
        createdAt: a.createdAt,
        authorName: a.author?.name ?? null,
        authorAvatarUrl: a.author?.avatarUrl ?? null,
        hasPoll: !!a.poll,
        reactionCount: a._count.reactions,
        commentCount: a._count.comments,
      }
    }),
    hasMore,
    page,
    total,
    clubs: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      logoUrl: m.club.logoUrl,
      accentColor: m.club.accentColor,
    })),
  })
}
