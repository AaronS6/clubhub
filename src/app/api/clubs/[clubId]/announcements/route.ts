import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notifyClub } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"
import { rateLimit } from "@/lib/rate-limit"

const PAGE_SIZE = 20

// Generous cap — exec-only already, but a compromised exec account could
// spam announcements to flood notifications. 30/min/user is well above any
// legitimate posting cadence while keeping the abuse surface bounded.
const ANNOUNCEMENT_RATE_LIMIT_MAX = 30
const ANNOUNCEMENT_RATE_LIMIT_WINDOW_MS = 60_000

export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const url = new URL(req.url)
  const pageParam = Number(url.searchParams.get("page") ?? "1")
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1
  const skip = (page - 1) * PAGE_SIZE

  // Execs may pass ?includeDeleted=true to see soft-deleted announcements for recovery.
  const includeDeleted = c.membership.role === "executive" && url.searchParams.get("includeDeleted") === "true"
  const where = includeDeleted ? { clubId } : { clubId, deletedAt: null }

  const [total, rows] = await Promise.all([
    db.announcement.count({ where }),
    db.announcement.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      skip,
      take: PAGE_SIZE,
      include: {
        author: {
          select: { id: true, name: true, avatarUrl: true },
        },
        reactions: {
          select: {
            id: true,
            userId: true,
            emoji: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
        _count: { select: { comments: { where: { deletedAt: null } } } },
      },
    }),
  ])

  type ReactionUser = { id: string; name: string; avatarUrl: string | null }
  type ReactionGroup = { emoji: string; count: number; users: ReactionUser[] }

  const items = rows.map((a) => {
    const groups: Record<string, ReactionGroup> = {}
    let myReaction: string | null = null
    for (const r of a.reactions) {
      const g = groups[r.emoji]
      if (g) {
        g.count += 1
        g.users.push({
          id: r.user.id,
          name: r.user.name,
          avatarUrl: r.user.avatarUrl ?? null,
        })
      } else {
        groups[r.emoji] = {
          emoji: r.emoji,
          count: 1,
          users: [
            {
              id: r.user.id,
              name: r.user.name,
              avatarUrl: r.user.avatarUrl ?? null,
            },
          ],
        }
      }
      if (r.userId === c.user.id) myReaction = r.emoji
    }
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      isPinned: a.isPinned,
      isUrgent: a.isUrgent,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      authorId: a.authorId,
      deletedAt: a.deletedAt,
      author: {
        id: a.author.id,
        name: a.author.name,
        avatarUrl: a.author.avatarUrl ?? null,
      },
      reactions: Object.values(groups),
      myReaction,
      commentCount: a._count.comments,
    }
  })

  return json({
    items,
    hasMore: skip + items.length < total,
    page,
  })
}

export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 403)

  // Rate limit: 30 announcements per user per minute. Generous — protects
  // against a compromised exec flooding the club with notifications.
  const rlKey = `announcement:${c.user.id}`
  const rl = rateLimit(rlKey, ANNOUNCEMENT_RATE_LIMIT_MAX, ANNOUNCEMENT_RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
    return Response.json(
      { error: "You're posting too quickly. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const text = typeof body.body === "string" ? body.body.trim() : ""
  const isPinned = typeof body.isPinned === "boolean" ? body.isPinned : false
  const isUrgent = typeof body.isUrgent === "boolean" ? body.isUrgent : false
  if (!title) return error("Title is required", 400)
  if (title.length > 200) return error("Title must be 200 characters or fewer", 400)
  if (!text) return error("Body is required", 400)
  if (text.length > 8000) return error("Body must be 8000 characters or fewer", 400)

  const created = await db.announcement.create({
    data: {
      clubId,
      authorId: c.user.id,
      title,
      body: text,
      isPinned,
      isUrgent,
    },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
      reactions: {
        select: {
          userId: true,
          emoji: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      _count: { select: { comments: { where: { deletedAt: null } } } },
    },
  })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "announcement_created",
    targetType: "announcement",
    targetId: created.id,
    description: `${c.user.name} posted "${title}"`,
  })

  await notifyClub({
    clubId,
    excludeUserId: c.user.id,
    type: "new_announcement",
    message: isUrgent
      ? `URGENT · ${c.user.name} posted: ${title}`
      : `${c.user.name} posted: ${title}`,
    linkUrl: `/announcements`,
  })

  await emitClubEvent(clubId, "announcement_created", { announcementId: created.id })

  type ReactionUser = { id: string; name: string; avatarUrl: string | null }
  type ReactionGroup = { emoji: string; count: number; users: ReactionUser[] }
  const groups: Record<string, ReactionGroup> = {}
  for (const r of created.reactions) {
    const g = groups[r.emoji]
    if (g) {
      g.count += 1
      g.users.push({ id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? null })
    } else {
      groups[r.emoji] = {
        emoji: r.emoji,
        count: 1,
        users: [{ id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl ?? null }],
      }
    }
  }

  return json({
    item: {
      id: created.id,
      title: created.title,
      body: created.body,
      isPinned: created.isPinned,
      isUrgent: created.isUrgent,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      authorId: created.authorId,
      author: {
        id: created.author.id,
        name: created.author.name,
        avatarUrl: created.author.avatarUrl ?? null,
      },
      reactions: Object.values(groups),
      myReaction: null,
      commentCount: created._count.comments,
    },
  }, 201)
}
