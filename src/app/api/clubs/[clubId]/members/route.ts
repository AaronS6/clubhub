import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  // Bounded at 500 — a club with >500 active members is far beyond this app's
  // scale (a school club is typically 10–100), but the cap protects the GET
  // from pathological growth and keeps the response payload predictable.
  // 3 independent queries: members (with user), team memberships, approved-hours aggregates.
  // Fire them as a single parallel wave instead of 3 sequential round-trips.
  const [members, teamRows, hours] = await Promise.all([
    db.clubMember.findMany({
      where: { clubId, status: "active" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true, bio: true } },
      },
      orderBy: [{ role: "desc" }, { joinedAt: "asc" }],
      take: 500,
    }),
    // team memberships per user (for this club) — bounded for the same reason.
    db.teamMember.findMany({
      where: { team: { clubId } },
      select: {
        userId: true,
        team: { select: { id: true, name: true } },
      },
      take: 5000,
    }),
    // approved hours per user
    db.serviceHour.groupBy({
      by: ["userId"],
      where: { clubId, status: "approved" },
      _sum: { hours: true },
    }),
  ])
  const teamsByUser = new Map<string, { id: string; name: string }[]>()
  for (const t of teamRows) {
    const list = teamsByUser.get(t.userId) ?? []
    list.push(t.team)
    teamsByUser.set(t.userId, list)
  }
  const hoursMap = new Map(hours.map((h) => [h.userId, h._sum.hours ?? 0]))
  return json({
    members: members.map((m) => ({
      membershipId: m.id,
      role: m.role,
      joinedAt: m.joinedAt,
      user: m.user,
      teams: teamsByUser.get(m.userId) ?? [],
      approvedHours: hoursMap.get(m.userId) ?? 0,
    })),
    myUserId: c.user.id,
    myRole: c.membership.role,
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Only executives can manage roles", 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return error("Invalid input", 400)
  const { userId, action } = body as { userId?: string; action?: string }
  if (!userId || !action) return error("userId and action required", 400)

  if (action === "promote" || action === "demote") {
    const target = await db.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
    })
    if (!target || target.status !== "active") return error("Member not found", 404)
    if (action === "promote" && target.role === "executive") return error("Already an executive", 400)
    if (action === "demote" && target.role === "member") return error("Already a member", 400)
    if (action === "demote" && target.role === "executive") {
      // ensure at least one executive remains
      const execCount = await db.clubMember.count({
        where: { clubId, status: "active", role: "executive" },
      })
      if (execCount <= 1) return error("Cannot demote the last executive. Promote another member first.", 400)
    }
    const newRole = action === "promote" ? "executive" : "member"
    await db.clubMember.update({ where: { id: target.id }, data: { role: newRole } })
    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: action,
        targetType: "user",
        targetId: userId,
        description: `${c.user.name} ${action === "promote" ? "promoted" : "demoted"} a member to ${newRole}`,
      }),
      emitClubEvent(clubId, action === "promote" ? "member_promoted" : "member_demoted", { userId }),
    ])
    return json({ ok: true, role: newRole })
  }

  if (action === "remove") {
    const target = await db.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
    })
    if (!target || target.status !== "active") return error("Member not found", 404)
    if (target.role === "executive") {
      const execCount = await db.clubMember.count({
        where: { clubId, status: "active", role: "executive" },
      })
      if (execCount <= 1) return error("Cannot remove the last executive. Promote another member first.", 400)
    }
    await db.clubMember.update({ where: { id: target.id }, data: { status: "removed" } })
    // logActivity + emitClubEvent are independent best-effort side effects — fan them out in parallel.
    await Promise.all([
      logActivity({
        clubId,
        actorUserId: c.user.id,
        actionType: "member_removed",
        targetType: "user",
        targetId: userId,
        description: `${c.user.name} removed a member from the club`,
      }),
      emitClubEvent(clubId, "member_removed", { userId }),
    ])
    return json({ ok: true })
  }

  return error("Unknown action", 400)
}
