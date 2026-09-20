/**
 * Pure helper functions for the dashboard. No JSX, no hooks — just formatting
 * utilities used across multiple dashboard sub-components.
 */

/** Format an hours value: 0 → "0", 2 → "2", 1.5 → "1.5", 0.25 → "0.25".
 *  Shows the EXACT value — no rounding. */
export function fmtHours(h: number): string {
  if (h === 0) return "0"
  if (Number.isInteger(h)) return String(h)
  // Show up to 2 decimal places, stripped of trailing zeros.
  // e.g. 0.25 → "0.25", 0.5 → "0.5", 1.250 → "1.25"
  return parseFloat(h.toFixed(2)).toString()
}

/** Format an approval turnaround (in hours) into a human-readable duration. */
export function formatTurnaround(hours: number | null): string {
  if (hours === null || hours === undefined) return "—"
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}


/**
 * The DashboardData interface — matches the `/api/clubs/[clubId]/dashboard`
 * response shape EXACTLY. Exported so sub-components can share the type
 * without re-declaring it.
 */
export interface DashboardData {
  club: {
    id: string
    name: string
    description: string | null
    accentColor: string
    logoUrl: string | null
    hoursGoal: number
    memberCount: number
    createdAt: string
  }
  myRole: "member" | "executive"
  myStats: {
    approvedHours: number
    pendingHours: number
    tasksAssigned: number
    tasksDone: number
    upcomingMeetings: number
    myRsvpsGoing: number
  }
  clubStats: {
    totalMembers: number
    totalApprovedHours: number
    pendingApprovals: number
    openTasks: number
    tasksDone: number
    upcomingMeetingsCount: number
    announcementsThisMonth: number
    teamsCount: number
  }
  leaderboard: {
    userId: string
    name: string
    avatarUrl: string | null
    hours: number
  }[]
  recentAnnouncements: {
    id: string
    title: string
    isPinned: boolean
    createdAt: string
    authorName: string
  }[]
  myTasks: {
    id: string
    title: string
    dueDate: string | null
    status: string
    teamName: string | null
  }[]
  upcomingMeetings: {
    id: string
    title: string
    startTime: string
    location: string
    myRsvp: "going" | "not_going" | "maybe" | null
  }[]
  hoursTrend: { date: string; hours: number }[]
  execStats: {
    avgApprovalTurnaroundHours: number | null
    submissionsThisWeek: number
    taskCompletionRate: number
  } | null
}
