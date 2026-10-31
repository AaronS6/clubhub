"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useReducedMotion } from "framer-motion"
import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import { useAppStore, type View } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { usePollingFallback } from "@/lib/realtime-store"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  EmptyState, StatCardSkeleton, initials, relativeTime, avatarColor,
} from "@/components/shared/page-header"
import { toast } from "sonner"
import { format, isPast, isToday } from "date-fns"
import {
  Trophy, Clock, CheckCircle2, CalendarDays, Megaphone, ListChecks,
  Users, TrendingUp, Pin, MapPin, ChevronRight, ShieldCheck,
  Target, Hourglass, ClipboardList, PartyPopper, X, BarChart3,
  History, UserPlus, UserMinus, ArrowUpCircle, ArrowDownCircle,
  XCircle, UserCog, KeyRound, Crown, MessageSquare, ScrollText,
  Camera,
} from "lucide-react"
import { BannerEditDialog } from "@/components/views/dashboard/banner-edit-dialog"
import { ResilientImage } from "@/components/ui/resilient-image"
import dynamic from "next/dynamic"

// The banner's 30-day hours trend is the only recharts consumer left, so it
// is code-split: anonymous landing visitors never download recharts (+ the
// lodash it drags in), and authed users get the banner text/stats painted
// first with the chart streaming in ~instantly after. The fallback is a
// same-bounds skeleton (the chart sits in fixed h-16 / h-28 lg:h-32 boxes)
// so the stream-in causes zero layout shift.
const BannerTrendChart = dynamic(
  () => import("./dashboard/banner-trend-chart").then((m) => m.BannerTrendChart),
  {
    ssr: false,
    loading: () => <div className="h-full w-full min-w-0 skeleton-shimmer rounded" aria-hidden />,
  },
)

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
    bannerUrl: string | null
    bannerFocalY: number | null
    hoursGoal: number
    memberCount: number
    createdAt: string
  }
  myRole: "member" | "executive"
  myStats: {
    approvedHours: number
    pendingHours: number
    // Personal service-hours goal set by this member for this club (0 = unset,
    // in which case the club-wide goal below is the fallback).
    personalHoursGoal: number
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
  "border border-border/80 bg-card rounded-xl p-5 shadow-card transition-[box-shadow,border-color,background-color,transform] duration-200 hover:shadow-card-hover hover:border-club/15"
const TILE_COMPACT =
  "border border-border/80 bg-card rounded-xl p-4 shadow-card transition-[box-shadow,border-color,background-color] duration-200 hover:shadow-card-hover hover:border-club/15"

// =========================================================================
// Aurora greeting — the soft color band that drifts across the greeting
// line once every 12s. The element styles are applied INLINE and the band
// is driven by a rAF loop (below in the component) that writes
// backgroundPosition per frame — NOT by a CSS animation.
// WHY rAF (verified by live pixel-diff bisection in this environment):
// Chromium freezes the painted raster of background-clip:text elements
// driven by CSS background-position animations — computed style keeps
// advancing but the pixels never repaint (12s/15s durations, ±2.6s/3.25s
// delays, layered/unlayered keyframes ALL froze on the real greeting; even
// post-hoc style mutations can't thaw an element rasterized frozen).
// JS-driven per-frame inline backgroundPosition updates on a freshly
// mounted element repaint flawlessly (2,816 px of verified sweep motion) —
// the rAF driver IS the animation. Side benefits: rAF auto-pauses when the
// tab is hidden, and the wall-clock phase resumes exactly on return.
// The band (club accent → teal → violet, each mixed toward the ink so it
// never goes neon) rides a 260%-wide gradient: most of the cycle the glyphs
// read as plain ink, and roughly once per 12s the colorful core crosses
// left→right — noticeable when it passes, invisible when it doesn't. The
// WIDENED band (40→62%, up from 42→60%) is the "slower, lingers longer"
// tuning: the colorful core spends ~2.9s per crossing instead of ~2.4s.
// START-FAST: the driver starts with a 2.6s virtual head start, so the
// band is already across the leading glyphs at the greeting's first paint
// (position ≈ 78% — color within ~0.05s, not after a run-up).
// =========================================================================
const AURORA_GRADIENT =
  "linear-gradient(110deg, " +
  "var(--foreground) 0%, var(--foreground) 40%, " +
  "color-mix(in oklab, var(--foreground) 62%, var(--club-accent)) 47%, " +
  "color-mix(in oklab, var(--foreground) 22%, #14b8a6) 52%, " +
  "color-mix(in oklab, var(--foreground) 60%, #a78bfa) 57%, " +
  "var(--foreground) 62%, var(--foreground) 100%)"

/** Aurora cycle length + the virtual head start (see comment above). */
const AURORA_CYCLE_S = 12
const AURORA_HEAD_START_S = 2.6

const auroraTextStyle = (): CSSProperties => ({
  backgroundImage: AURORA_GRADIENT,
  backgroundSize: "260% 100%",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "100% 0",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  // NOTE: no CSS `animation` here — see the block comment above. The rAF
  // effect inside DashboardView drives backgroundPosition every frame.
})

// =========================================================================
// Main component
// =========================================================================
export function DashboardView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const setView = useAppStore((s) => s.setView)
  const currentClub = useAppStore((s) => s.currentClub)
  const { data: session } = useSession()
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const [memberOnboardingDismissed, setMemberOnboardingDismissed] = useState(false)

  // ── Time-based greeting (§ v7.2) ──────────────────────────────────────────
  // "Good morning/afternoon/evening, <first name>." The hour is computed ONCE
  // on mount (lazy initializer — no interval, no re-greeting mid-session); the
  // NAME is read from the next-auth session user (re-renders resolve once it
  // hydrates) and falls back to a nameless greeting when unavailable. The whole
  // line wears the inline aurora styles (see AURORA_GRADIENT above): a soft
  // aurora band in the club's accent quietly drifts across the letters. Under
  // prefers-reduced-motion the animation is skipped and the line is plain ink.
  const prefersReducedMotion = useReducedMotion() ?? false
  const auroraRef = useRef<HTMLParagraphElement | null>(null)

  const [greetingWord] = useState(() => {
    const h = new Date().getHours()
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  })
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? null

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

  // §Aurora rAF driver — THE animation (see the AURORA comment block for why
  // this is JS-driven and not a CSS animation). Writes backgroundPosition on
  // the greeting element every frame with a 2.6s virtual head start so the
  // band is already on the glyphs at first paint. rAF pauses when the tab is
  // hidden and the wall-clock phase resumes exactly on return.
  // Lives AFTER the query + re-runs on `isLoading` because the greeting
  // element only mounts once data lands (the skeleton early-return below
  // renders first) — a mount-only effect would see a null ref and never
  // re-arm.
  useEffect(() => {
    if (prefersReducedMotion || isLoading) return
    const el = auroraRef.current
    if (!el) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t =
        (((now - t0) / 1000 + AURORA_HEAD_START_S) % AURORA_CYCLE_S +
          AURORA_CYCLE_S) %
        AURORA_CYCLE_S
      const pos = 100 - (t / AURORA_CYCLE_S) * 100
      el.style.backgroundPosition = `${pos.toFixed(3)}% 0`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [prefersReducedMotion, isLoading])

  if (!clubId) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No club selected"
        description="Pick a club to get started."
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
            ? undefined
            : `${data.myStats.tasksAssigned} open task${data.myStats.tasksAssigned === 1 ? "" : "s"}`
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
                    className="h-1.5 w-1.5 rounded-full bg-danger shrink-0"
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
        description={pinned.length > 1 ? `${pinned.length} pinned` : undefined}
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

  // Hours goal progress (for snapshot). The member's PERSONAL goal takes
  // priority; if they never set one we fall back to the club-wide goal the
  // executives set ("a goal for everyone to reach").
  const personalGoal = data.myStats.personalHoursGoal ?? 0
  const effectiveGoal = personalGoal > 0 ? personalGoal : data.club.hoursGoal
  const goalIsPersonal = personalGoal > 0
  const hoursPct =
    effectiveGoal > 0
      ? Math.min(100, (data.myStats.approvedHours / effectiveGoal) * 100)
      : 0

  // ---- Section bodies -----------------------------------------------------
  // Each card's inner JSX is extracted here so the member and exec layouts
  // can arrange them differently (different grid order / col-spans) without
  // duplicating the content.

  // Month-to-date approved hours, derived from the same 30-day trend the
  // chart uses (valid existing records only — no fabricated stats). Shown
  // as the small "+Xh this month" indicator next to the hero hours number.
  const currentMonth = new Date().getMonth()
  const hoursThisMonth = data.hoursTrend.reduce((sum, d) => {
    const inMonth = new Date(d.date).getMonth() === currentMonth
    return inMonth ? sum + d.hours : sum
  }, 0)

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
        />
      ) : (
        /* The leaderboard card is full-width now — entries flow in a
           responsive grid (1 col mobile, 2 sm, 3 xl) instead of one
           long narrow list. */
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
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

      {/* Approved hours + goal — the member's personal goal when set,
          otherwise the club-wide goal. */}
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
        {effectiveGoal > 0 && (
          <>
            <Progress
              value={hoursPct}
              className="h-1.5 [&_[data-slot=progress-indicator]]:bg-club"
            />
            <p className="text-caption tabular-nums">
              {fmtHours(data.myStats.approvedHours)} of {fmtHours(effectiveGoal)}h{" "}
              {goalIsPersonal ? "your goal" : "club goal"} · {Math.round(hoursPct)}%
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
      {/* Row 0 — Time-based greeting header. Sits above the banner as the
          dashboard's page header. Mobile matches the banner's 20px identity
          scale; sm+ matches the app's 28px page-title scale. */}
      <header className="min-w-0">
        <p
          ref={auroraRef}
          style={auroraTextStyle()}
          className="aurora-fallback font-display text-[1.25rem] sm:text-[1.75rem] leading-tight font-semibold tracking-[-0.022em]"
        >
          {greetingWord}
          {firstName ? `, ${firstName}` : ""}.
        </p>
      </header>

      {/* Row 1 — Cinematic club banner card (full width). The 30-day hours
          chart lives INSIDE this card now, below the identity — part of the
          banner, not another nested tile. On mobile the banner is compact
          (h-36, tight identity) and the hours block is a single tight stack:
          number + growth chip, goal progress, then a small chart.
          §Load choreography — first block of the staggered entrance
          (banner → hours → attention → bento → strips, ~70ms apart). */}
      <div className="dash-rise">
      <ClubBannerCard
        clubId={data.club.id}
        name={data.club.name}
        description={data.club.description}
        logoUrl={data.club.logoUrl}
        bannerUrl={data.club.bannerUrl}
        bannerFocalY={data.club.bannerFocalY}
        memberCount={data.club.memberCount}
        createdAt={data.club.createdAt}
        role={data.myRole}
        approvedHours={data.myStats.approvedHours}
        hoursGoal={effectiveGoal}
        goalIsPersonal={goalIsPersonal}
        hoursPct={hoursPct}
        hoursThisMonth={hoursThisMonth}
        hoursTrend={data.hoursTrend}
        onViewHours={() => setView("hours")}
      />
      </div>

      {/* Row 2 — Approved hours panel (sm+ only; on mobile the banner's
          hours block IS the hours surface — two stacked progress rows for
          the same number read as clutter). Click → Service Hours view. */}
      <div className="dash-rise" style={{ "--dash-d": "70ms" } as CSSProperties}>
      <ApprovedHoursPanel
        className="hidden sm:flex"
        approvedHours={data.myStats.approvedHours}
        pendingHours={data.myStats.pendingHours}
        hoursGoal={effectiveGoal}
        goalIsPersonal={goalIsPersonal}
        hoursPct={hoursPct}
        onViewHours={() => setView("hours")}
      />
      </div>

      {/* Row 2 — Tier 1 attention items (or onboarding banner) ----------------
          §Choreography: third block of the staggered entrance. */}
      <div className="dash-rise" style={{ "--dash-d": "140ms" } as CSSProperties}>
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
        /* §Mobile — attention cards stack FULL-WIDTH on phones: half-width
           cells can't fit titles like "Pinned: …" / "Pending approvals" and
           the two cards visually collide. Two-up from sm, four-up from lg. */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {attentionItems}
        </div>
      )}
      </div>

      {/* Rows 3+4 — Supporting tiles in asymmetric bento grid.
          Role-aware: members get snapshot → announcements → meetings →
          leaderboard (their own work first, club context later). Execs get
          leaderboard first (the pulse of the club at a glance). The 30-day
          hours chart lives inside the banner card now — not a nested tile.
          The `{!isExec ? … : …}` pattern keeps the two layouts as
          explicit siblings rather than conditional class swaps. */}
      {!isExec ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Your snapshot — first */}
          <section
            className={cn(TILE, "lg:col-span-4 order-1 lg:order-1 dash-rise")}
            style={{ "--dash-d": "210ms" } as CSSProperties}
          >
            {snapshotBody}
          </section>
          {/* Announcements — second */}
          <section
            className={cn(TILE, "lg:col-span-4 order-2 lg:order-2 dash-rise")}
            style={{ "--dash-d": "280ms" } as CSSProperties}
          >
            {announcementsBody}
          </section>
          {/* Upcoming meetings — third */}
          <section
            className={cn(TILE, "lg:col-span-4 order-3 lg:order-3 dash-rise")}
            style={{ "--dash-d": "350ms" } as CSSProperties}
          >
            {meetingsBody}
          </section>
          {/* Leaderboard — fourth (full width; entries flow in a responsive
              grid since the card is wide now). */}
          <section
            className={cn(TILE, "lg:col-span-12 order-4 lg:order-4 dash-rise")}
            style={{ "--dash-d": "420ms" } as CSSProperties}
          >
            {leaderboardBody}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          {/* Leaderboard (club pulse) — desktop: row 1 full width; mobile:
              after snapshot. */}
          <section
            className={cn(TILE, "lg:col-span-12 order-2 lg:order-1 dash-rise")}
            style={{ "--dash-d": "210ms" } as CSSProperties}
          >
            {leaderboardBody}
          </section>

          {/* Your snapshot (Tier 2) — desktop: row 2, cols 1-4; mobile: first */}
          <section
            className={cn(TILE, "lg:col-span-4 order-1 lg:order-2 dash-rise")}
            style={{ "--dash-d": "280ms" } as CSSProperties}
          >
            {snapshotBody}
          </section>

          {/* Recent announcements (Tier 3) — desktop: row 2, cols 5-8 */}
          <section
            className={cn(TILE, "lg:col-span-4 order-4 lg:order-3 dash-rise")}
            style={{ "--dash-d": "350ms" } as CSSProperties}
          >
            {announcementsBody}
          </section>

          {/* Upcoming meetings (Tier 3) — desktop: row 2, cols 9-12 */}
          <section
            className={cn(TILE, "lg:col-span-4 order-5 lg:order-4 dash-rise")}
            style={{ "--dash-d": "420ms" } as CSSProperties}
          >
            {meetingsBody}
          </section>
        </div>
      )}

      {/* Row 5 — Club-wide stats mini-strip (exec only) --------------------- */}
      {isExec && (
        <section
          className={cn(TILE_COMPACT, "dash-rise")}
          style={{ "--dash-d": "490ms" } as CSSProperties}
        >
          {clubStatsBody}
        </section>
      )}

      {/* Row 6 (execs only) — Executive insights wide strip ---------------- */}
      {isExec && data.execStats && (
        <section
          className={cn(TILE_COMPACT, "dash-rise")}
          style={{ "--dash-d": "560ms" } as CSSProperties}
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

function ClubBannerCard({
  clubId,
  name,
  description,
  logoUrl,
  bannerUrl,
  bannerFocalY,
  memberCount,
  createdAt,
  role,
  approvedHours,
  hoursGoal,
  goalIsPersonal,
  hoursPct,
  hoursThisMonth,
  hoursTrend,
  onViewHours,
}: {
  clubId: string
  name: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  bannerFocalY: number | null
  memberCount: number
  createdAt: string
  role: "member" | "executive"
  approvedHours: number
  hoursGoal: number
  goalIsPersonal?: boolean
  hoursPct: number
  hoursThisMonth: number
  hoursTrend: { date: string; hours: number }[]
  onViewHours?: () => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const isExec = role === "executive"
  // A banner that exists AND loaded — otherwise we show the quiet fallback.
  const hasBanner = !!bannerUrl && !imgFailed
  const focalPct = Math.round((bannerFocalY ?? 0.5) * 100)

  // §Retry-once — a single dropped request (tunnel hiccup, momentary 5xx)
  // used to latch the fallback forever. Before giving up we retry the image
  // ONCE with a cache-busting parameter; only a second failure shows the
  // fallback. data: URLs fail deterministically, so they skip the retry.
  const [bannerAttempt, setBannerAttempt] = useState(0)
  const bannerBustable = !!bannerUrl && !bannerUrl.startsWith("data:")
  const bannerSrc =
    bannerAttempt > 0 && bannerBustable && bannerUrl
      ? `${bannerUrl}${bannerUrl.includes("?") ? "&" : "?"}r=${bannerAttempt}`
      : (bannerUrl ?? "")

  // Reset the failure flag when the banner changes (upload, club switch,
  // realtime update) so a previously-broken image doesn't hide a new valid
  // one. Official "adjust state when props change" pattern — no effect
  // needed (avoids cascading renders; see react.dev/learn/you-might-not-need-an-effect).
  const [prevBannerUrl, setPrevBannerUrl] = useState(bannerUrl)
  if (prevBannerUrl !== bannerUrl) {
    setPrevBannerUrl(bannerUrl)
    setImgFailed(false)
    setBannerAttempt(0)
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-card transition-[box-shadow,border-color] duration-200 hover:shadow-card-hover">
      {/* ── Cinematic banner ───────────────────────────────────────────────
          Edge-to-edge cover image with layered gradients. On mobile the
          banner is COMPACT (h-36 vs h-44) with a tight identity block —
          the dashboard's job on a phone is information, not cinema. */}
      <div className="relative h-36 sm:h-52 lg:h-56">
        {bannerUrl && !imgFailed ? (
          <img
            src={bannerSrc}
            alt={`${name} banner`}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `center ${focalPct}%` }}
            onError={() => {
              if (bannerBustable && bannerAttempt === 0) setBannerAttempt(1)
              else setImgFailed(true)
            }}
          />
        ) : (
          /* Fallback — no banner (or failed to load): a quiet accent wash +
             the dot-grid texture, preserving the classic ClubHub hero feel. */
          <>
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-br from-club-muted/70 via-transparent to-club-subtle"
            />
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle, currentColor 1px, transparent 1px)",
                backgroundSize: "20px 20px",
                color: "var(--foreground)",
                opacity: 0.04,
              }}
            />
          </>
        )}

        {/* §38 cover identity strip — every club stays branded in its accent. */}
        <div
          aria-hidden
          className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-club via-club/50 to-transparent"
        />

        {/* Layer 1 — dark scrim across the image for text contrast.
            LIGHT mode: the photo is deliberately dimmed to a dark cinema
            look so the identity text can always stay WHITE (per design
            decision — no more ink-on-photo mode). DARK mode: a near-invisible
            edge tint only — the photo keeps its NORMAL brightness (white
            text rides its drop-shadows + the Layer-2 bottom anchor). */}
        {hasBanner && (
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/65 dark:from-black/10 dark:via-black/0 dark:to-black/10"
          />
        )}
        {/* Layer 2 — bottom fade under the identity text.
            LIGHT mode: a deep black fade anchors the text zone (replaces the
            old card-melt — white text can't ride a near-white fade).
            DARK mode: a bottom-anchored shadow (not a full card-melt) so the
            bright photo reads at normal brightness while the text zone stays
            anchored — the fade dies out by mid-banner. Bumped from /70→/85 so
            the pure-white stats (members · opened) stay crisp over bright
            photography without dimming the rest of the photo. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t",
            hasBanner
              ? "from-black/80 via-black/40 to-transparent dark:from-black/85 dark:via-black/40"
              : "from-card via-card/45 to-transparent",
          )}
        />

        {/* Edit banner — translucent dark pill, executives only. Members
            never see this control (permissions also enforced server-side).
            Slightly smaller on mobile so it doesn't crowd the identity. */}
        {isExec && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="absolute right-3 top-3 sm:right-4 sm:top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 h-7 sm:h-8 sm:px-3 text-[11px] sm:text-xs font-medium text-white backdrop-blur-sm hover:bg-black/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Camera className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Edit banner
          </button>
        )}

        {/* Club identity — lower part of the banner, riding the fade.
            Mobile: p-4, 40px logo, tighter name + single-line meta and
            description (space matters more than prose on a phone). */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <div className="flex items-end gap-3 sm:gap-4 flex-wrap min-w-0">
            {/* Logo tile — hairline ring so it reads cleanly over photography. */}
            <div
              className={cn(
                "flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-club text-club-foreground text-xs sm:text-sm font-bold shrink-0 overflow-hidden shadow-card-hover",
                hasBanner && "ring-1 ring-white/30"
              )}
            >
              {/* §Resilient logo — retries a transiently-dropped request once
                  (cache-busted), then falls back to clean initials. Never the
                  browser's broken-image glyph. */}
              <ResilientImage
                src={logoUrl}
                alt={`${name} logo`}
                name={name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {/* min-w-0 lets truncate win inside a flex-wrap container so
                    very long club names ellipsize cleanly on narrow viewports.
                    Geist Sans (body face) per exec feedback — the display
                    face felt wrong for club names. */}
                <h1
                  className={cn(
                    "font-sans font-bold tracking-[-0.025em] text-[1.25rem] sm:text-[1.75rem] leading-tight truncate min-w-0",
                    hasBanner && "text-white"
                  )}
                >
                  {name}
                </h1>
                {hasBanner ? (
                  <BannerRolePill role={role} />
                ) : (
                  <RoleBadgePill role={role} />
                )}
              </div>
              {/* Meta strip — members count + club-opened date. Over a photo
                  these go FULL white + medium weight. NOTE: `.text-caption`
                  (a components-layer class) sets its own muted COLOR and
                  font-weight 400, which override inherited styles — so the
                  white + medium utilities must be applied ON THE SPANS
                  (utilities layer beats components layer). Contrast is carried
                  by the light-mode scrim + dark-mode bottom anchor fade, no
                  text shadows. */}
              <div
                className={cn(
                  "flex items-center gap-2 sm:gap-2.5 mt-1 flex-wrap min-w-0",
                  hasBanner
                    ? "text-white"
                    : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-caption",
                    hasBanner && "text-white font-medium",
                  )}
                >
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  {memberCount}
                </span>
                <span
                  aria-hidden
                  className={cn("text-caption", hasBanner && "text-white opacity-90")}
                >
                  ·
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-caption",
                    hasBanner && "text-white font-medium",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                  {format(new Date(createdAt), "MMM yyyy")}
                </span>
              </div>
              {description && (
                <p
                  className={cn(
                    "mt-1.5 max-w-2xl text-caption leading-4 line-clamp-1 sm:line-clamp-2",
                    hasBanner
                      ? "text-white/95"
                      : "text-muted-foreground"
                  )}
                >
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Hours analytics ──────────────────────────────────────────────
          MOBILE: one tight stack — "Your hours" label, number + GROWTH
          chip side by side, goal progress, then a compact full-width trend
          chart. The whole number+goal block is tappable → Service Hours.
          DESKTOP: unchanged split — memorable number (left) + trend (right). */}
      <div className="relative px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="hairline-soft mb-3 sm:mb-4" />

        {/* ── Mobile hours block ── */}
        <div className="sm:hidden">
          {onViewHours ? (
            <button
              type="button"
              onClick={onViewHours}
              className="w-full text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 -mx-1 px-1"
              aria-label="Your service hours"
            >
              <MobileHoursSummary
                approvedHours={approvedHours}
                hoursGoal={hoursGoal}
                goalIsPersonal={goalIsPersonal}
                hoursPct={hoursPct}
                hoursThisMonth={hoursThisMonth}
              />
            </button>
          ) : (
            <MobileHoursSummary
              approvedHours={approvedHours}
              hoursGoal={hoursGoal}
              goalIsPersonal={goalIsPersonal}
              hoursPct={hoursPct}
              hoursThisMonth={hoursThisMonth}
            />
          )}

          {/* Compact 30-day trend — smaller than desktop (h-16) but still
              real: the "graph thing" belongs on mobile too. */}
          <div className="mt-2 h-16 min-w-0">
            {hoursTrend.every((d) => d.hours === 0) ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-caption inline-flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  30-day trend appears after your first hours.
                </p>
              </div>
            ) : (
              <BannerTrendChart data={hoursTrend} compact />
            )}
          </div>
        </div>

        {/* ── Desktop hours block ── */}
        <div className="hidden sm:flex sm:items-end gap-4 sm:gap-8">
          {/* Left — the memorable number. */}
          <div className="shrink-0 sm:w-44 lg:w-48">
            <p className="text-caption-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-club shrink-0" />
              Your hours
            </p>
            <div className="mt-1.5 flex items-baseline gap-2 min-w-0">
              <span className="text-numeral">{fmtHours(approvedHours)}h</span>
              {hoursGoal > 0 && (
                <span className="text-caption shrink-0">of {fmtHours(hoursGoal)}h</span>
              )}
            </div>
            {hoursThisMonth > 0 && (
              <p className="mt-1.5 text-caption-medium text-club-ink inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3 shrink-0" />
                +{fmtHours(hoursThisMonth)}h this month
              </p>
            )}
            {hoursGoal > 0 && (
              <Progress
                value={hoursPct}
                className="h-1 mt-2.5 max-w-[160px] [&_[data-slot=progress-indicator]]:bg-club"
              />
            )}
          </div>
          {/* Right — the 30-day trend, real data, existing chart library. */}
          <div className="flex-1 min-w-0 h-28 lg:h-32">
            {hoursTrend.every((d) => d.hours === 0) ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-caption inline-flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  No hours logged yet.
                </p>
              </div>
            ) : (
              <BannerTrendChart data={hoursTrend} />
            )}
          </div>
        </div>
      </div>

      {/* Exec-only banner editor (upload · preview · focal point · remove). */}
      <BannerEditDialog
        clubId={clubId}
        clubName={name}
        currentBannerUrl={bannerUrl}
        currentFocalY={bannerFocalY}
        open={editing}
        onOpenChange={setEditing}
      />
    </section>
  )
}

/** Mobile-only hours summary inside the banner card: the memorable number
 *  with the GROWTH chip beside it (a soft club-tinted pill — the growth
 *  stat deserves real visibility on a phone, not a 12px caption), goal
 *  progress, and a chevron hinting the whole block is tappable. */
function MobileHoursSummary({
  approvedHours,
  hoursGoal,
  goalIsPersonal,
  hoursPct,
  hoursThisMonth,
}: {
  approvedHours: number
  hoursGoal: number
  goalIsPersonal?: boolean
  hoursPct: number
  hoursThisMonth: number
}) {
  return (
    <div>
      <p className="text-caption-medium flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-club shrink-0" />
        Your hours
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
      </p>
      <div className="mt-1 flex items-center gap-2 min-w-0">
        <span className="text-numeral">{fmtHours(approvedHours)}h</span>
        {hoursThisMonth > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-club-muted px-2 py-0.5 text-[11px] font-semibold text-club tabular-nums"
          >
            <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
            +{fmtHours(hoursThisMonth)}h this month
          </span>
        )}
      </div>
      {hoursGoal > 0 && (
        <div className="mt-2">
          <Progress
            value={hoursPct}
            className="h-1 [&_[data-slot=progress-indicator]]:bg-club"
          />
          <p className="mt-1 text-caption tabular-nums">
            {Math.round(hoursPct)}% of {fmtHours(hoursGoal)}h{" "}
            {goalIsPersonal ? "your goal" : "club goal"}
            {hoursPct >= 100 ? " · reached 🎉" : ""}
          </p>
        </div>
      )}
    </div>
  )
}

/** Compact role pill for use ON the banner image. The banner is dimmed dark
 *  in BOTH themes (light mode = strong scrim, dark mode = dark photo), so a
 *  single translucent glass + white-text pairing works everywhere. */
function BannerRolePill({ role }: { role: "member" | "executive" }) {
  // The banner photo is dimmed dark in BOTH themes (light mode scrim, dark
  // mode photo), so these pills are always the translucent glass + white
  // text pairing — no theme fork needed.
  if (role === "executive") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-club/45 bg-club/25 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm shrink-0">
        <ShieldCheck className="h-3 w-3" /> Executive
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm shrink-0">
      <Users className="h-3 w-3" /> Member
    </span>
  )
}

/** The 30-day approved-hours trend chart — now a lazily-loaded component in
 *  ./dashboard/banner-trend-chart.tsx (see the dynamic import up top). */

function ApprovedHoursPanel({
  className,
  approvedHours,
  pendingHours,
  hoursGoal,
  goalIsPersonal,
  hoursPct,
  onViewHours,
}: {
  className?: string
  approvedHours: number
  pendingHours: number
  hoursGoal: number
  goalIsPersonal?: boolean
  hoursPct: number
  onViewHours?: () => void
}) {
  // Refined "Approved hours" row — sits directly underneath the banner card
  // (sm+ only; on mobile the banner's hours block covers this job so we
  // don't stack two progress bars for the same number).
  // Subtle dark-teal surface, hairline border, restrained icon container,
  // clear title + muted supporting description, chevron on the right.
  // Click behavior and destination are unchanged (→ Service Hours view).
  const Comp = onViewHours ? "button" : "div"
  return (
    <Comp
      type={onViewHours ? "button" : undefined}
      onClick={onViewHours}
      className={cn(
        "w-full rounded-xl border border-club/20 bg-club-subtle p-4 text-left flex items-center gap-3.5 shadow-card transition-[box-shadow,border-color,background-color] duration-200",
        onViewHours &&
          "hover:shadow-card-hover hover:border-club/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        className
      )}
    >
      {/* Small, restrained icon container */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-club-muted text-club">
        <Clock className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-card-title truncate">Approved hours</p>
        <p className="text-caption mt-0.5 truncate">
          {fmtHours(approvedHours)}h approved
          {hoursGoal > 0
            ? ` · ${Math.round(hoursPct)}% of ${fmtHours(hoursGoal)}h ${
                goalIsPersonal ? "your goal" : "club goal"
              }`
            : pendingHours > 0
              ? ` · ${fmtHours(pendingHours)}h awaiting review`
              : " · lifetime"}
        </p>
        {hoursGoal > 0 && (
          <Progress
            value={hoursPct}
            className="h-1 mt-2 max-w-[260px] [&_[data-slot=progress-indicator]]:bg-club"
          />
        )}
      </div>
      {/* Compact goal completion readout */}
      {hoursGoal > 0 && (
        <div className="shrink-0 text-right hidden sm:block">
          <p className="text-body font-bold tabular-nums leading-5">
            {Math.round(hoursPct)}%
          </p>
          <p className="text-caption">
            {hoursPct >= 100 ? "done 🎉" : "of goal"}
          </p>
        </div>
      )}
      {onViewHours && (
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
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
        "border border-border/80 border-l-2 bg-card rounded-xl p-4 text-left shadow-card transition-[box-shadow,border-color,background-color] duration-200",
        urgent ? "border-l-danger" : "border-l-club",
        onClick &&
          "hover:shadow-card-hover hover:border-club/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-0.5 shrink-0", urgent ? "text-danger" : "text-club")}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-card-title line-clamp-2">{title}</p>
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
    <div className="border border-club/30 bg-club-muted/40 rounded-xl p-5 relative transition-[color,background-color,border-color,transform,box-shadow] duration-200">
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
    <div className="bg-club-muted/40 rounded-xl p-5 relative transition-[color,background-color,border-color,transform,box-shadow] duration-200">
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

// =========================================================================
// Loading skeleton — matches new banner-card layout
// =========================================================================
function DashboardSkeleton() {
  const tile =
    "border border-border rounded-xl skeleton-shimmer"
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Row 1 — banner card (image + identity + analytics) */}
      <div className={cn(tile, "h-72 sm:h-80")} />
      {/* Row 2 — approved hours panel */}
      <div className={cn(tile, "h-[72px]")} />
      {/* Tier 1 strip — 4 tighter tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      {/* Leaderboard row + Snapshot row */}
      <div className={cn(tile, "p-5 h-40")} />
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
