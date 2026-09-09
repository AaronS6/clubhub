import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { emitClubEvent } from "@/lib/realtime-server"

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clubId: string; id: string }> }
) {
  try {
    const { clubId, id } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    // task (existence + scope) + comments are independent — fan them out in parallel.
    const [task, comments] = await Promise.all([
      db.task.findUnique({ where: { id } }),
      db.taskComment.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
    ])
    if (!task || task.clubId !== clubId || task.deletedAt)
      return error("Task not found", 404)

    return json({
      comments: comments.map((cmt) => ({
        id: cmt.id,
        body: cmt.body,
        createdAt: cmt.createdAt,
        authorId: cmt.authorId,
        author: cmt.author,
      })),
      myUserId: c.user.id,
      myRole: c.membership.role,
    })

  } catch (err: any) {
    console.error("[clubs/tasks/comments GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load comments: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

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
    const { body: text } = body as { body?: string }
    if (!text || typeof text !== "string" || text.trim().length === 0)
      return error("Comment body is required", 400)
    if (text.length > 5000)
      return error("Comment is too long (max 5000 chars)", 400)

    const comment = await db.taskComment.create({
      data: { taskId: id, authorId: c.user.id, body: text.trim() },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    await emitClubEvent(clubId, "task_updated", { taskId: id })

    return json(
      {
        comment: {
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          authorId: comment.authorId,
          author: comment.author,
        },
      },
      201
    )

  } catch (err: any) {
    console.error("[clubs/tasks/comments POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to create comment: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
