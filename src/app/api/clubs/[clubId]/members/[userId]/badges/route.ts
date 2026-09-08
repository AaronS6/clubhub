import { db } from "@/lib/db"
import { getClubContext, json, error } from "@/lib/server-auth"

// ---------------------------------------------------------------------------
// Badge catalog
// ---------------------------------------------------------------------------

export interface BadgeDef {
  id: string
  label: string
  description: string
  icon: string // lucide icon name — frontend maps to the component
}

export const BADGE_DEFS: BadgeDef[] = [
  {
    id: "first_steps",
    label: "First Steps",
    description: "Completed your first task.",
    icon: "Footprints",
  },
  {
    id: "task_tackler",
    label: "Task Tackler",
    description: "Completed 5 tasks.",
    icon: "ListChecks",
  },
  {
    id: "task_master",
    label: "Task Master",
    description: "Completed 20 tasks.",
    icon: "Trophy",
  },
  {
    id: "helping_hand",
    label: "Helping Hand",
    description: "Logged 10 approved service hours.",
    icon: "HeartHandshake",
  },
  {
    id: "century_club",
    label: "Century Club",
    description: "Logged 100 approved service hours.",
    icon: "Award",
  },
  {
    id: "meeting_regular",
    label: "Meeting Regular",
    description: "RSVP'd \"going\" to 5 meetings.",
    icon: "CalendarCheck",
  },
  {
    id: "announcer",
    label: "Announcer",
    description: "Posted 3 announcements (executives).",
    icon: "Megaphone",
  },
  {
    id: "team_player",
    label: "Team Player",
    description: "Belong to 2 or more teams.",
    icon: "Users",
  },
]

interface UserStats {
  tasksDone: number
  approvedHours: number
  meetingsGoing: number
  announcementsPosted: number
  teamCount: number
}

function computeEarned(s: UserStats): Record<string, boolean> {
  return {
    first_steps: s.tasksDone >= 1,
    task_tackler: s.tasksDone >= 5,
    task_master: s.tasksDone >= 20,
    helping_hand: s.approvedHours >= 10,
    century_club: s.approvedHours >= 100,
    meeting_regular: s.meetingsGoing >= 5,
    announcer: s.announcementsPosted >= 3,
    team_player: s.teamCount >= 2,
  }
}

/**
 * GET /api/clubs/[clubId]/members/[userId]/badges
 *
 * Requires active membership of the club (the requester). The target user
 * must also be an active member of this club (otherwise 404).
 *
 * Returns `{ badges, stats }` where `badges` is the full catalog with `earned`
 * booleans and `stats` is the underlying counts so the UI can render details.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ clubId: string; userId: string }> }
) {
  const { clubId, userId } = await ctx.params
  const c = await getClubContext(clubId)
  if (!c) return error("Not a member of this club", 403)

  // The target user must be an active member of this club.
  const targetMembership = await db.clubMember.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { id: true, status: true, role: true, joinedAt: true },
  })
  if (!targetMembership || targetMembership.status !== "active") {
    return error("Member not found", 404)
  }

  // Gather the user's stats within this club — all in parallel.
  const [tasksDone, hoursAgg, meetingsGoing, announcementsPosted, teamCount] =
    await Promise.all([
      db.task.count({
        where: {
          clubId,
          assignedToUserId: userId,
          status: "done",
          deletedAt: null,
        },
      }),
      db.serviceHour.aggregate({
        where: { clubId, userId, status: "approved" },
        _sum: { hours: true },
      }),
      db.meetingRsvp.count({
        where: { userId, status: "going", meeting: { clubId } },
      }),
      db.announcement.count({
        where: { clubId, authorId: userId, deletedAt: null },
      }),
      db.teamMember.count({
        where: { userId, team: { clubId } },
      }),
    ])

  const stats: UserStats = {
    tasksDone,
    approvedHours: hoursAgg._sum.hours ?? 0,
    meetingsGoing,
    announcementsPosted,
    teamCount,
  }
  const earned = computeEarned(stats)

  return json({
    badges: BADGE_DEFS.map((b) => ({
      id: b.id,
      label: b.label,
      description: b.description,
      icon: b.icon,
      earned: !!earned[b.id],
    })),
    stats,
    target: {
      userId,
      role: targetMembership.role as "member" | "executive",
      joinedAt: targetMembership.joinedAt,
    },
  })
}
