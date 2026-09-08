import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

const ALLOWED_EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83C\uDF89", "\uD83D\uDC4F", "\uD83D\uDE02"] // thumbsup, heart, party, clap, laugh

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
  const emoji = typeof body.emoji === "string" ? body.emoji : ""
  if (!ALLOWED_EMOJIS.includes(emoji)) return error("Unsupported emoji", 400)

  const existing = await db.announcementReaction.findUnique({
    where: {
      announcementId_userId: { announcementId: id, userId: c.user.id },
    },
  })

  let myReaction: string | null = null

  if (existing) {
    if (existing.emoji === emoji) {
      // Same emoji -> remove
      await db.announcementReaction.delete({ where: { id: existing.id } })
      myReaction = null
    } else {
      // Different emoji -> swap
      await db.announcementReaction.update({
        where: { id: existing.id },
        data: { emoji },
      })
      myReaction = emoji
      if (announcement.authorId !== c.user.id) {
        await notify({
          userId: announcement.authorId,
          clubId,
          type: "new_reaction",
          message: `${c.user.name} reacted ${emoji} to your announcement`,
          linkUrl: `/announcements`,
        })
      }
    }
  } else {
    await db.announcementReaction.create({
      data: { announcementId: id, userId: c.user.id, emoji },
    })
    myReaction = emoji
    if (announcement.authorId !== c.user.id) {
      await notify({
        userId: announcement.authorId,
        clubId,
        type: "new_reaction",
        message: `${c.user.name} reacted ${emoji} to your announcement`,
        linkUrl: `/announcements`,
      })
    }
  }

  // Recompute counts + users
  const reactions = await db.announcementReaction.findMany({
    where: { announcementId: id },
    select: {
      userId: true,
      emoji: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  })
  type ReactionUser = { id: string; name: string; avatarUrl: string | null }
  type ReactionGroup = {
    emoji: string
    count: number
    users: ReactionUser[]
  }
  const groups: Record<string, ReactionGroup> = {}
  for (const r of reactions) {
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

  await emitClubEvent(clubId, "announcement_reaction", { announcementId: id })

  return json({
    reactions: Object.values(groups),
    myReaction,
  })
}
