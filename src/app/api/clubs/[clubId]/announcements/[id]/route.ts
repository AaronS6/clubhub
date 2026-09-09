import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const announcement = await db.announcement.findUnique({ where: { id } })
    if (!announcement || announcement.clubId !== clubId || announcement.deletedAt) {
      return error("Announcement not found", 404)
    }

    const isAuthor = announcement.authorId === c.user.id
    const isExec = c.membership.role === "executive"
    if (!isAuthor && !isExec) return error("Only the author or an executive can edit", 403)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)

    const data: Record<string, unknown> = {}
    if (typeof body.title === "string") {
      const t = body.title.trim()
      if (!t) return error("Title cannot be empty", 400)
      if (t.length > 200) return error("Title must be 200 characters or fewer", 400)
      data.title = t
    }
    if (typeof body.body === "string") {
      const b = body.body.trim()
      if (!b) return error("Body cannot be empty", 400)
      if (b.length > 8000) return error("Body must be 8000 characters or fewer", 400)
      data.body = b
    }
    // Only executives may toggle pinned status
    if (typeof body.isPinned === "boolean") {
      if (!isExec) return error("Only executives can pin announcements", 403)
      data.isPinned = body.isPinned
    }
    // Only executives may toggle urgent status (app-wide dismissible banner)
    if (typeof body.isUrgent === "boolean") {
      if (!isExec) return error("Only executives can mark announcements as urgent", 403)
      data.isUrgent = body.isUrgent
    }

    if (Object.keys(data).length === 0) return error("No valid fields to update", 400)

    const updated = await db.announcement.update({
      where: { id },
      data,
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

    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "announcement_updated",
        targetType: "announcement",
        targetId: id,
        description: `${c.user.name} updated an announcement: ${updated.title}`,
      }),
      emitClubEvent(clubId, "announcement_updated", { announcementId: id }),
    ])

    type ReactionUser = { id: string; name: string; avatarUrl: string | null }
    type ReactionGroup = { emoji: string; count: number; users: ReactionUser[] }
    const groups: Record<string, ReactionGroup> = {}
    let myReaction: string | null = null
    for (const r of updated.reactions) {
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
      if (r.userId === c.user.id) myReaction = r.emoji
    }

    return json({
      item: {
        id: updated.id,
        title: updated.title,
        body: updated.body,
        isPinned: updated.isPinned,
        isUrgent: updated.isUrgent,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        authorId: updated.authorId,
        author: {
          id: updated.author.id,
          name: updated.author.name,
          avatarUrl: updated.author.avatarUrl ?? null,
        },
        reactions: Object.values(groups),
        myReaction,
        commentCount: updated._count.comments,
      },
    })

  } catch (err: any) {
    console.error("[clubs/announcements PATCH] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to update announcement: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Executives only", 403)

    const announcement = await db.announcement.findUnique({ where: { id } })
    if (!announcement || announcement.clubId !== clubId) return error("Announcement not found", 404)
    if (announcement.deletedAt) return json({ ok: true })

    await db.announcement.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "announcement_deleted",
        targetType: "announcement",
        targetId: id,
        description: `${c.user.name} deleted an announcement: ${announcement.title}`,
      }),
      emitClubEvent(clubId, "announcement_deleted", { announcementId: id }),
    ])

    return json({ ok: true })

  } catch (err: any) {
    console.error("[clubs/announcements DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to delete announcement: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
