import { db } from "@/lib/db"
import { getSessionUser, json, error } from "@/lib/server-auth"

/**
 * GET /api/hub/tasks — the student's tasks across every club they belong to.
 *
 * Query params:
 *   ?club=<id>   filter to one club (intersected with actual memberships —
 *                a foreign club id simply filters everything out, it never
 *                grants access)
 *   ?status=open|done|all   (default: open — everything not yet completed)
 *
 * Only tasks ASSIGNED TO the authenticated user are returned ("My Tasks").
 * The club workspace keeps the full board for everyone else.
 */
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return error("Not authenticated", 401)

  const url = new URL(req.url)
  const statusParam = url.searchParams.get("status") ?? "open"
  const clubFilter = url.searchParams.get("club")

  const memberships = await db.clubMember.findMany({
    where: { userId: user.id, status: "active" },
    select: {
      club: {
        select: { id: true, name: true, logoUrl: true, accentColor: true },
      },
    },
    orderBy: { joinedAt: "asc" },
  })
  // Intersection — a client-supplied club outside the membership set yields
  // an empty result, never another club's data.
  let clubIds = memberships.map((m) => m.club.id)
  if (clubFilter) clubIds = clubIds.filter((id) => id === clubFilter)

  const clubById = new Map(memberships.map((m) => [m.club.id, m.club]))

  const tasks = await db.task.findMany({
    where: {
      clubId: { in: clubIds },
      assignedToUserId: user.id,
      deletedAt: null,
      ...(statusParam === "open"
        ? { status: { not: "done" } }
        : statusParam === "done"
          ? { status: "done" }
          : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      clubId: true,
      title: true,
      description: true,
      dueDate: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      team: { select: { name: true } },
      subtasks: { select: { isDone: true } },
    },
  })

  return json({
    tasks: tasks.map((t) => {
      const c = clubById.get(t.clubId)!
      return {
        id: t.id,
        clubId: t.clubId,
        club: {
          clubId: c.id,
          clubName: c.name,
          logoUrl: c.logoUrl,
          accentColor: c.accentColor,
        },
        title: t.title,
        description: t.description,
        dueDate: t.dueDate,
        status: t.status,
        teamName: t.team?.name ?? null,
        subtaskTotal: t.subtasks.length,
        subtaskDone: t.subtasks.filter((s) => s.isDone).length,
        updatedAt: t.updatedAt,
      }
    }),
    clubs: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      logoUrl: m.club.logoUrl,
      accentColor: m.club.accentColor,
    })),
  })
}
