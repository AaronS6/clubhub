/**
 * Shared types for the My Hub API surface (`/api/hub/*`).
 *
 * Every hub endpoint derives the accessible club set from the authenticated
 * user's ACTIVE memberships server-side — client-supplied club ids are only
 * ever used as an intersection filter, never as authorization.
 */

/** Club identity attached to every aggregated hub item. */
export interface HubClubBadge {
  clubId: string
  clubName: string
  logoUrl: string | null
  accentColor: string
}

export interface HubClubSummary extends HubClubBadge {
  clubCode: string
  role: "member" | "executive"
  nextMeeting: HubMeetingLite | null
}

export interface HubMeetingLite {
  id: string
  title: string
  startTime: string
}

export interface HubMeeting extends HubMeetingLite {
  clubId: string
  club: HubClubBadge
  description: string | null
  location: string
  endTime: string
  teamName: string | null
  cancelledAt: string | null
  /** "going" | "maybe" | "not_going" | null (no RSVP yet). */
  myRsvp: string | null
  /** How many members have RSVPed "going" (social proof for the hero card;
   *  optional because /api/hub/meetings doesn't select it). */
  goingCount?: number
}

export interface HubTask {
  id: string
  clubId: string
  club: HubClubBadge
  title: string
  description: string | null
  dueDate: string | null
  status: "not_started" | "in_progress" | "done"
  teamName: string | null
  subtaskTotal: number
  subtaskDone: number
}

export interface HubAnnouncement {
  id: string
  clubId: string
  club: HubClubBadge
  title: string
  body: string
  isPinned: boolean
  isUrgent: boolean
  accent: string | null
  tag: string | null
  createdAt: string
  authorName: string | null
  authorAvatarUrl: string | null
  hasPoll: boolean
  reactionCount: number
  commentCount: number
}

export interface HubBadgeAward {
  id: string
  name: string
  emoji: string
  clubName: string
  awardedAt: string
  awardedByName: string | null
}

export interface HubActivity {
  approvedHours: number
  pendingHours: number
  pendingCount: number
  badgesTotal: number
  recentBadges: HubBadgeAward[]
  recentHours: {
    id: string
    clubId: string
    clubName: string
    clubAccent: string
    hours: number
    status: string
    dateOfService: string
    reasonText: string
  }[]
}

/** GET /api/hub — the My Hub dashboard aggregate. */
export interface HubOverview {
  clubs: HubClubSummary[]
  stats: {
    upcomingEvents: number
    pendingTasks: number
    unreadUpdates: number
    approvedHours: number
    pendingHours: number
    /** Unread chat messages across every club (the Messages shortcut dot). */
    unreadMessages: number
  }
  week: HubMeeting[]
  updates: HubAnnouncement[]
  tasks: HubTask[]
  activity: HubActivity
}

/** GET /api/hub/conversations — combined inbox row. */
export interface HubConversation {
  id: string
  clubId: string
  club: HubClubBadge
  type: "club_wide" | "group" | "direct"
  /** Group name, or the other member's name for DMs. */
  title: string
  /** For DMs — the other member (avatar for the row). */
  otherUser: { id: string; name: string; avatarUrl: string | null } | null
  memberCount: number
  lastMessage: {
    body: string
    createdAt: string
    authorId: string
    isDeleted: boolean
  } | null
  unreadCount: number
  updatedAt: string
}
