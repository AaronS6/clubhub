import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

export async function POST(
  req: Request,
  ctx: { params: Promise<{ clubId: string; id: string }> }
) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const task = await db.task.findUnique({ where: { id } })
    if (!task || task.clubId !== clubId || task.deletedAt)
      return error("Task not found", 404)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const { title } = body as { title?: string }
    if (!title || typeof title !== "string" || title.trim().length === 0)
      return error("Subtask title is required", 400)
    if (title.length > 200) return error("Title is too long (max 200 chars)", 400)

    const subtask = await db.subtask.create({
      data: { taskId: id, title: title.trim() },
    })

    await emitClubEvent(clubId, "task_updated", { taskId: id })

    return json({ subtask }, 201)

  } catch (err: any) {
    console.error("[clubs/tasks/subtasks POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to create subtask: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
