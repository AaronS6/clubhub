import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ clubId: string; id: string; commentId: string }> }
) {
  const { clubId, id, commentId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const task = await db.task.findUnique({ where: { id } })
  if (!task || task.clubId !== clubId || task.deletedAt)
    return error("Task not found", 404)

  const comment = await db.taskComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.taskId !== id)
    return error("Comment not found", 404)

  const isExec = c.membership.role === "executive"
  const isAuthor = comment.authorId === c.user.id
  if (!isExec && !isAuthor)
    return error("Only the author or an executive can delete this comment", 403)

  await db.taskComment.delete({ where: { id: commentId } })
  await emitClubEvent(clubId, "task_updated", { taskId: id })
  return json({ ok: true })
}
