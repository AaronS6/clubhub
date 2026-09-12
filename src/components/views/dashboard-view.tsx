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

/** Inline style for staggered fade-in cascade. */
function stagger(i: number): CSSProperties {
  return {
    animationDelay: `${i * 50}ms`,
    animationFillMode: "backwards",
  }
}

// =========================================================================
// Main component
// =========================================================================
export function DashboardView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const setView = useAppStore((s) => s.setView)
  const currentClub = useAppStore((s) => s.currentClub)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

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
      } catch {
        setOnboardingDismissed(false)
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

  const dismissOnboarding = () => {
    try {
      localStorage.setItem(`onboarding-dismissed-${clubId}`, "true")
    } catch {
      /* ignore */
    }
    setOnboardingDismissed(true)
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
                    className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"
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
                      isOverdue && "text-red-600 dark:text-red-400 font-medium"
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
          <Trophy className="h-4 w-4 text-amber-500" />
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
          <span className="text-card-title tabular-nums">
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
                  <Pin className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
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
    <>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-card-title">Club at a glance</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ClubStat
          label="Members"
          value={String(data.clubStats.totalMembers)}
          icon={<Users className="h-3.5 w-3.5" />}
          onClick={() => setView("members")}
        />
        <ClubStat
          label="Total hours"
          value={fmtHours(data.clubStats.totalApprovedHours)}
          icon={<Clock className="h-3.5 w-3.5" />}
          onClick={() => setView("hours")}
        />
        <ClubStat
          label="Open tasks"
          value={String(data.clubStats.openTasks)}
          icon={<ClipboardList className="h-3.5 w-3.5" />}
          onClick={() => setView("tasks")}
        />
        <ClubStat
          label="Upcoming meetings"
          value={String(data.clubStats.upcomingMeetingsCount)}
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          onClick={() => setView("meetings")}
        />
      </div>
    </>
  )

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {/* Row 1 — Slim hero bar --------------------------------------------- */}
      <HeroBar
        name={data.club.name}
        logoUrl={data.club.logoUrl}
        memberCount={data.club.memberCount}
        createdAt={data.club.createdAt}
        role={data.myRole}
      />

      {/* Row 2 — Tier 1 (or onboarding banner) ----------------------------- */}
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
      ) : attentionItems.length === 0 ? (
        <AllCaughtUpCard />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {attentionItems}
        </div>
      )}

      {/* Rows 3+4 — chart + leaderboard + snapshot + announcements + meetings
          Role-aware: members get snapshot → announcements → meetings → chart →
          leaderboard (their own work first, club context later). Execs keep the
          original chart-first layout (they want the pulse of the club at a
          glance). The `{!isExec ? … : …}` pattern keeps the two layouts as
          explicit siblings rather than conditional class swaps. */}
      {!isExec ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Your snapshot — first */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-1 lg:order-1 animate-fade-in"
            style={stagger(0)}
          >
            {snapshotBody}
          </section>
          {/* Announcements — second */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-2 lg:order-2 animate-fade-in"
            style={stagger(1)}
          >
            {announcementsBody}
          </section>
          {/* Upcoming meetings — third */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-3 lg:order-3 animate-fade-in"
            style={stagger(2)}
          >
            {meetingsBody}
          </section>
          {/* Hours trend chart — fourth */}
          <section
            className="card-quiet p-5 lg:col-span-8 order-4 lg:order-4 animate-fade-in"
            style={stagger(3)}
          >
            {chartBody}
          </section>
          {/* Leaderboard — fifth */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-5 lg:order-5 animate-fade-in"
            style={stagger(4)}
          >
            {leaderboardBody}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Hours trend (Tier 3) — desktop: row 1, cols 1-8 */}
          <section
            className="card-quiet p-5 lg:col-span-8 order-2 lg:order-1 animate-fade-in"
            style={stagger(2)}
          >
            {chartBody}
          </section>

          {/* Leaderboard (Tier 3) — desktop: row 1, cols 9-12 */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-3 lg:order-2 animate-fade-in"
            style={stagger(3)}
          >
            {leaderboardBody}
          </section>

          {/* Your snapshot (Tier 2) — desktop: row 2, cols 1-4; mobile: first */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-1 lg:order-3 animate-fade-in"
            style={stagger(0)}
          >
            {snapshotBody}
          </section>

          {/* Recent announcements (Tier 3) — desktop: row 2, cols 5-8 */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-4 lg:order-4 animate-fade-in"
            style={stagger(4)}
          >
            {announcementsBody}
          </section>

          {/* Upcoming meetings (Tier 3) — desktop: row 2, cols 9-12 */}
          <section
            className="card-quiet p-5 lg:col-span-4 order-5 lg:order-5 animate-fade-in"
            style={stagger(5)}
          >
            {meetingsBody}
          </section>
        </div>
      )}

      {/* Row 5 — Club-wide stats mini-strip (exec only) --------------------- */}
      {isExec && (
        <section
          className="card-quiet p-4 animate-fade-in"
          style={stagger(6)}
        >
          {clubStatsBody}
        </section>
      )}

      {/* Row 6 (execs only) — Executive insights compact strip ---------------- */}
      {isExec && data.execStats && (
        <section
          className="card-quiet p-4 animate-fade-in"
          style={stagger(7)}
        >
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
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
    </div>
  )
}

// =========================================================================
// Sub-components
// =========================================================================

function HeroBar({
  name,
  logoUrl,
  memberCount,
  createdAt,
  role,
}: {
  name: string
  logoUrl: string | null
  memberCount: number
  createdAt: string
  role: "member" | "executive"
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-club-muted to-transparent animate-fade-in">
      <div aria-hidden className="absolute left-0 top-0 h-full w-1.5 bg-club" />
      <div className="flex items-center justify-between gap-4 p-4 sm:p-5 pl-5 sm:pl-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-club text-club-foreground text-xs font-bold shrink-0 overflow-hidden">
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
            <p className="text-caption mt-0.5">
              {memberCount} {memberCount === 1 ? "member" : "members"} · joined{" "}
              {format(new Date(createdAt), "MMM yyyy")}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoleBadgePill({ role }: { role: "member" | "executive" }) {
  if (role === "executive") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
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
        "card-quiet p-4 text-left border-l-2 border-l-club animate-fade-in transition-colors",
        onClick &&
          "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        urgent && "border-l-red-500"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-0.5 shrink-0", urgent ? "text-red-500" : "text-club")}
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
    <div className="card-quiet p-5 flex items-center gap-4 animate-fade-in">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-club-muted text-club shrink-0">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-card-title">You&apos;re all caught up</p>
        <p className="text-caption mt-0.5">
          Nothing needs your attention right now.
        </p>
      </div>
    </div>
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
    <div className="card-quiet p-5 bg-club-muted/40 border-club/30 animate-fade-in relative">
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

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-900"
      : rank === 2
      ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700"
      : rank === 3
      ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 border-orange-200 dark:border-orange-900"
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
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
        <span className="text-caption-medium uppercase tracking-wide">
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
        urgent && "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
      )}
    >
      <p className="text-caption uppercase tracking-wide">{label}</p>
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

// =========================================================================
// Loading skeleton — matches new bento-grid layout
// =========================================================================
function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero bar */}
      <div className="card-quiet h-20 animate-pulse" />
      {/* Tier 1 strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      {/* Chart + Leaderboard row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="card-quiet p-5 lg:col-span-8 h-64 animate-pulse" />
        <div className="card-quiet p-5 lg:col-span-4 h-64 animate-pulse" />
      </div>
      {/* Snapshot + Announcements + Meetings row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="card-quiet p-5 lg:col-span-4 h-56 animate-pulse" />
        <div className="card-quiet p-5 lg:col-span-4 h-56 animate-pulse" />
        <div className="card-quiet p-5 lg:col-span-4 h-56 animate-pulse" />
      </div>
      {/* Club stats strip */}
      <div className="card-quiet p-4 h-24 animate-pulse" />
    </div>
  )
}
