import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ clubId: string; id: string; subtaskId: string }> }
) {
  try {
    const { clubId, id, subtaskId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // task + subtask are independent existence checks — fan them out in parallel.
    const [task, existing] = await Promise.all([
      db.task.findUnique({ where: { id } }),
      db.subtask.findUnique({ where: { id: subtaskId } }),
    ])
    if (!task || task.clubId !== clubId || task.deletedAt)
      return error("Task not found", 404)
    if (!existing || existing.taskId !== id)
      return error("Subtask not found", 404)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const { isDone, title } = body as {
      isDone?: boolean
      title?: string
    }

    const data: any = {}
    if (typeof isDone === "boolean") data.isDone = isDone
    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0)
        return error("Title cannot be empty", 400)
      if (title.length > 200) return error("Title is too long", 400)
      data.title = title.trim()
    }
    if (Object.keys(data).length === 0)
      return error("No valid fields to update", 400)

    const updated = await db.subtask.update({ where: { id: subtaskId }, data })
    await emitClubEvent(clubId, "task_updated", { taskId: id })
    return json({ subtask: updated })

  } catch (err: any) {
    console.error("[clubs/tasks/subtasks PATCH] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load subtasks: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ clubId: string; id: string; subtaskId: string }> }
) {
  try {
    const { clubId, id, subtaskId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // task + subtask are independent existence checks — fan them out in parallel.
    const [task, existing] = await Promise.all([
      db.task.findUnique({ where: { id } }),
      db.subtask.findUnique({ where: { id: subtaskId } }),
    ])
    if (!task || task.clubId !== clubId || task.deletedAt)
      return error("Task not found", 404)
    if (!existing || existing.taskId !== id)
      return error("Subtask not found", 404)

    // Subtasks are checklists — any club member may toggle/delete them.
    // (Previously: only execs or the task creator could delete.)
    await db.subtask.delete({ where: { id: subtaskId } })
    await emitClubEvent(clubId, "task_updated", { taskId: id })
    return json({ ok: true })

  } catch (err: any) {
    console.error("[clubs/tasks/subtasks DELETE] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to delete subtask: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
