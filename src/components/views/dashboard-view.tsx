"use client"

import { useEffect, useState, type ReactNode } from "react"
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
  EmptyState, initials, relativeTime, avatarColor,
} from "@/components/shared/page-header"
import { toast } from "sonner"
import { format, isPast, isToday } from "date-fns"
import dynamic from "next/dynamic"
import {
  Trophy, Clock, CheckCircle2, CalendarDays, Megaphone, ListChecks,
  Users, TrendingUp, Pin, MapPin, ChevronRight, ShieldCheck,
  ClipboardList, BarChart3,
} from "lucide-react"

import { HeroBar } from "./dashboard/hero-bar"
import { AttentionCard, AllCaughtUpCard } from "./dashboard/attention-card"
import { OnboardingBanner } from "./dashboard/onboarding-banner"
import { ClubStat, ExecMetric } from "./dashboard/club-stats-row"
import { RankBadge, RsvpBadge } from "./dashboard/badges"
import { DashboardSkeleton } from "./dashboard/dashboard-skeleton"
import { fmtHours, formatTurnaround, stagger, type DashboardData } from "./dashboard/dashboard-utils"

// Code-split recharts — only loaded when the chart actually renders.
// (§5 of the R10 perf pass.)
const HoursTrendChart = dynamic(
  () => import("./dashboard/hours-trend-chart").then((m) => m.HoursTrendChart),
  {
    ssr: false,
    loading: () => <div className="h-56 w-full" aria-hidden />,
  },
)

// =========================================================================
// Main component — thin composition layer
// =========================================================================
export function DashboardView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const setView = useAppStore((s) => s.setView)
  const currentClub = useAppStore((s) => s.currentClub)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  // Read dismissed state from localStorage on club change.
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
    return () => { cancelled = true }
  }, [clubId])

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["dashboard", clubId],
    queryFn: () => api<DashboardData>(`/api/clubs/${clubId}/dashboard`),
    enabled: !!clubId,
    staleTime: 30_000,
    // Realtime is primary; poll only as a fallback while the socket is down.
    // 60s is a fine disconnected safety net — the dashboard doesn't need 15s
    // polling because the socket pushes live updates when connected.
    refetchInterval: usePollingFallback(60_000),
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
  const showOnboarding = !onboardingDismissed && !hasActivity

  const dismissOnboarding = () => {
    try {
      localStorage.setItem(`onboarding-dismissed-${clubId}`, "true")
    } catch { /* ignore */ }
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
        icon={<Clock className="h-4 w-4" />}
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
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" aria-label="Overdue" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-club shrink-0" aria-label="Upcoming" />
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
            <li key={a.id} className="text-body truncate">{a.title}</li>
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

  return (
    <div className="space-y-4 min-w-0">
      {/* Row 1 — Slim hero bar */}
      <HeroBar
        name={data.club.name}
        logoUrl={data.club.logoUrl}
        memberCount={data.club.memberCount}
        createdAt={data.club.createdAt}
        role={data.myRole}
      />

      {/* Row 2 — Tier 1 (or onboarding banner) */}
      {showOnboarding ? (
        <OnboardingBanner
          clubCode={currentClub?.clubCode ?? null}
          onDismiss={dismissOnboarding}
          onNavigate={setView}
          teamsCount={data.clubStats.teamsCount}
          announcementsCount={data.recentAnnouncements.length + data.clubStats.announcementsThisMonth}
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

      {/* Rows 3+4 — chart + leaderboard + snapshot + announcements + meetings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Hours trend (Tier 3) */}
        <section
          className="card-quiet p-5 lg:col-span-8 order-2 lg:order-1 animate-fade-in"
          style={stagger(2)}
        >
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
            <HoursTrendChart data={data.hoursTrend} />
          )}
        </section>

        {/* Leaderboard (Tier 3) */}
        <section
          className="card-quiet p-5 lg:col-span-4 order-3 lg:order-2 animate-fade-in"
          style={stagger(3)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <h2 className="text-card-title">Leaderboard</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView("members")}>
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
                      <AvatarImage src={entry.avatarUrl ?? undefined} alt={entry.name} />
                      <AvatarFallback className={cn("text-xs", avatarColor(entry.name))}>
                        {initials(entry.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-medium truncate">{entry.name}</p>
                      <p className="text-caption tabular-nums">{fmtHours(entry.hours)} hours</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Your snapshot (Tier 2) */}
        <section
          className="card-quiet p-5 lg:col-span-4 order-1 lg:order-3 animate-fade-in"
          style={stagger(0)}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-club" />
              <h2 className="text-card-title">Your snapshot</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView("hours")}>
              Hours <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-body-medium">Approved hours</span>
              </div>
              <span className="text-card-title tabular-nums">{fmtHours(data.myStats.approvedHours)}h</span>
            </div>
            {data.club.hoursGoal > 0 && (
              <>
                <Progress value={hoursPct} className="h-1.5 [&_[data-slot=progress-indicator]]:bg-club" />
                <p className="text-caption tabular-nums">
                  {fmtHours(data.myStats.approvedHours)} of {data.club.hoursGoal}h goal · {Math.round(hoursPct)}%
                </p>
              </>
            )}
          </div>

          <Separator className="my-4" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <span className="text-body-medium">Tasks</span>
            </div>
            <span className="text-caption-medium tabular-nums">
              <span className="text-foreground font-medium">{data.myStats.tasksAssigned}</span> open
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="text-foreground font-medium">{data.myStats.tasksDone}</span> done
            </span>
          </div>

          <Separator className="my-4" />

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
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className="text-body truncate">{m.title}</span>
                    <span className="text-caption shrink-0 tabular-nums">
                      {format(new Date(m.startTime), "MMM d")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Recent announcements (Tier 3) */}
        <section
          className="card-quiet p-5 lg:col-span-4 order-4 lg:order-4 animate-fade-in"
          style={stagger(4)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-card-title">Recent announcements</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView("announcements")}>
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
                <li key={a.id} className="rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent/40 transition-colors">
                  <div className="flex items-start gap-2">
                    {a.isPinned && <Pin className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-body-medium truncate">{a.title}</p>
                      <p className="text-caption mt-0.5">{a.authorName} · {relativeTime(a.createdAt)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Upcoming meetings (Tier 3) */}
        <section
          className="card-quiet p-5 lg:col-span-4 order-5 lg:order-5 animate-fade-in"
          style={stagger(5)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-card-title">Upcoming meetings</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView("meetings")}>
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
                <li key={m.id} className="rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent/40 transition-colors">
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
        </section>
      </div>

      {/* Row 5 — Club-wide stats mini-strip (Tier 3) */}
      <section className="card-quiet p-4 animate-fade-in" style={stagger(6)}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-card-title">Club at a glance</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ClubStat label="Members" value={String(data.clubStats.totalMembers)} icon={<Users className="h-3.5 w-3.5" />} onClick={() => setView("members")} />
          <ClubStat label="Total hours" value={fmtHours(data.clubStats.totalApprovedHours)} icon={<Clock className="h-3.5 w-3.5" />} onClick={() => setView("hours")} />
          <ClubStat label="Open tasks" value={String(data.clubStats.openTasks)} icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setView("tasks")} />
          <ClubStat label="Upcoming meetings" value={String(data.clubStats.upcomingMeetingsCount)} icon={<CalendarDays className="h-3.5 w-3.5" />} onClick={() => setView("meetings")} />
        </div>
      </section>

      {/* Row 6 (execs only) — Executive insights compact strip */}
      {isExec && data.execStats && (
        <section className="card-quiet p-4 animate-fade-in" style={stagger(7)}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <h2 className="text-card-title">Executive insights</h2>
            <span className="text-caption ml-1">This week</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <ExecMetric label="Pending approvals" value={String(data.clubStats.pendingApprovals)} hint={data.clubStats.pendingApprovals > 0 ? "Needs review" : "All caught up"} urgent={data.clubStats.pendingApprovals > 0} onClick={() => setView("approvals")} />
            <ExecMetric label="Avg turnaround" value={formatTurnaround(data.execStats.avgApprovalTurnaroundHours)} hint="Submission → review" />
            <ExecMetric label="Completion rate" value={`${data.execStats.taskCompletionRate}%`} hint={`${data.clubStats.tasksDone}/${data.clubStats.openTasks + data.clubStats.tasksDone} done`} />
            <ExecMetric label="Submissions / wk" value={String(data.execStats.submissionsThisWeek)} hint="New entries" />
            <ExecMetric label="Announcements" value={String(data.clubStats.announcementsThisMonth)} hint="This month" onClick={() => setView("announcements")} />
            <ExecMetric label="Teams" value={String(data.clubStats.teamsCount)} hint="Active" onClick={() => setView("teams")} />
          </div>
        </section>
      )}
    </div>
  )
}

// =========================================================================
// HoursTrendChart is now in ./dashboard/hours-trend-chart.tsx and lazy-loaded
// via next/dynamic({ ssr: false }) so recharts only ships to the client when
// the chart is actually rendered (see §5 of the R10 perf pass).
// =========================================================================

