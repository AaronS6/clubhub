import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

const STATUSES = new Set(["not_started", "in_progress", "done"])

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ clubId: string; id: string }> }
) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const existing = await db.task.findUnique({ where: { id } })
  if (!existing || existing.clubId !== clubId || existing.deletedAt)
    return error("Task not found", 404)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)

  const isExec = c.membership.role === "executive"
  const isAssignee = existing.assignedToUserId === c.user.id

  // Members may ONLY change status of tasks assigned to them.
  if (!isExec) {
    const allowedKeys = Object.keys(body as object).filter((k) => k !== "undefined")
    if (allowedKeys.length === 0) return error("No fields provided", 400)
    const onlyStatus =
      allowedKeys.length === 1 && allowedKeys[0] === "status"
    if (!onlyStatus) {
      return error("Members can only change task status", 403)
    }
    if (!isAssignee) {
      return error("You can only change the status of tasks assigned to you", 403)
    }
    const newStatus = (body as { status?: string }).status
    if (!newStatus || !STATUSES.has(newStatus))
      return error("Invalid status", 400)
    if (newStatus === existing.status)
      return json({ task: { ...existing, status: existing.status } })

    const updated = await db.task.update({
      where: { id },
      data: { status: newStatus },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        subtasks: { orderBy: { createdAt: "asc" } },
        _count: { select: { comments: true } },
      },
    })
    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "task_status_changed",
        targetType: "task",
        targetId: id,
        description: `${c.user.name} moved task "${existing.title}" to ${newStatus.replace("_", " ")}`,
      }),
      emitClubEvent(clubId, "task_status_changed", { taskId: id }),
    ])
    return json({ task: serializeTask(updated) })
  }

  // Executive branch — may edit any field.
  const {
    title,
    description,
    teamId,
    assignedToUserId,
    dueDate,
    status,
  } = body as {
    title?: string
    description?: string | null
    teamId?: string | null
    assignedToUserId?: string | null
    dueDate?: string | null
    status?: string
  }

  const data: any = {}
  if (title !== undefined) {
    if (typeof title !== "string" || title.trim().length === 0)
      return error("Title cannot be empty", 400)
    if (title.length > 200) return error("Title is too long (max 200 chars)", 400)
    data.title = title.trim()
  }
  if (description !== undefined) {
    if (description !== null && description.length > 5000)
      return error("Description is too long (max 5000 chars)", 400)
    data.description = description?.trim() || null
  }
  if (teamId !== undefined && assignedToUserId !== undefined) {
    // Both reference checks are independent — fan them out in parallel.
    const [team, member] = await Promise.all([
      teamId
        ? db.team.findUnique({ where: { id: teamId } })
        : Promise.resolve(null),
      assignedToUserId
        ? db.clubMember.findUnique({
            where: { clubId_userId: { clubId, userId: assignedToUserId } },
          })
        : Promise.resolve(null),
    ])
    if (teamId && (!team || team.clubId !== clubId)) return error("Team not found", 400)
    if (teamId) data.teamId = teamId
    if (assignedToUserId && (!member || member.status !== "active"))
      return error("Assignee is not an active member of this club", 400)
    if (assignedToUserId) data.assignedToUserId = assignedToUserId
    if (!teamId) data.teamId = null
    if (!assignedToUserId) data.assignedToUserId = null
  } else if (teamId !== undefined) {
    if (teamId) {
      const team = await db.team.findUnique({ where: { id: teamId } })
      if (!team || team.clubId !== clubId) return error("Team not found", 400)
      data.teamId = teamId
    } else {
      data.teamId = null
    }
  } else if (assignedToUserId !== undefined) {
    if (assignedToUserId) {
      const member = await db.clubMember.findUnique({
        where: { clubId_userId: { clubId, userId: assignedToUserId } },
      })
      if (!member || member.status !== "active")
        return error("Assignee is not an active member of this club", 400)
      data.assignedToUserId = assignedToUserId
    } else {
      data.assignedToUserId = null
    }
  }
  if (dueDate !== undefined) {
    if (dueDate) {
      const d = new Date(dueDate)
      if (isNaN(d.getTime())) return error("Invalid due date", 400)
      data.dueDate = d
    } else {
      data.dueDate = null
    }
  }
  if (status !== undefined) {
    if (!STATUSES.has(status)) return error("Invalid status", 400)
    data.status = status
  }

  if (Object.keys(data).length === 0)
    return error("No valid fields to update", 400)

  const updated = await db.task.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      team: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
      subtasks: { orderBy: { createdAt: "asc" } },
      _count: { select: { comments: true } },
    },
  })

  // Activity + notification on assignment change. logActivity/notify/emitClubEvent are best-effort
  // independent side effects — fire them in parallel rather than sequentially.
  const sideEffects: Promise<unknown>[] = []
  if (
    assignedToUserId !== undefined &&
    assignedToUserId !== existing.assignedToUserId
  ) {
    sideEffects.push(
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "task_assigned",
        targetType: "task",
        targetId: id,
        description: assignedToUserId
          ? `${c.user.name} assigned "${existing.title}" to ${updated.assignee?.name ?? "a member"}`
          : `${c.user.name} unassigned "${existing.title}"`,
      }),
    )
    if (assignedToUserId && assignedToUserId !== c.user.id) {
      sideEffects.push(
        notify({
          userId: assignedToUserId,
          clubId,
          type: "task_assigned",
          message: `${c.user.name} assigned you a task: "${existing.title}"`,
          linkUrl: `?view=tasks&taskId=${id}`,
        }),
      )
    }
  }
  if (status !== undefined && status !== existing.status) {
    sideEffects.push(
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "task_status_changed",
        targetType: "task",
        targetId: id,
        description: `${c.user.name} moved task "${existing.title}" to ${status.replace("_", " ")}`,
      }),
      emitClubEvent(clubId, "task_status_changed", { taskId: id }),
    )
  } else {
    sideEffects.push(emitClubEvent(clubId, "task_updated", { taskId: id }))
  }
  await Promise.all(sideEffects)

  return json({ task: serializeTask(updated) })
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ clubId: string; id: string }> }
) {
  const { clubId, id } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  const existing = await db.task.findUnique({ where: { id } })
  if (!existing || existing.clubId !== clubId || existing.deletedAt)
    return error("Task not found", 404)

  // Executives may delete any task. The assignee may also delete their own task.
  const isExec = c.membership.role === "executive"
  const isAssignee = existing.assignedToUserId === c.user.id
  if (!isExec && !isAssignee)
    return error("Only executives or the assignee can delete this task", 403)

  await db.task.update({ where: { id }, data: { deletedAt: new Date() } })
  // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
  await Promise.all([
    logActivity({
      clubId,
      actorUserId: c.user.id,
      actionType: "task_deleted",
      targetType: "task",
      targetId: id,
      description: `${c.user.name} deleted task "${existing.title}"`,
    }),
    emitClubEvent(clubId, "task_deleted", { taskId: id }),
  ])
  return json({ ok: true })
}

function serializeTask(t: any) {
  return {
    id: t.id,
    clubId: t.clubId,
    teamId: t.teamId,
    title: t.title,
    description: t.description,
    assignedToUserId: t.assignedToUserId,
    assignee: t.assignee,
    team: t.team,
    creator: t.creator,
    dueDate: t.dueDate,
    status: t.status as "not_started" | "in_progress" | "done",
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdById: t.createdById,
    subtasks: (t.subtasks ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      isDone: s.isDone,
      createdAt: s.createdAt,
    })),
    commentCount: t._count?.comments ?? 0,
  }
}
