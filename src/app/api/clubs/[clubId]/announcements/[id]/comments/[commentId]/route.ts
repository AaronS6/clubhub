import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

export async function DELETE(_req: Request, ctx: { params: Promise<{ clubId: string; id: string; commentId: string }> }) {
  try {
    const { clubId, id, commentId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const comment = await db.announcementComment.findUnique({ where: { id: commentId } })
    if (!comment || comment.announcementId !== id) return error("Comment not found", 404)

    // Verify the parent announcement belongs to this club
    const announcement = await db.announcement.findUnique({
      where: { id },
      select: { clubId: true, deletedAt: true },
    })
    if (!announcement || announcement.clubId !== clubId) return error("Comment not found", 404)

    const isAuthor = comment.authorId === c.user.id
    const isExec = c.membership.role === "executive"
    if (!isAuthor && !isExec) return error("Only the author or an executive can delete this comment", 403)

    if (comment.deletedAt) return json({ ok: true })

    await db.announcementComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    })

    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "comment_deleted",
      targetType: "announcement",
      targetId: id,
      description: `${c.user.name} deleted a comment`,
    })

    await emitClubEvent(clubId, "announcement_comment", { announcementId: id, commentId })

    return json({ ok: true })

  } catch (err: any) {
    console.error("[clubs/announcements/comments DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to delete comment: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
