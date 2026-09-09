import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity, notify } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

const STATUSES = new Set(["not_started", "in_progress", "done"])

export async function GET(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)

    const url = new URL(req.url)
    const teamId = url.searchParams.get("teamId")
    const assigneeId = url.searchParams.get("assigneeId")
    const status = url.searchParams.get("status")

    // Execs may pass ?includeDeleted=true to see soft-deleted tasks for recovery.
    const includeDeleted = c.membership.role === "executive" && url.searchParams.get("includeDeleted") === "true"
    const where: any = includeDeleted ? { clubId } : { clubId, deletedAt: null }
    if (teamId && teamId !== "all") where.teamId = teamId
    if (assigneeId && assigneeId !== "all") {
      if (assigneeId === "me") where.assignedToUserId = c.user.id
      else where.assignedToUserId = assigneeId
    }
    if (status && STATUSES.has(status)) where.status = status

    // Cap at 200 — clubs that genuinely have more than 200 active tasks need
    // proper pagination, not unbounded loading. 200 covers all realistic cases
    // (a club with 200 open tasks has bigger problems than a slow query) and
    // protects the GET from pathological scale.
    const TASK_LIMIT = 200

    const tasks = await db.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: TASK_LIMIT,
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        subtasks: { orderBy: { createdAt: "asc" } },
        _count: { select: { comments: true } },
      },
    })

    // Convenience: also return club's teams and members for the filters,
    // so the frontend doesn't have to make extra round-trips. Bounded — these
    // are filter dropdowns, so 200 is plenty.
    const [teams, members] = await Promise.all([
      db.team.findMany({
        where: { clubId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
      db.clubMember.findMany({
        where: { clubId, status: "active" },
        select: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { user: { name: "asc" } },
        take: 500,
      }),
    ])

    return json({
      tasks: tasks.map((t) => ({
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
        deletedAt: t.deletedAt,
        subtasks: t.subtasks.map((s) => ({
          id: s.id,
          title: s.title,
          isDone: s.isDone,
          createdAt: s.createdAt,
        })),
        commentCount: t._count.comments,
      })),
      teams,
      members: members.map((m) => m.user),
      myUserId: c.user.id,
      myRole: c.membership.role,
    })

  } catch (err: any) {
    console.error("[clubs/tasks GET] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to load tasks: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await ctx.params
    const c = await getClubContext(clubId)
    if (!c) return error("Not a member of this club", 403)
    if (c.membership.role !== "executive") return error("Only executives can create tasks", 403)

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return error("Invalid input", 400)
    const {
      title,
      description,
      teamId,
      assignedToUserId,
      dueDate,
      status,
    } = body as {
      title?: string
      description?: string
      teamId?: string | null
      assignedToUserId?: string | null
      dueDate?: string | null
      status?: string
    }

    if (!title || typeof title !== "string" || title.trim().length === 0)
      return error("Title is required", 400)
    if (title.length > 200) return error("Title is too long (max 200 chars)", 400)
    if (description && description.length > 5000)
      return error("Description is too long (max 5000 chars)", 400)

    // Validate references if provided. team + member checks are independent — fan them out.
    if (teamId && assignedToUserId) {
      const [team, member] = await Promise.all([
        db.team.findUnique({ where: { id: teamId } }),
        db.clubMember.findUnique({
          where: { clubId_userId: { clubId, userId: assignedToUserId } },
        }),
      ])
      if (!team || team.clubId !== clubId) return error("Team not found", 400)
      if (!member || member.status !== "active")
        return error("Assignee is not an active member of this club", 400)
    } else if (teamId) {
      const team = await db.team.findUnique({ where: { id: teamId } })
      if (!team || team.clubId !== clubId) return error("Team not found", 400)
    } else if (assignedToUserId) {
      const member = await db.clubMember.findUnique({
        where: { clubId_userId: { clubId, userId: assignedToUserId } },
      })
      if (!member || member.status !== "active")
        return error("Assignee is not an active member of this club", 400)
    }

    const initialStatus =
      status && STATUSES.has(status) ? status : "not_started"

    const task = await db.task.create({
      data: {
        clubId,
        title: title.trim(),
        description: description?.trim() || null,
        teamId: teamId || null,
        assignedToUserId: assignedToUserId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        status: initialStatus,
        createdById: c.user.id,
      },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        team: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        subtasks: true,
        _count: { select: { comments: true } },
      },
    })

    // logActivity + notify (if assigned to someone other than creator) + emitClubEvent
    // are independent best-effort side effects — fan them out in parallel.
    const sideEffects: Promise<unknown>[] = [
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "task_created",
        targetType: "task",
        targetId: task.id,
        description: `${c.user.name} created task "${task.title}"`,
      }),
      emitClubEvent(clubId, "task_created", { taskId: task.id }),
    ]
    if (assignedToUserId && assignedToUserId !== c.user.id) {
      sideEffects.push(
        notify({
          userId: assignedToUserId,
          clubId,
          type: "task_assigned",
          message: `${c.user.name} assigned you a task: "${task.title}"`,
          linkUrl: `?view=tasks&taskId=${task.id}`,
        }),
      )
    }
    await Promise.all(sideEffects)

    return json(
      {
        task: {
          id: task.id,
          clubId: task.clubId,
          teamId: task.teamId,
          title: task.title,
          description: task.description,
          assignedToUserId: task.assignedToUserId,
          assignee: task.assignee,
          team: task.team,
          creator: task.creator,
          dueDate: task.dueDate,
          status: task.status as "not_started" | "in_progress" | "done",
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          createdById: task.createdById,
          subtasks: task.subtasks.map((s) => ({
            id: s.id,
            title: s.title,
            isDone: s.isDone,
            createdAt: s.createdAt,
          })),
          commentCount: task._count.comments,
        },
      },
      201
    )

  } catch (err: any) {
    console.error("[clubs/tasks POST] error:", err?.message, err?.code, err?.meta)
    return NextResponse.json({ error: "Failed to create task: " + (err?.message || "Unknown error") }, { status: 500 })
  }
}
