import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

const ALLOWED_EMOJIS = ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83C\uDF89", "\uD83D\uDC4F", "\uD83D\uDE02"] // thumbsup, heart, party, clap, laugh

export async function POST(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // Parse body up front so we can fan out the announcement + existing-reaction
    // lookups in parallel (they're independent existence checks).
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const emoji = typeof body.emoji === "string" ? body.emoji : ""
    if (!ALLOWED_EMOJIS.includes(emoji)) return error("Unsupported emoji", 400)

    const [announcement, existing] = await Promise.all([
      db.announcement.findUnique({ where: { id } }),
      db.announcementReaction.findUnique({
        where: {
          announcementId_userId: { announcementId: id, userId: c.user.id },
        },
      }),
    ])
    if (!announcement || announcement.clubId !== clubId || announcement.deletedAt) {
      return error("Announcement not found", 404)
    }

    let myReaction: string | null = null
    const shouldNotifyAuthor = announcement.authorId !== c.user.id

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
      }
    } else {
      await db.announcementReaction.create({
        data: { announcementId: id, userId: c.user.id, emoji },
      })
      myReaction = emoji
    }

    // notify (if swapped/added and author isn't us) + emitClubEvent + the
    // recompute-findMany are all independent best-effort side effects.
    const notifyPromise =
      shouldNotifyAuthor && myReaction !== null
        ? notify({
            userId: announcement.authorId,
            clubId,
            type: "new_reaction",
            message: `${c.user.name} reacted ${emoji} to your announcement`,
            linkUrl: `/announcements`,
          })
        : Promise.resolve()
    const [reactions] = await Promise.all([
      db.announcementReaction.findMany({
        where: { announcementId: id },
        select: {
          userId: true,
          emoji: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      notifyPromise,
      emitClubEvent(clubId, "announcement_reaction", { announcementId: id }),
    ])

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

    return json({
      reactions: Object.values(groups),
      myReaction,
    })

  } catch (err: any) {
    console.error("[clubs/announcements/reactions POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to toggle reaction: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
