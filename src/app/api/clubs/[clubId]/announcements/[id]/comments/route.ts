import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/** Parse `@Name` patterns and return the user IDs of mentioned active club members. */
function parseMentionedUserIds(text: string, members: { user: { id: string; name: string } }[]): string[] {
  const seen = new Set<string>()
  const lowerByName = new Map<string, string>()
  for (const m of members) {
    lowerByName.set(m.user.name.toLowerCase(), m.user.id)
  }
  const re = /(?:^|\s)@([A-Za-z0-9._-]+[A-Za-z0-9])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const id = lowerByName.get(m[1].toLowerCase())
    if (id) seen.add(id)
  }
  return Array.from(seen)
}

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const announcement = await db.announcement.findUnique({ where: { id } })
  if (!announcement || announcement.clubId !== clubId || announcement.deletedAt) {
    return error("Announcement not found", 404)
  }

  const comments = await db.announcementComment.findMany({
    where: { announcementId: id },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  const items = comments.map((cm) =>
    cm.deletedAt
      ? {
          id: cm.id,
          deleted: true as const,
          createdAt: cm.createdAt,
          authorId: cm.authorId,
        }
      : {
          id: cm.id,
          deleted: false as const,
          body: cm.body,
          createdAt: cm.createdAt,
          authorId: cm.authorId,
          author: {
            id: cm.author.id,
            name: cm.author.name,
            avatarUrl: cm.author.avatarUrl ?? null,
          },
        }
  )

  return json({ items, myUserId: c.user.id, myRole: c.membership.role })
}

export async function POST(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const announcement = await db.announcement.findUnique({ where: { id } })
  if (!announcement || announcement.clubId !== clubId || announcement.deletedAt) {
    return error("Announcement not found", 404)
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const text = typeof body.body === "string" ? body.body.trim() : ""
  if (!text) return error("Comment cannot be empty", 400)
  if (text.length > 2000) return error("Comment must be 2000 characters or fewer", 400)

  const created = await db.announcementComment.create({
    data: { announcementId: id, authorId: c.user.id, body: text },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "announcement_commented",
    targetType: "announcement",
    targetId: id,
    description: `${c.user.name} commented on an announcement`,
  })

  if (announcement.authorId !== c.user.id) {
    await notify({
      userId: announcement.authorId,
      clubId,
      type: "new_comment",
      message: `${c.user.name} commented on your announcement`,
      linkUrl: `/announcements`,
    })
  }

  // Parse @mentions and notify mentioned users (excluding the author).
  const clubMembers = await db.clubMember.findMany({
    where: { clubId, status: "active" },
    select: { user: { select: { id: true, name: true } } },
  })
  const mentionedUserIds = parseMentionedUserIds(text, clubMembers)
  for (const mentionedId of mentionedUserIds) {
    if (mentionedId === c.user.id) continue // never self-notify
    await notify({
      userId: mentionedId,
      clubId,
      type: "new_comment",
      message: `${c.user.name} mentioned you in an announcement comment`,
      linkUrl: `/announcements`,
    })
  }

  await emitClubEvent(clubId, "announcement_comment", { announcementId: id, commentId: created.id })

  return json({
    item: {
      id: created.id,
      deleted: false,
      body: created.body,
      createdAt: created.createdAt,
      authorId: created.authorId,
      author: {
        id: created.author.id,
        name: created.author.name,
        avatarUrl: created.author.avatarUrl ?? null,
      },
    },
  }, 201)
}
