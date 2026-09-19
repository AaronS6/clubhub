"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { useAppStore, type View } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { usePollingFallback } from "@/lib/realtime-store"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  EmptyState, StatCardSkeleton, initials, relativeTime, avatarColor,
} from "@/components/shared/page-header"
import { toast } from "sonner"
import { format, isPast, isToday, parseISO } from "date-fns"
import {
  Trophy, Clock, CheckCircle2, CalendarDays, Megaphone, ListChecks,
  Users, TrendingUp, Pin, MapPin, ChevronRight, ShieldCheck,
  Target, Hourglass, ClipboardList, PartyPopper, X, BarChart3,
  History, UserPlus, UserMinus, ArrowUpCircle, ArrowDownCircle,
  XCircle, UserCog, KeyRound, Crown, MessageSquare, ScrollText,
} from "lucide-react"
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

// §41 — Hours milestone celebration. Round numbers we celebrate when the
// viewer's approved hours cross them.
const HOURS_MILESTONES = [50, 100, 250, 500] as const

const CONFETTI_COLORS = [
  "#16a34a", "#f59e0b", "#ef4444", "#a855f7",
  "#ec4899", "#10b981", "#f97316", "#facc15",
]

// =========================================================================
// Types — unchanged (matches the dashboard API response shape)
// =========================================================================
interface DashboardData {
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


// Bento tile — hairline border, card surface, larger radius, hover lift.
// Used for every top-level tile in the new asymmetric grid. NO `card-quiet`.
const TILE =
  "border border-border bg-card rounded-xl p-5 transition-all duration-200"
const TILE_COMPACT =
  "border border-border bg-card rounded-xl p-4 transition-all duration-200"

// =========================================================================
// Main component
// =========================================================================
export function DashboardView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const setView = useAppStore((s) => s.setView)
  const currentClub = useAppStore((s) => s.currentClub)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const [memberOnboardingDismissed, setMemberOnboardingDismissed] = useState(false)

  // Read dismissed state from localStorage on club change.
  // Deferred to a microtask so we don't call setState synchronously
  // inside the effect body (avoids cascading renders).
  useEffect(() => {
    if (!clubId) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      try {
        const v = localStorage.getItem(`onboarding-dismissed-${clubId}`)
        setOnboardingDismissed(v === "true")
        const mv = localStorage.getItem(`member-onboarding-${clubId}`)
        setMemberOnboardingDismissed(mv === "true")
      } catch {
        setOnboardingDismissed(false)
        setMemberOnboardingDismissed(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [clubId])

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["dashboard", clubId],
    queryFn: () => api<DashboardData>(`/api/clubs/${clubId}/dashboard`),
    enabled: !!clubId,
    staleTime: 30_000,
    // Realtime is primary; poll only as a fallback while the socket is down.
    refetchInterval: usePollingFallback(15000),
  })

  useEffect(() => {
    if (error) toast.error((error as Error).message || "Failed to load dashboard")
  }, [error])

  if (!clubId) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No club selected"
        description="Pick a club from the sidebar to view its dashboard."
      />
    )
  }

  if (isLoading || !data) {
    return <DashboardSkeleton />
  }

  const isExec = data.myRole === "executive"
  const hasActivity =
    data.recentAnnouncements.length > 0 || data.clubStats.teamsCount > 0
  // Onboarding banner is EXEC-only — members joining an existing club don't
  // need to "set up" anything; they just want to see their snapshot.
  const showOnboarding = isExec && !onboardingDismissed && !hasActivity

  // Lightweight first-run experience for members. We treat a member as
  // "new" if they have no tasks assigned, no hours submitted (approved or
  // pending), and no RSVPs going. The card sits above the attention row
  // and is dismissible via localStorage so we don't pester returning users.
  const memberIsNew =
    !isExec &&
    data.myStats.tasksAssigned === 0 &&
    data.myStats.approvedHours === 0 &&
    data.myStats.pendingHours === 0 &&
    data.myStats.myRsvpsGoing === 0
  const showMemberOnboarding = memberIsNew && !memberOnboardingDismissed

  const dismissOnboarding = () => {
    try {
      localStorage.setItem(`onboarding-dismissed-${clubId}`, "true")
    } catch {
      /* ignore */
    }
    setOnboardingDismissed(true)
  }

  const dismissMemberOnboarding = () => {
    try {
      localStorage.setItem(`member-onboarding-${clubId}`, "true")
    } catch {
      /* ignore */
    }
    setMemberOnboardingDismissed(true)
  }

  // -- Tier 1 attention items ------------------------------------------------
  const attentionItems: ReactNode[] = []
  let idx = 0

  if (isExec && data.clubStats.pendingApprovals > 0) {
    const n = data.clubStats.pendingApprovals
    attentionItems.push(
      <AttentionCard
        key="approvals"
        delay={idx++ * 50}
        icon={<ShieldCheck className="h-4 w-4" />}
        title={`${n} pending approval${n === 1 ? "" : "s"}`}
        description="Awaiting your review"
        onClick={() => setView("approvals")}
      />
    )
  }

  if (data.myStats.pendingHours > 0) {
    attentionItems.push(
      <AttentionCard
        key="hours"
        delay={idx++ * 50}
        icon={<Hourglass className="h-4 w-4" />}
        title={`${fmtHours(data.myStats.pendingHours)}h awaiting review`}
        description="Your submitted service hours"
        onClick={() => setView("hours")}
      />
    )
  }

  // Tasks due soon / overdue
  const tasksWithDue = data.myTasks
    .filter((t) => t.status !== "done")
    .map((t) => ({ ...t, due: t.dueDate ? new Date(t.dueDate) : null }))
  const overdueTasks = tasksWithDue.filter(
    (t) => t.due && isPast(t.due) && !isToday(t.due)
  )
  const dueSoon = tasksWithDue
    .filter((t) => !t.due || !isPast(t.due) || isToday(t.due))
    .sort((a, b) => {
      if (!a.due) return 1
      if (!b.due) return -1
      return a.due.getTime() - b.due.getTime()
    })
    .slice(0, 3)
  const topTasks = [...overdueTasks.slice(0, 2), ...dueSoon].slice(0, 3)

  if (topTasks.length > 0) {
    const n = overdueTasks.length
    attentionItems.push(
      <AttentionCard
        key="tasks"
        delay={idx++ * 50}
        icon={<ClipboardList className="h-4 w-4" />}
        title={n > 0 ? `${n} overdue task${n === 1 ? "" : "s"}` : "Tasks due soon"}
        description={
          n > 0
            ? "Needs your attention"
            : `${data.myStats.tasksAssigned} open task${data.myStats.tasksAssigned === 1 ? "" : "s"} assigned`
        }
        onClick={() => setView("tasks")}
        urgent={n > 0}
      >
        <ul className="mt-2.5 space-y-1.5">
          {topTasks.map((t) => {
            const isOverdue = t.due && isPast(t.due) && !isToday(t.due)
            return (
              <li key={t.id} className="flex items-center gap-2 text-body">
                {isOverdue ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-danger-subtle0 shrink-0"
                    aria-label="Overdue"
                  />
                ) : (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-club shrink-0"
                    aria-label="Upcoming"
                  />
                )}
                <span className="truncate">{t.title}</span>
                {t.due && (
                  <span
                    className={cn(
                      "ml-auto text-caption shrink-0 tabular-nums",
                      isOverdue && "text-danger-foreground dark:text-danger-foreground font-medium"
                    )}
                  >
                    {format(t.due, "MMM d")}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </AttentionCard>
    )
  }

  // Pinned announcements (last 1-2)
  const pinned = data.recentAnnouncements.filter((a) => a.isPinned).slice(0, 2)
  if (pinned.length > 0) {
    attentionItems.push(
      <AttentionCard
        key="pinned"
        delay={idx++ * 50}
        icon={<Pin className="h-4 w-4" />}
        title="Pinned announcement"
        description={pinned.length > 1 ? `${pinned.length} pinned posts` : "From your club"}
        onClick={() => setView("announcements")}
      >
        <ul className="mt-2.5 space-y-1.5">
          {pinned.map((a) => (
            <li key={a.id} className="text-body truncate">
              {a.title}
            </li>
          ))}
        </ul>
      </AttentionCard>
    )
  }

  // Hours goal progress (for snapshot)
  const hoursPct =
    data.club.hoursGoal > 0
      ? Math.min(100, (data.myStats.approvedHours / data.club.hoursGoal) * 100)
      : 0

  // ---- Section bodies -----------------------------------------------------
  // Each card's inner JSX is extracted here so the member and exec layouts
  // can arrange them differently (different grid order / col-spans) without
  // duplicating the content.
  const chartBody = (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-club" />
          <h2 className="text-card-title">Approved hours · last 30 days</h2>
        </div>
        <Badge variant="secondary" className="text-xs tabular-nums">
          Total {fmtHours(data.hoursTrend.reduce((s, d) => s + d.hours, 0))}h
        </Badge>
      </div>
      {data.hoursTrend.every((d) => d.hours === 0) ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" />}
          title="No hours logged yet"
          description="Once hours are approved, you'll see a 30-day trend here."
        />
      ) : (
        <div
          className="h-56 w-full min-w-0"
          aria-label="Approved hours trend chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.hoursTrend}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="hoursGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--club-accent)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--club-accent)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                strokeOpacity={0.5}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "currentColor" }}
                tickFormatter={(d) => format(parseISO(d), "MMM d")}
                interval={Math.floor(data.hoursTrend.length / 6)}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "currentColor" }}
                allowDecimals={false}
                width={32}
                axisLine={false}
                tickLine={false}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border, 220 13% 91%))",
                  background: "hsl(var(--popover, 0 0% 100%))",
                  color: "hsl(var(--popover-foreground, 0 0% 0%))",
                  fontSize: 12,
                }}
                labelFormatter={(d) =>
                  format(parseISO(String(d)), "MMM d, yyyy")
                }
                formatter={(value: number) => [
                  `${fmtHours(value)}h`,
                  "Approved hours",
                ]}
              />
              <Area
                type="monotone"
                dataKey="hours"
                stroke="var(--club-accent)"
                strokeWidth={2}
                fill="url(#hoursGradient)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )

  const leaderboardBody = (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          <h2 className="text-card-title">Leaderboard</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setView("members")}
        >
          All <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      {data.leaderboard.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="No hours logged yet"
          description="Approved service hours will populate the leaderboard."
        />
      ) : (
        <ul className="space-y-1">
          {data.leaderboard.map((entry, i) => (
            <li key={entry.userId}>
              <button
                type="button"
                onClick={() => setView("members")}
                className={cn(
                  "flex items-center gap-3 w-full text-left rounded-lg px-2.5 py-2 hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === 0 && "bg-club-muted/30 ring-1 ring-club/20"
                )}
              >
                <RankBadge rank={i + 1} />
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={entry.avatarUrl ?? undefined}
                    alt={entry.name}
                  />
                  <AvatarFallback
                    className={cn("text-xs", avatarColor(entry.name))}
                  >
                    {initials(entry.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-body-medium truncate">{entry.name}</p>
                  <p className="text-caption tabular-nums">
                    {fmtHours(entry.hours)} hours
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  const snapshotBody = (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-club" />
          <h2 className="text-card-title">Your snapshot</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setView("hours")}
        >
          Hours <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {/* Approved hours + goal */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-body-medium">Approved hours</span>
          </div>
          <span className="text-numeral">
            {fmtHours(data.myStats.approvedHours)}h
          </span>
        </div>
        {data.club.hoursGoal > 0 && (
          <>
            <Progress
              value={hoursPct}
              className="h-1.5 [&_[data-slot=progress-indicator]]:bg-club"
            />
            <p className="text-caption tabular-nums">
              {fmtHours(data.myStats.approvedHours)} of {data.club.hoursGoal}h
              goal · {Math.round(hoursPct)}%
            </p>
          </>
        )}
      </div>

      <Separator className="my-4" />

      {/* Tasks */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <span className="text-body-medium">Tasks</span>
        </div>
        <span className="text-caption-medium tabular-nums">
          <span className="text-foreground font-medium">
            {data.myStats.tasksAssigned}
          </span>{" "}
          open
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="text-foreground font-medium">
            {data.myStats.tasksDone}
          </span>{" "}
          done
        </span>
      </div>

      <Separator className="my-4" />

      {/* Next meetings */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-body-medium">Next meetings</span>
        </div>
        {data.upcomingMeetings.length === 0 ? (
          <p className="text-caption">No upcoming meetings</p>
        ) : (
          <ul className="space-y-1.5">
            {data.upcomingMeetings.slice(0, 3).map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-body truncate">{m.title}</span>
                <span className="text-caption shrink-0 tabular-nums">
                  {format(new Date(m.startTime), "MMM d")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )

  const announcementsBody = (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-card-title">Recent announcements</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setView("announcements")}
        >
          All <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      {data.recentAnnouncements.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="No announcements yet"
          description="Share updates with your club to keep members in the loop."
        />
      ) : (
        <ul className="space-y-2">
          {data.recentAnnouncements.slice(0, 3).map((a) => (
            <li
              key={a.id}
              className="rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start gap-2">
                {a.isPinned && (
                  <Pin className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-body-medium truncate">{a.title}</p>
                  <p className="text-caption mt-0.5">
                    {a.authorName} · {relativeTime(a.createdAt)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  const meetingsBody = (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-card-title">Upcoming meetings</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setView("meetings")}
        >
          All <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      {data.upcomingMeetings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="No upcoming meetings"
          description="Schedule a meeting to get the team together."
        />
      ) : (
        <ul className="space-y-2">
          {data.upcomingMeetings.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-body-medium truncate">{m.title}</p>
                  <div className="mt-1 flex items-center gap-1 text-caption">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{m.location}</span>
                  </div>
                </div>
                {m.myRsvp && <RsvpBadge status={m.myRsvp} />}
              </div>
              <p className="mt-1 text-caption tabular-nums">
                {format(new Date(m.startTime), "EEE, MMM d · h:mm a")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  const clubStatsBody = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold tabular-nums">{data.clubStats.totalMembers}</span>
        <span className="text-muted-foreground">members</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold tabular-nums">{fmtHours(data.clubStats.totalApprovedHours)}h</span>
        <span className="text-muted-foreground">approved</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold tabular-nums">{data.clubStats.openTasks}</span>
        <span className="text-muted-foreground">open tasks</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-semibold tabular-nums">{data.clubStats.upcomingMeetingsCount}</span>
        <span className="text-muted-foreground">meetings</span>
      </span>
      {isExec && data.clubStats.pendingApprovals > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold tabular-nums">{data.clubStats.pendingApprovals}</span>
          <span className="text-muted-foreground">pending</span>
        </span>
      )}
    </div>
  )

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {/* Row 1 — Hero panel (60%) + Progress ring tile (40%) ----------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <HeroPanel
          name={data.club.name}
          logoUrl={data.club.logoUrl}
          memberCount={data.club.memberCount}
          createdAt={data.club.createdAt}
          role={data.myRole}
          approvedHours={data.myStats.approvedHours}
          hoursGoal={data.club.hoursGoal}
          hoursPct={hoursPct}
          hoursTrend={data.hoursTrend}
        />
        <ProgressRingTile
          approvedHours={data.myStats.approvedHours}
          hoursGoal={data.club.hoursGoal}
          hoursPct={hoursPct}
          hoursTrend={data.hoursTrend}
          onViewHours={() => setView("hours")}
        />
      </div>

      {/* Row 2 — Tier 1 attention items (or onboarding banner) ---------------- */}
      {showOnboarding ? (
        <OnboardingBanner
          clubCode={currentClub?.clubCode ?? null}
          onDismiss={dismissOnboarding}
          onNavigate={setView}
          teamsCount={data.clubStats.teamsCount}
          announcementsCount={
            data.recentAnnouncements.length + data.clubStats.announcementsThisMonth
          }
          meetingsCount={data.clubStats.upcomingMeetingsCount}
          memberCount={data.club.memberCount}
        />
      ) : showMemberOnboarding ? (
        <MemberOnboardingCard onNavigate={setView} onDismiss={dismissMemberOnboarding} />
      ) : attentionItems.length === 0 ? (
        <AllCaughtUpCard />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {attentionItems}
        </div>
      )}

      {/* Rows 3+4 — Supporting tiles in asymmetric bento grid.
          Role-aware: members get snapshot → announcements → meetings → chart →
          leaderboard (their own work first, club context later). Execs keep the
          original chart-first layout (they want the pulse of the club at a
          glance). The `{!isExec ? … : …}` pattern keeps the two layouts as
          explicit siblings rather than conditional class swaps. */}
      {!isExec ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Your snapshot — first */}
          <section
            className={cn(TILE, "lg:col-span-4 order-1 lg:order-1")}
           
          >
            {snapshotBody}
          </section>
          {/* Announcements — second */}
          <section
            className={cn(TILE, "lg:col-span-4 order-2 lg:order-2")}
           
          >
            {announcementsBody}
          </section>
          {/* Upcoming meetings — third */}
          <section
            className={cn(TILE, "lg:col-span-4 order-3 lg:order-3")}
           
          >
            {meetingsBody}
          </section>
          {/* Hours trend chart — fourth (wide) */}
          <section
            className={cn(TILE, "lg:col-span-8 order-4 lg:order-4")}
           
          >
            {chartBody}
          </section>
          {/* Leaderboard — fifth (narrow, tall) */}
          <section
            className={cn(TILE, "lg:col-span-4 order-5 lg:order-5")}
           
          >
            {leaderboardBody}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Hours trend (Tier 3) — desktop: row 1, cols 1-8 (wide) */}
          <section
            className={cn(TILE, "lg:col-span-8 order-2 lg:order-1")}
           
          >
            {chartBody}
          </section>

          {/* Leaderboard (Tier 3) — desktop: row 1, cols 9-12 (narrow, tall) */}
          <section
            className={cn(TILE, "lg:col-span-4 order-3 lg:order-2")}
           
          >
            {leaderboardBody}
          </section>

          {/* Your snapshot (Tier 2) — desktop: row 2, cols 1-4; mobile: first */}
          <section
            className={cn(TILE, "lg:col-span-4 order-1 lg:order-3")}
           
          >
            {snapshotBody}
          </section>

          {/* Recent announcements (Tier 3) — desktop: row 2, cols 5-8 */}
          <section
            className={cn(TILE, "lg:col-span-4 order-4 lg:order-4")}
           
          >
            {announcementsBody}
          </section>

          {/* Upcoming meetings (Tier 3) — desktop: row 2, cols 9-12 */}
          <section
            className={cn(TILE, "lg:col-span-4 order-5 lg:order-5")}
           
          >
            {meetingsBody}
          </section>
        </div>
      )}

      {/* Row 5 — Club-wide stats mini-strip (exec only) --------------------- */}
      {isExec && (
        <section
          className={cn(TILE_COMPACT, "")}
         
        >
          {clubStatsBody}
        </section>
      )}

      {/* Row 6 (execs only) — Executive insights wide strip ---------------- */}
      {isExec && data.execStats && (
        <section
          className={cn(TILE_COMPACT, "")}
         
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-club-ink" />
            <h2 className="text-card-title">Executive insights</h2>
            <span className="text-caption ml-1">This week</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <ExecMetric
              label="Pending approvals"
              value={String(data.clubStats.pendingApprovals)}
              hint={
                data.clubStats.pendingApprovals > 0
                  ? "Needs review"
                  : "All caught up"
              }
              urgent={data.clubStats.pendingApprovals > 0}
              onClick={() => setView("approvals")}
            />
            <ExecMetric
              label="Avg turnaround"
              value={formatTurnaround(
                data.execStats.avgApprovalTurnaroundHours
              )}
              hint="Submission → review"
            />
            <ExecMetric
              label="Completion rate"
              value={`${data.execStats.taskCompletionRate}%`}
              hint={`${data.clubStats.tasksDone}/${
                data.clubStats.openTasks + data.clubStats.tasksDone
              } done`}
            />
            <ExecMetric
              label="Submissions / wk"
              value={String(data.execStats.submissionsThisWeek)}
              hint="New entries"
            />
            <ExecMetric
              label="Announcements"
              value={String(data.clubStats.announcementsThisMonth)}
              hint="This month"
              onClick={() => setView("announcements")}
            />
            <ExecMetric
              label="Teams"
              value={String(data.clubStats.teamsCount)}
              hint="Active"
              onClick={() => setView("teams")}
            />
          </div>
        </section>
      )}

      {/* §41 — Hours milestone celebration. Mounts the confetti overlay so it
          fires when the user's approved hours cross a round milestone
          (50/100/250/500) since the last time they viewed the dashboard. */}
      <HoursMilestoneCelebration
        clubId={clubId}
        approvedHours={data.myStats.approvedHours}
      />
    </div>
  )
}

// =========================================================================
// §41 — Hours milestone celebration
// =========================================================================
//
// When the viewer lands on the dashboard and their approved-hours total has
// crossed a new round milestone (50, 100, 250, 500) since their last visit,
// pop a brief celebratory confetti burst. Uses the same `badge-confetti-piece`
// keyframes/CSS class as the badge award popup so the visual matches.
//
// The "last seen" baseline is stored in localStorage under
// `last-hours-milestone-${clubId}`. On first run (no value stored), we seed
// it to the current approved-hours ceiling so we don't surprise the user
// with confetti for hours they were already aware of.

function buildConfettiPieces(count: number) {
  return Array.from({ length: count }).map(() => ({
    left: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 250,
    duration: 1800 + Math.random() * 900,
    x: (Math.random() - 0.5) * 220,
    rotate: Math.random() * 360,
  }))
}

function HoursMilestoneCelebration({
  clubId,
  approvedHours,
}: {
  clubId: string
  approvedHours: number
}) {
  const [milestone, setMilestone] = useState<number | null>(null)
  const [pieces] = useState(() => buildConfettiPieces(28))

  useEffect(() => {
    if (!clubId) return
    let cancelled = false

    // Find the highest milestone the user has now crossed.
    const highestCrossed = HOURS_MILESTONES.reduce<number>((acc, m) => {
      if (approvedHours >= m) return m
      return acc
    }, 0)

    // Read the last-seen milestone baseline.
    const storageKey = `last-hours-milestone-${clubId}`
    let lastSeen = 0
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = parseInt(raw, 10)
        if (!isNaN(parsed)) lastSeen = parsed
      }
    } catch {
      // localStorage unavailable — bail silently.
      return
    }

    if (lastSeen === 0) {
      // First run — seed baseline to the current ceiling. Don't pop confetti
      // for hours the user already had before they ever saw the dashboard.
      try {
        localStorage.setItem(storageKey, String(highestCrossed))
      } catch {
        // ignore
      }
      return
    }

    if (highestCrossed > lastSeen) {
      // New milestone crossed! Pop confetti for the highest new one.
      // Defer the state update to avoid SSR/tearing concerns.
      Promise.resolve().then(() => {
        if (cancelled) return
        setMilestone(highestCrossed)
        try {
          localStorage.setItem(storageKey, String(highestCrossed))
        } catch {
          // ignore
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [clubId, approvedHours])

  // Auto-dismiss after 4.5s.
  useEffect(() => {
    if (milestone === null) return
    const t = setTimeout(() => setMilestone(null), 4500)
    return () => clearTimeout(t)
  }, [milestone])

  function dismiss() {
    setMilestone(null)
  }

  if (milestone === null) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`You reached ${milestone} service hours`}
    >
      {/* Dim backdrop — click anywhere to dismiss */}
      <button
        type="button"
        aria-label="Dismiss hours celebration"
        onClick={dismiss}
        className="absolute inset-0 w-full h-full bg-black/50 backdrop-blur-sm cursor-default"
      />

      {/* Confetti layer — pointer-events-none so it never blocks clicks.
          Reuses the `.badge-confetti-piece` keyframe in globals.css. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="badge-confetti-piece"
            style={{
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              transform: `rotate(${p.rotate}deg)`,
              ["--confetti-x" as string]: `${p.x}px`,
            } as CSSProperties}
          />
        ))}
      </div>

      {/* Center card */}
      <div className="relative pointer-events-auto rounded-xl border bg-background shadow-2xl px-6 py-6 max-w-sm w-full text-center animate-badge-pop">
        <div className="flex justify-center mb-2" aria-hidden>
          <PartyPopper className="h-10 w-10 text-club" />
        </div>
        <h2 className="text-lg font-semibold">{milestone} service hours! 🎉</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          You&apos;ve crossed the{" "}
          <span className="font-semibold text-foreground">{milestone}-hour</span>{" "}
          milestone in this club. Thank you for your contributions.
        </p>
        <Button variant="club" className="mt-4" onClick={dismiss}>
          Nice!
        </Button>
      </div>
    </div>
  )
}

// =========================================================================
// Sub-components
// =========================================================================

function HeroPanel({
  name,
  logoUrl,
  memberCount,
  createdAt,
  role,
  approvedHours,
  hoursGoal,
  hoursPct,
  hoursTrend,
}: {
  name: string
  logoUrl: string | null
  memberCount: number
  createdAt: string
  role: "member" | "executive"
  approvedHours: number
  hoursGoal: number
  hoursPct: number
  hoursTrend: { date: string; hours: number }[]
}) {
  return (
    <section
      className={cn(
        "bg-accent-tint relative overflow-hidden rounded-xl border border-border",
        "",
        "lg:col-span-7 p-5 sm:p-6 transition-all duration-200"
      )}
    >
      {/* §38 — Club cover identity. A subtle accent gradient strip pinned
          to the top of the hero panel so each club has a visual "cover"
          identity in its accent color. Fades from the full accent on the
          left to transparent on the right. Sits above the dot-grid texture
          so it reads cleanly. */}
      <div
        aria-hidden
        className="absolute left-0 top-0 h-1 w-full from-club via-club/50 to-transparent"
      />
      {/* Barely-visible dot-grid texture overlay (matches the auth-screen
          pattern but at opacity 0.05 for an even quieter feel). */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          color: "var(--foreground)",
          opacity: 0.05,
        }}
      />
      {/* Accent edge — subtle vertical bar pinned to the left edge, curved top/bottom. */}
      <div
        aria-hidden
        className="absolute left-0 top-0 h-full w-1.5 bg-club rounded-l-2xl"
      />

      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {/* Larger logo / initials tile (was h-10 w-10 rounded-lg, now
              h-12 w-12 rounded-xl for more visual presence in the bento
              hero). */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-club text-club-foreground text-sm font-bold shrink-0 overflow-hidden">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${name} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              initials(name)
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* min-w-0 lets truncate win inside a flex-wrap container so
                  very long club names ellipsize cleanly on narrow viewports
                  (e.g. 375px) instead of pushing the role badge off-screen. */}
              <h1 className="text-page-title truncate min-w-0">{name}</h1>
              <RoleBadgePill role={role} />
            </div>
            <p className="text-caption mt-1">
              {memberCount} {memberCount === 1 ? "member" : "members"} · joined{" "}
              {format(new Date(createdAt), "MMM yyyy")}
            </p>
          </div>
        </div>
      </div>

      {/* Personal progress element — inline hours summary with either a thin
          Progress bar (when a goal is set) or a tiny sparkline (no goal). */}
      <div className="relative mt-5 pt-4 border-t border-border/60">
        <div className="flex items-baseline justify-between mb-2 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 text-club shrink-0" />
            <span className="text-body-medium truncate">Your hours</span>
          </div>
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-xl font-bold tabular-nums">
              {fmtHours(approvedHours)}h
            </span>
            {hoursGoal > 0 && (
              <span className="text-caption">of {hoursGoal}h goal</span>
            )}
          </div>
        </div>
        {hoursGoal > 0 ? (
          <Progress
            value={hoursPct}
            className="h-1.5 [&_[data-slot=progress-indicator]]:bg-club"
          />
        ) : (
          <div className="h-9 max-w-[240px]">
            <Sparkline data={hoursTrend} />
          </div>
        )}
      </div>
    </section>
  )
}

function ProgressRingTile({
  approvedHours,
  hoursGoal,
  hoursPct,
  hoursTrend,
  onViewHours,
}: {
  approvedHours: number
  hoursGoal: number
  hoursPct: number
  hoursTrend: { date: string; hours: number }[]
  onViewHours?: () => void
}) {
  // Two states: goal set → SVG progress ring; no goal → big number + sparkline.
  const Comp = onViewHours ? "button" : "div"
  return (
    <Comp
      type={onViewHours ? "button" : undefined}
      onClick={onViewHours}
      className={cn(
        "border border-club/20 bg-club-subtle rounded-xl p-6 text-left flex flex-col transition-all duration-200 lg:col-span-5",
        onViewHours && "hover:border-club/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {hoursGoal > 0 ? (
            <Target className="h-4 w-4 text-club shrink-0" />
          ) : (
            <TrendingUp className="h-4 w-4 text-club shrink-0" />
          )}
          <h2 className="text-card-title truncate">
            {hoursGoal > 0 ? "Hours toward goal" : "Approved hours"}
          </h2>
        </div>
        {onViewHours && (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {hoursGoal > 0 ? (
        <div className="flex items-center gap-5 flex-1">
          {/* SVG progress ring — perfect circle with rounded caps + track. */}
          <ProgressRing
            percent={hoursPct}
            label={`${fmtHours(approvedHours)}h`}
            sublabel={`of ${hoursGoal}h`}
          />
          <div className="flex-1 min-w-0">
            <div className="text-2xl font-bold tabular-nums">
              {Math.round(hoursPct)}%
            </div>
            <p className="text-caption mt-1">
              {hoursPct >= 100
                ? "Goal achieved! 🎉"
                : `${fmtHours(Math.max(0, hoursGoal - approvedHours))}h to go`}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-numeral">
            {fmtHours(approvedHours)}h
          </div>
          <p className="text-caption mt-1 mb-3">Approved · last 30 days</p>
          <div className="h-10 max-w-[280px]">
            <Sparkline data={hoursTrend} />
          </div>
        </div>
      )}
    </Comp>
  )
}

function RoleBadgePill({ role }: { role: "member" | "executive" }) {
  if (role === "executive") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-club-subtle border-club/20 px-2 py-0.5 text-xs font-medium text-club-ink">
        <ShieldCheck className="h-3 w-3" /> Executive
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-club/30 bg-club-muted px-2 py-0.5 text-xs font-medium text-club">
      <Users className="h-3 w-3" /> Member
    </span>
  )
}

function AttentionCard({
  icon,
  title,
  description,
  onClick,
  children,
  delay,
  urgent,
}: {
  icon: ReactNode
  title: string
  description?: string
  onClick?: () => void
  children?: ReactNode
  delay?: number
  urgent?: boolean
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={delay ? { animationDelay: `${delay}ms`, animationFillMode: "backwards" } : undefined}
      className={cn(
        "border border-border bg-card rounded-xl p-4 text-left border-l-2 border-l-club transition-all duration-200",
        onClick &&
          "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        urgent && "border-l-red-500"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-0.5 shrink-0", urgent ? "text-danger" : "text-club")}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-card-title truncate">{title}</p>
          {description && <p className="text-caption mt-0.5">{description}</p>}
          {children}
        </div>
      </div>
    </Comp>
  )
}

function AllCaughtUpCard() {
  return (
    <p className="text-sm text-muted-foreground py-2">
      Nothing needs your attention right now.
    </p>
  )
}

function OnboardingBanner({
  clubCode,
  onDismiss,
  onNavigate,
  teamsCount,
  announcementsCount,
  meetingsCount,
  memberCount,
}: {
  clubCode: string | null
  onDismiss: () => void
  onNavigate: (v: View) => void
  teamsCount: number
  announcementsCount: number
  meetingsCount: number
  memberCount: number
}) {
  const items: { done: boolean; label: string; view: View }[] = [
    { done: teamsCount > 0, label: "Create a team", view: "teams" },
    {
      done: announcementsCount > 0,
      label: "Post an announcement",
      view: "announcements",
    },
    {
      done: meetingsCount > 0,
      label: "Schedule a meeting",
      view: "meetings",
    },
    {
      done: memberCount >= 3,
      label: clubCode ? `Invite members (code: ${clubCode})` : "Invite members",
      view: "members",
    },
  ]
  return (
    <div className="border border-club/30 bg-club-muted/40 rounded-xl p-5 relative transition-all duration-200">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss onboarding banner"
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 mb-1 pr-8">
        <PartyPopper className="h-4 w-4 text-club shrink-0" />
        <h2 className="text-section-title">Welcome! Let&apos;s set up your club</h2>
      </div>
      <p className="text-caption text-muted-foreground mb-4">
        A few quick steps will get your members engaged.
      </p>
      <ul className="grid sm:grid-cols-2 gap-2">
        {items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onNavigate(it.view)}
              className="flex items-center gap-2 w-full text-left rounded-lg border bg-card/60 px-3 py-2 hover:bg-accent/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {it.done ? (
                <CheckCircle2 className="h-4 w-4 text-club shrink-0" />
              ) : (
                <Target className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span
                className={cn("text-body", it.done && "text-muted-foreground line-through")}
              >
                {it.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MemberOnboardingCard — gentle "Getting started" card for first-time members.
// Shown only when the member has no tasks, no hours, and no RSVPs.
// ---------------------------------------------------------------------------

const MEMBER_ONBOARDING_ITEMS: { view: View; label: string; icon: ReactNode }[] = [
  { view: "announcements", label: "Check announcements", icon: <Megaphone className="h-4 w-4" /> },
  { view: "tasks", label: "See your tasks", icon: <ListChecks className="h-4 w-4" /> },
  { view: "hours", label: "Log service hours", icon: <Clock className="h-4 w-4" /> },
]

function MemberOnboardingCard({
  onNavigate,
  onDismiss,
}: {
  onNavigate: (v: View) => void
  onDismiss: () => void
}) {
  return (
    <div className="bg-club-muted/40 rounded-xl p-5 relative transition-all duration-200">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss getting started card"
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 mb-1 pr-8">
        <Target className="h-4 w-4 text-club shrink-0" />
        <h2 className="text-section-title">Getting started</h2>
      </div>
      <p className="text-caption text-muted-foreground mb-4">
        New here? A few quick links to get you up to speed.
      </p>
      <ul className="grid sm:grid-cols-3 gap-2">
        {MEMBER_ONBOARDING_ITEMS.map((it) => (
          <li key={it.view}>
            <button
              type="button"
              onClick={() => onNavigate(it.view)}
              className="flex items-center gap-2 w-full text-left rounded-lg border bg-card/60 px-3 py-2.5 min-h-[44px] hover:bg-accent/50 hover:border-club/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-club-muted/60 text-club shrink-0">
                {it.icon}
              </span>
              <span className="text-body font-medium">{it.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1
      ? "bg-warning-subtle text-warning-foreground dark:bg-warning-subtle dark:text-warning-foreground border-warning/30 dark:border-amber-900"
      : rank === 2
      ? "bg-muted bg-muted text-muted-foreground border-border"
      : rank === 3
      ? "bg-warning-subtle text-warning-foreground dark:bg-warning-subtle dark:text-warning-foreground border-orange-200 dark:border-orange-900"
      : "bg-muted text-muted-foreground border-border"
  return (
    <span
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold shrink-0 tabular-nums",
        styles
      )}
    >
      {rank}
    </span>
  )
}

function RsvpBadge({ status }: { status: "going" | "not_going" | "maybe" }) {
  const map: Record<string, { label: string; className: string }> = {
    going: { label: "Going", className: "chip-approved" },
    not_going: { label: "Not going", className: "chip-rejected" },
    maybe: { label: "Maybe", className: "chip-pending" },
  }
  const s = map[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
        s.className
      )}
    >
      {s.label}
    </span>
  )
}

function ClubStat({
  label,
  value,
  icon,
  onClick,
}: {
  label: string
  value: string
  icon: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent/40 hover:border-club/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </button>
  )
}

function ExecMetric({
  label,
  value,
  hint,
  urgent,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  urgent?: boolean
  onClick?: () => void
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border bg-card/40 px-3 py-2 transition-colors w-full",
        onClick &&
          "hover:bg-accent/40 hover:border-club/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        urgent && "border-amber-300 dark:border-amber-800 bg-warning-subtle/50 dark:bg-warning-subtle"
      )}
    >
      <p className="text-caption ">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-caption mt-0.5">{hint}</p>}
    </Comp>
  )
}

// =========================================================================
// Helpers
// =========================================================================
function fmtHours(h: number) {
  if (h === 0) return "0"
  if (Number.isInteger(h)) return String(h)
  return parseFloat(h.toFixed(2)).toString()
}

function formatTurnaround(hours: number | null) {
  if (hours === null || hours === undefined) return "—"
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 24) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

// Bucket a 30-day hours trend down to 7 evenly-spaced points (sum per bucket)
// so the inline SVG sparkline has a manageable number of vertices.
function bucketToSeven(trend: { date: string; hours: number }[]): number[] {
  const zeros = [0, 0, 0, 0, 0, 0, 0]
  if (trend.length === 0) return zeros
  if (trend.length <= 7) {
    return [...trend.map((d) => d.hours), ...Array(7 - trend.length).fill(0)]
  }
  const buckets: number[] = []
  const bucketSize = trend.length / 7
  for (let i = 0; i < 7; i++) {
    const start = Math.floor(i * bucketSize)
    const end = Math.max(Math.floor((i + 1) * bucketSize), start + 1)
    const slice = trend.slice(start, end)
    buckets.push(slice.reduce((s, d) => s + d.hours, 0))
  }
  return buckets
}

// Tiny inline-SVG sparkline (no recharts). 7 data points, smooth bezier
// curve, gradient area fill, and a crisp end dot rendered as an HTML
// element (so it never gets distorted into an ellipse by non-uniform
// SVG scaling). Fills its container width via a responsive viewBox.
function Sparkline({
  data,
  className,
}: {
  data: { date: string; hours: number }[]
  className?: string
}) {
  const points = bucketToSeven(data)
  const max = Math.max(...points, 1)
  const w = 100
  const h = 40
  const padX = 2
  const padY = 4
  const usableW = w - padX * 2
  const usableH = h - padY * 2
  const step = points.length > 1 ? usableW / (points.length - 1) : usableW
  const yFor = (v: number) => padY + usableH - (v / max) * usableH

  // Build smooth bezier path through the points (Catmull-Rom → cubic).
  const coords = points.map((p, i) => ({
    x: padX + i * step,
    y: yFor(p),
  }))
  let lineD = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2 < coords.length ? i + 2 : coords.length - 1]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    lineD += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  const baselineY = padY + usableH
  const areaD = `${lineD} L ${coords[coords.length - 1].x.toFixed(2)} ${baselineY} L ${coords[0].x.toFixed(2)} ${baselineY} Z`

  const last = coords[coords.length - 1]
  const dotLeftPct = (last.x / w) * 100
  const dotTopPct = (last.y / h) * 100

  return (
    <div className={cn("relative h-full w-full", className)}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="overflow-visible block"
        aria-hidden
      >
        <defs>
          <linearGradient id="spark-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--club-accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--club-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#spark-area)" />
        <path
          d={lineD}
          stroke="var(--club-accent)"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* End dot rendered in HTML so it stays a perfect circle regardless
          of the SVG’s non-uniform scaling. */}
      <span
        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-club ring-2 ring-background"
        style={{
          left: `${dotLeftPct}%`,
          top: `${dotTopPct}%`,
        }}
      />
    </div>
  )
}

// SVG progress ring — a perfect circle every time (no conic-gradient
// distortion). Track + accent arc with rounded caps, value centered.
function ProgressRing({
  percent,
  size = 80,
  stroke = 7,
  label,
  sublabel,
}: {
  percent: number
  size?: number
  stroke?: number
  label?: string
  sublabel?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = c * (1 - clamped / 100)
  const gid = "ring-grad"
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped)}% complete`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block -rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--club-accent)" />
            <stop offset="100%" stopColor="var(--club-accent-2, var(--club-accent))" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="text-base font-bold tabular-nums leading-none">
            {label ?? `${Math.round(clamped)}%`}
          </div>
          {sublabel && (
            <div className="text-xs text-muted-foreground mt-1 tabular-nums">
              {sublabel}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =========================================================================
// Loading skeleton — matches new bento-grid layout
// =========================================================================
function DashboardSkeleton() {
  const tile =
    "border border-border bg-card rounded-xl animate-pulse"
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Row 1 — Hero panel + Progress ring tile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div className={cn(tile, "lg:col-span-7 h-32")} />
        <div className={cn(tile, "lg:col-span-5 h-32")} />
      </div>
      {/* Tier 1 strip — 4 tighter tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      {/* Chart + Leaderboard row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div className={cn(tile, "p-5 lg:col-span-8 h-64")} />
        <div className={cn(tile, "p-5 lg:col-span-4 h-64")} />
      </div>
      {/* Snapshot + Announcements + Meetings row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <div className={cn(tile, "p-5 lg:col-span-4 h-56")} />
        <div className={cn(tile, "p-5 lg:col-span-4 h-56")} />
        <div className={cn(tile, "p-5 lg:col-span-4 h-56")} />
      </div>
      {/* Exec insights wide strip */}
      <div className={cn(tile, "p-4 h-24")} />
    </div>
  )
}
