import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

/**
 * POST /api/clubs/[clubId]/tasks/[id]/restore
 * Unsets `deletedAt` on a soft-deleted task so it re-appears in the default
 * list and Kanban board. Allowed for: executives OR the original assignee.
 * Used by the undo-toast on the client (within ~5s of deletion) and by the
 * exec recovery view (?includeDeleted=true).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ clubId: string; id: string }> }) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const task = await db.task.findUnique({ where: { id } })
    if (!task || task.clubId !== clubId) {
      return error("Task not found", 404)
    }

    const isExec = c.membership.role === "executive"
    const isAssignee = task.assignedToUserId === c.user.id
    if (!isExec && !isAssignee)
      return error("Only executives or the assignee can restore this task", 403)

    if (!task.deletedAt) {
      return json({ ok: true, alreadyRestored: true })
    }

    await db.task.update({
      where: { id },
      data: { deletedAt: null },
    })

    await logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "task_restored",
      targetType: "task",
      targetId: id,
      description: `${c.user.name} restored task "${task.title}"`,
    })

    await emitClubEvent(clubId, "task_updated", { taskId: id, restored: true })
    return json({ ok: true })

  } catch (err: any) {
    console.error("[clubs/tasks/restore POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to restore task: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
