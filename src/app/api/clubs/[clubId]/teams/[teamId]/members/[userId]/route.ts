import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"
import { logActivity } from "@/lib/activity"
import { emitClubEvent } from "@/lib/realtime-server"

type Ctx = { params: Promise<{ clubId: string; teamId: string; userId: string }> }

/** DELETE /api/clubs/[clubId]/teams/[teamId]/members/[userId] — exec only.
 *  Removes a user from the team. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { clubId, teamId, userId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)
  if (c.membership.role !== "executive") return error("Executives only", 403)

  const team = await db.team.findFirst({
    where: { id: teamId, clubId },
    include: { members: { where: { userId }, select: { id: true, user: { select: { name: true } } } } },
  })
  if (!team) return error("Team not found", 404)

  const membership = team.members[0]
  if (!membership) return error("Member not on this team", 404)

  await db.teamMember.delete({ where: { id: membership.id } })

  await logActivity({
    clubId,
    actorUserId: c.user.id,
    actionType: "team_member_removed",
    targetType: "team",
    targetId: team.id,
    description: `${c.user.name} removed ${membership.user.name} from team "${team.name}"`,
  })

  await emitClubEvent(clubId, "team_member_removed", { teamId: team.id, userId })

  return json({ ok: true })
}
