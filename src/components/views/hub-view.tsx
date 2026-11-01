"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useReducedMotion } from "framer-motion"
import { format, isToday, isTomorrow, isYesterday } from "date-fns"
import {
  CalendarDays, CalendarCheck, CheckSquare, Megaphone, Clock, Compass, ChevronRight,
  MapPin, Pin, Zap, BarChart3, Heart, MessageSquare, Trophy, ArrowRight,
  CheckCircle2, Circle, Loader2, PartyPopper, Search, Users,
} from "lucide-react"
import { api } from "@/lib/api/client"
import { useAppStore } from "@/lib/store"
import { usePollingFallback } from "@/lib/realtime-store"
import { openInClub, openClubHome } from "@/lib/hub-nav"
import type { HubOverview, HubMeeting, HubTask, HubAnnouncement, HubClubSummary } from "@/lib/hub-types"
import { ClubTile, ClubChip, ClubDot } from "@/components/shared/club-badge-chip"
import { openGlobalSearch } from "@/components/global-search"
import { ResilientImage } from "@/components/ui/resilient-image"
import { DecoratedAvatar } from "@/components/shared/decorated-avatar"
import { relativeTime } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * MY HUB — the student's personal, cross-club home.
 *
 * The default view of the entire ClubHub experience: one glance answers
 * "what's happening in my clubs?", "what do I need to do?", "what should I
 * pay attention to?" and "what opportunities do I have?". Every item is
 * REAL data aggregated from the student's memberships (GET /api/hub) and
 * every click jumps to the item's original home inside its club workspace —
 * My Hub never duplicates club functionality, it lenses it.
 *
 * Layout (desktop, 12-col rhythm — MASONRY: two independent columns so a
 * short card never strands empty space; every section sizes to its OWN
 * content, empty sections are a single quiet line):
 *   Row 0  greeting header (aurora ink, date)
 *   Row 1  Quick Jump — slim pill toolbar: club chips + icon quick actions
 *   Row 2  Next up hero + four stat cards. The hero holds the next
 *          un-responded event; RSVPing confirms the chip, holds ~2s, then
 *          the following event EXPANDS into the hero (keyed remount). When
 *          nothing remains it collapses to "No more events currently".
 *   Row 3  compact suggestion chips (a whisper, not a second hero)
 *   Left column (7): Your week, Recent updates
 *   Right column (5): My tasks, My clubs — a short/empty My tasks pulls
 *          My clubs straight up into the freed space.
 *   Full width: Your Activity strip.
 *
 * Visual language: every section is a hub-card (hairline border/60,
 * layered shadow scale, hover lift + accent-tinted border, 180ms motion
 * ease) so the page reads as one family; section headers are tight (h-10)
 * with tinted icon chips and pill header actions; the suggestion chips
 * are 28px-tall pills with 12px text; big numbers use the display face.
 * Motion: the whole page cascades in (stagger-in, replayed by the shell's
 * per-view remount key), the greeting wears the same aurora band as the
 * club dashboard, stat numerals count up from zero when data lands, the
 * shortcuts bar is one snap-scroll rail on mobile, and the hero swap uses
 * animate-hero-in. Everything is neutralized under prefers-reduced-motion.
 */

const RSVP_LABEL: Record<string, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not going",
}

// =========================================================================
// Aurora greeting — the same soft color band that drifts across the club
// dashboard's greeting line, ported verbatim (rAF-driven inline
// backgroundPosition; see dashboard-view.tsx for the full "why rAF and not
// a CSS animation" post-mortem). In My Hub the accent slot resolves to the
// default emerald, so the band reads emerald → teal → violet — colorful
// without belonging to any one club.
// =========================================================================
const AURORA_GRADIENT =
  "linear-gradient(110deg, " +
  "var(--foreground) 0%, var(--foreground) 40%, " +
  "color-mix(in oklab, var(--foreground) 62%, var(--club-accent)) 47%, " +
  "color-mix(in oklab, var(--foreground) 22%, #14b8a6) 52%, " +
  "color-mix(in oklab, var(--foreground) 60%, #a78bfa) 57%, " +
  "var(--foreground) 62%, var(--foreground) 100%)"

const AURORA_CYCLE_S = 12
const AURORA_HEAD_START_S = 2.6

const auroraTextStyle = (): React.CSSProperties => ({
  backgroundImage: AURORA_GRADIENT,
  backgroundSize: "260% 100%",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "100% 0",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
})

/** Time-of-day line under the greeting — mirrors the club dashboard's
 *  "next up" sentence so both homes speak the same language. */
function nextUpSentence(meetings: HubMeeting[]) {
  const next = meetings[0]
  if (!next) return null
  const d = new Date(next.startTime)
  const when = isToday(d)
    ? format(d, "h:mm a")
    : isTomorrow(d)
      ? `tomorrow ${format(d, "h:mm a")}`
      : format(d, "EEE, MMM d")
  return `Next up: ${next.title} · ${next.club.clubName} · ${when}`
}

export function HubView() {
  const { data: session } = useSession()
  const setView = useAppStore((s) => s.setView)
  const clubs = useAppStore((s) => s.clubs)

  const { data, isLoading } = useQuery<HubOverview>({
    queryKey: ["hub"],
    queryFn: () => api<HubOverview>("/api/hub"),
    refetchInterval: usePollingFallback(60_000),
    staleTime: 15_000,
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
  const firstName = session?.user?.name?.split(" ")[0]

  const prefersReducedMotion = useReducedMotion() ?? false
  const auroraRef = useRef<HTMLHeadingElement | null>(null)

  // §Aurora rAF driver — writes backgroundPosition every frame with a 2.6s
  // virtual head start so the band is already on the glyphs at first paint.
  // rAF pauses when the tab is hidden; wall-clock phase resumes on return.
  useEffect(() => {
    if (prefersReducedMotion) return
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
  }, [prefersReducedMotion])

  return (
    <div className="space-y-5 pb-2">
      {/* ── A. Personalized header — aurora ink greeting ───────────────── */}
      <header
        className="stagger-in flex flex-wrap items-end justify-between gap-4"
        style={{ "--stagger-i": 0 } as React.CSSProperties}
      >
        <div className="min-w-0">
          <p className="text-caption-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
          <h1
            ref={auroraRef}
            style={prefersReducedMotion ? undefined : auroraTextStyle()}
            className="aurora-fallback font-display mt-1 truncate text-[1.625rem] font-semibold leading-10 sm:text-[2.25rem] sm:leading-[2.625rem] tracking-[-0.025em]"
          >
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-body text-muted-foreground mt-1">
            {clubs.length === 1 ? "Your club at a glance." : `Your ${clubs.length} clubs at a glance.`}
          </p>
        </div>
      </header>

      {/* Soft gradient hairline — closes the greeting with quiet structure
          instead of a hard rule; fades out at both ends. */}
      <span aria-hidden className="hairline-soft block" />

      {/* ── B. Quick Jump — club chips + quick actions ──────────────────── */}
      <QuickJump
        clubs={clubs}
        unreadUpdates={isLoading ? null : data?.stats.unreadUpdates ?? 0}
        unreadMessages={isLoading ? null : data?.stats.unreadMessages ?? 0}
        stagger={1}
      />

      {/* ── C. Next up hero + overview statistics ─────────────────────────
          items-start so the stat rail doesn't stretch to a tall hero (and
          vice versa) — each column keeps its own natural height. */}
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-12 xl:gap-4">
        <div className="xl:col-span-5">
          <NextUpHero meetings={data?.week ?? []} loading={isLoading} stagger={2} />
        </div>
        <div className="grid grid-cols-2 content-start gap-3 xl:col-span-7 xl:grid-cols-4">
          <StatCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Upcoming events"
            value={isLoading ? null : data?.stats.upcomingEvents ?? 0}
            hint="next 30 days"
            stagger={3}
            onClick={() => setView("meetings")}
          />
          <StatCard
            icon={<CheckSquare className="h-4 w-4" />}
            label="Pending tasks"
            value={isLoading ? null : data?.stats.pendingTasks ?? 0}
            hint="assigned to you"
            stagger={4}
            onClick={() => setView("tasks")}
          />
          <StatCard
            icon={<Megaphone className="h-4 w-4" />}
            label="Unread updates"
            value={isLoading ? null : data?.stats.unreadUpdates ?? 0}
            hint="announcements"
            stagger={5}
            onClick={() => setView("announcements")}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Service hours"
            value={isLoading ? null : Math.round(data?.stats.approvedHours ?? 0)}
            suffix="h"
            hint={
              data && data.stats.pendingHours > 0
                ? `${data.stats.pendingHours}h pending review`
                : "approved"
            }
            stagger={6}
            onClick={() =>
              document.getElementById("hub-activity")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
        </div>
      </div>

      {/* ── D. Smart suggestions — one clear "what should I do next" row ── */}
      <SuggestionRow data={data} loading={isLoading} stagger={7} />

      {/* ── Rows 4–5: two independent columns, not grid rows ──────────────
          Left (7): Your week + Recent updates. Right (5): My tasks + My
          clubs. Each column stacks its own cards, so a short My tasks card
          pulls My clubs straight up into the freed space — no dead gap
          waiting for a grid row to end. Sections size to their own content
          (empty ones are a single quiet line). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          {/* E. Your Week */}
          <section
            className="stagger-in hub-card-hover"
            style={{ "--stagger-i": 8 } as React.CSSProperties}
            aria-label="Your week"
          >
            <SectionHeader
              icon={<CalendarDays />}
              title="Your week"
              action={
                <SectionLink onClick={() => setView("meetings")} ariaLabel="View the full calendar">
                  View calendar <ChevronRight className="h-3.5 w-3.5" />
                </SectionLink>
              }
            />
            <WeekAgenda meetings={data?.week ?? []} loading={isLoading} />
          </section>

          {/* G. Recent Updates */}
          <section
            className="stagger-in hub-card-hover"
            style={{ "--stagger-i": 9 } as React.CSSProperties}
            aria-label="Recent updates"
          >
            <SectionHeader
              icon={<Megaphone />}
              title="Recent updates"
              action={
                <SectionLink onClick={() => setView("announcements")} ariaLabel="View all updates">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </SectionLink>
              }
            />
            <UpdatesFeed updates={data?.updates ?? []} loading={isLoading} />
          </section>
        </div>

        <div className="space-y-4 lg:col-span-5">
          {/* F. My Tasks */}
          <section
            className="stagger-in hub-card-hover"
            style={{ "--stagger-i": 10 } as React.CSSProperties}
            aria-label="My tasks"
          >
            <SectionHeader
              icon={<CheckSquare />}
              title="My tasks"
              action={
                <SectionLink onClick={() => setView("tasks")} ariaLabel="View all tasks">
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </SectionLink>
              }
            />
            <MyTasks tasks={data?.tasks ?? []} loading={isLoading} />
          </section>

          {/* H. My Clubs */}
          <section
            className="stagger-in hub-card-hover"
            style={{ "--stagger-i": 11 } as React.CSSProperties}
            aria-label="My clubs"
          >
            <SectionHeader icon={<PartyPopper />} title="My clubs" />
            <MyClubs clubs={data?.clubs ?? []} loading={isLoading} />
          </section>
        </div>
      </div>

      {/* ── I. Your Activity ───────────────────────────────────────────── */}
      <section
        id="hub-activity"
        className="stagger-in hub-card-hover"
        style={{ "--stagger-i": 12 } as React.CSSProperties}
        aria-label="Your activity"
      >
        <SectionHeader icon={<BarChart3 />} title="Your activity" />
        <ActivityStrip activity={data?.activity} loading={isLoading} />
      </section>
    </div>
  )
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
      <h2 className="flex items-center gap-2 text-body-medium font-semibold text-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/70 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
          {icon}
        </span>
        {title}
      </h2>
      {action}
    </div>
  )
}

/** Section-header action pill ("View all", "View calendar"). min-h-9 keeps
 *  the tap target at 36px — comfortable on touch — while the pill keeps its
 *  small visual footprint inside the header row. */
function SectionLink({ children, onClick, ariaLabel }: { children: React.ReactNode; onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-caption-medium text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]"
    >
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
 * QUICK JUMP — the shortcuts bar.
 *
 * ONE slim pill toolbar (a single rounded-full surface, not a boxy strip):
 *   • club chips — logo + name, the club's accent as a soft dot, hover
 *     lift + accent-tinted background — one tap lands in that club's
 *     workspace. Ordered by the store's club order (join order), which is
 *     also the sidebar order.
 *   • icon-only quick actions with tooltip titles; unread counts render
 *     as a tiny accent dot pinned to the icon's corner (the messages
 *     count itself lives on the sidebar's Messages item, so the toolbar
 *     stays calm).
 *   • a trailing "Discover" circular accent button.
 *
 * The whole bar scrolls as ONE snap rail on every breakpoint — no two
 * stacked rails, no wrap. Height is fixed at 48px so it reads as a
 * control strip, distinct from the content cards below.
 * ═══════════════════════════════════════════════════════════════════════ */
function QuickJump({
  clubs,
  unreadUpdates,
  unreadMessages,
  stagger,
}: {
  clubs: { clubId: string; clubName: string; logoUrl: string | null; accentColor: string }[]
  unreadUpdates: number | null
  unreadMessages: number | null
  stagger: number
}) {
  const setView = useAppStore((s) => s.setView)

  const actions = useMemo(
    () => [
      {
        key: "search",
        icon: <Search className="h-4 w-4" />,
        label: "Search",
        dot: false,
        onClick: () => openGlobalSearch(),
      },
      {
        key: "messages",
        icon: <MessageSquare className="h-4 w-4" />,
        label: "Messages",
        dot: (unreadMessages ?? 0) > 0,
        onClick: () => setView("chat"),
      },
      {
        key: "updates",
        icon: <Megaphone className="h-4 w-4" />,
        label: "Updates",
        dot: (unreadUpdates ?? 0) > 0,
        onClick: () => setView("announcements"),
      },
      {
        key: "tasks",
        icon: <CheckSquare className="h-4 w-4" />,
        label: "My tasks",
        dot: false,
        onClick: () => setView("tasks"),
      },
      {
        key: "calendar",
        icon: <CalendarDays className="h-4 w-4" />,
        label: "Calendar",
        dot: false,
        onClick: () => setView("meetings"),
      },
    ],
    [setView, unreadUpdates, unreadMessages]
  )

  return (
    <div
      className="stagger-in scrollbar-thin relative flex h-12 snap-x items-center gap-1.5 overflow-x-auto rounded-full border border-border/70 bg-muted/40 px-1.5 shadow-card backdrop-blur-sm"
      style={{ "--stagger-i": stagger } as React.CSSProperties}
      role="toolbar"
      aria-label="Quick jump shortcuts"
    >
      {clubs.map((c) => (
        <button
          key={c.clubId}
          type="button"
          onClick={() => openClubHome(c.clubId)}
          title={`Open ${c.clubName}`}
          className="group flex h-9 shrink-0 snap-start items-center gap-2 rounded-full border border-transparent pl-1 pr-3 text-caption-medium font-medium text-foreground/90 transition-[background-color,border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-background hover:shadow-sm active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span
            className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white ring-1 ring-black/5 transition-shadow duration-150 group-hover:ring-2"
            style={{ backgroundColor: c.accentColor, ...(c.logoUrl ? {} : { boxShadow: "none" }) }}
          >
            <ResilientImage src={c.logoUrl} alt="" name={c.clubName} className="h-full w-full object-cover" />
          </span>
          <span className="whitespace-nowrap">{c.clubName}</span>
        </button>
      ))}

      {clubs.length > 0 && <span className="h-5 w-px shrink-0 bg-border/70" aria-hidden />}

      {actions.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={a.onClick}
          title={a.label}
          aria-label={a.label}
          className="group relative flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full px-2.5 text-muted-foreground transition-[color,background-color,transform] duration-150 hover:-translate-y-px hover:bg-background hover:text-foreground active:translate-y-0 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:px-2"
        >
          {a.icon}
          {/* Label appears on roomier screens so the rail teaches itself;
              icon-only on mobile keeps the strip within a thumb's scroll. */}
          <span className="hidden whitespace-nowrap text-caption-medium font-medium lg:inline">
            {a.label}
          </span>
          {a.dot && (
            <span
              className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-club ring-2 ring-muted group-hover:ring-background"
              aria-hidden
            />
          )}
        </button>
      ))}

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("clubhub:open-join"))}
        title="Discover clubs"
        aria-label="Discover clubs"
        className="ml-auto flex h-9 shrink-0 snap-start items-center gap-1.5 rounded-full bg-club px-3.5 text-caption-medium font-semibold text-club-foreground shadow-sm transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-px hover:shadow-md hover:brightness-110 active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Compass className="h-4 w-4" />
        <span className="hidden whitespace-nowrap sm:inline">Discover</span>
      </button>

      {/* Edge fade — signals the bar scrolls on narrow screens. */}
      <span
        className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-full bg-gradient-to-l from-muted/90 to-transparent sm:hidden"
        aria-hidden
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
 * NEXT UP HERO — the single next thing on the student's calendar.
 *
 * A wide accent-tinted card (the club's accent, like a club tile grown
 * up): big time block, title, club identity, location, how many members
 * are going, and INLINE RSVP (Going / Maybe / No) so the most common
 * action on the hub is one tap, no navigation. The whole card (minus the
 * RSVP buttons) deep-links into the meeting inside its club.
 *
 * §Advance flow — after the student responds, the hero HOLDS on the
 * confirmed chip for 2s (a check pop says "got it"), then the hero moves
 * on to the next un-responded event: the content block is keyed by the
 * meeting id, so the swap replays the hero-in entrance (rise + settle,
 * reads as the next event expanding into the frame). The responded event
 * stays in "Your week" below with its chip — the hero is a pointer, not
 * a ledger. When nothing un-responded remains, the card collapses to a
 * quiet "No more events currently" with a View calendar link. Clicking
 * the ACTIVE chip is also wired: it re-plays the confirmation and
 * re-arms the advance (so the interaction always responds).
 * ═══════════════════════════════════════════════════════════════════════ */
const ADVANCE_HOLD_MS = 2000

function NextUpHero({ meetings, loading, stagger }: { meetings: HubMeeting[]; loading: boolean; stagger: number }) {
  const qc = useQueryClient()
  const setView = useAppStore((s) => s.setView)

  // The hero points at the FIRST UN-RESPONDED event so answering is always
  // the presented action. `flashId` is the id currently confirmed-on (held
  // visible during the 2s window) — see the advance flow above.
  const target = useMemo(() => meetings.find((m) => !m.myRsvp) ?? null, [meetings])
  const [flashId, setFlashId] = useState<string | null>(null)
  const [justConfirmed, setJustConfirmed] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reduced = useReducedMotion() ?? false

  const shown = flashId ? (meetings.find((m) => m.id === flashId) ?? target) : target
  const following = useMemo(() => {
    if (!shown) return null
    return meetings.find((m) => m.id !== shown.id) ?? null
  }, [meetings, shown])

  // Clear any pending advance timer on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const rsvp = useMutation({
    mutationFn: async ({ clubId, meetingId, status }: { clubId: string; meetingId: string; status: string }) => {
      await api(`/api/clubs/${clubId}/meetings/${meetingId}/rsvp`, { method: "POST", json: { status } })
    },
    onMutate: async ({ meetingId, status }) => {
      await qc.cancelQueries({ queryKey: ["hub"] })
      const prev = qc.getQueryData<HubOverview>(["hub"])
      qc.setQueryData<HubOverview>(["hub"], (old) =>
        old
          ? {
              ...old,
              week: old.week.map((m) => (m.id === meetingId ? { ...m, myRsvp: status } : m)),
            }
          : old
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["hub"], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["hub"] })
      qc.invalidateQueries({ queryKey: ["hub-meetings"] })
    },
  })

  function respond(meeting: HubMeeting, status: string) {
    // Always respond — even on the active chip (re-plays the confirmation
    // and re-arms the advance). The optimistic cache patch makes the chip
    // flip instantly; the POST settles in the background.
    rsvp.mutate({ clubId: meeting.clubId, meetingId: meeting.id, status })
    setFlashId(meeting.id)
    setJustConfirmed(`${meeting.id}:${status}:${Date.now()}`)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setFlashId(null)
      setJustConfirmed(null)
    }, ADVANCE_HOLD_MS)
  }

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="stagger-in flex min-h-[168px] flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-card"
        style={{ "--stagger-i": stagger } as React.CSSProperties}
        role="status"
        aria-label="Loading next event"
      >
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl skeleton-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-2/3 rounded skeleton-shimmer" />
            <div className="h-3 w-1/2 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-8 flex-1 rounded-full skeleton-shimmer" />
          <div className="h-8 flex-1 rounded-full skeleton-shimmer" />
        </div>
      </div>
    )
  }

  // ── Empty state: nothing un-responded (or nothing at all) ─────────────
  if (!shown) {
    const anyAtAll = meetings.length > 0
    return (
      <div
        className="stagger-in flex min-h-[76px] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-border/70 bg-card/60 p-4 shadow-card"
        style={{ "--stagger-i": stagger } as React.CSSProperties}
        aria-label={anyAtAll ? "No more events need responses" : "Nothing coming up"}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground">
          {anyAtAll ? <CalendarCheck className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
        </span>
        <p className="text-body-medium font-medium text-foreground/90">
          {anyAtAll ? "No more events currently need responses" : "Nothing coming up yet"}
        </p>
        <button
          type="button"
          onClick={() => setView("meetings")}
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-3.5 text-caption-medium font-medium text-muted-foreground transition-[color,background-color,transform] duration-150 hover:-translate-y-px hover:bg-accent/60 hover:text-foreground active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          View calendar <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const start = new Date(shown.startTime)
  const when = isToday(start)
    ? `Today · ${format(start, "h:mm a")}`
    : isTomorrow(start)
      ? `Tomorrow · ${format(start, "h:mm a")}`
      : `${format(start, "EEEE, MMMM d")} · ${format(start, "h:mm a")}`
  const myRsvp = shown.myRsvp ?? null
  const holding = flashId === shown.id

  return (
    <div
      className="stagger-in group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 shadow-[var(--shadow-hero)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-card-hover"
      style={{ "--stagger-i": stagger } as React.CSSProperties}
    >
      {/* Club accent wash — a soft diagonal tint from the club's accent so
          the card carries the club's identity without stealing the show. */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.12]"
        style={{
          background: `linear-gradient(135deg, ${shown.club.accentColor} 0%, transparent 55%)`,
        }}
        aria-hidden
      />
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: shown.club.accentColor }}
        aria-hidden
      />

      {/* Keyed by meeting id: answering an event swaps in the next one and
          the content block replays hero-in (rise + settle). */}
      <div key={shown.id} className={cn("relative flex flex-col", !reduced && "animate-hero-in")}>
        <div className="flex items-start gap-3">
          {/* Time block */}
          <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border/70 bg-muted/30 py-2 leading-none">
            <span className="text-[17px] font-bold tabular-nums">{format(start, "d")}</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {format(start, "MMM")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => openInClub(shown.clubId, "meetings", { type: "meeting", id: shown.id })}
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset rounded-lg"
            aria-label={`Open ${shown.title} in ${shown.club.clubName}`}
          >
            <p className="text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/80">Next up</p>
            <p className="mt-0.5 truncate text-[15px] font-semibold leading-snug">{shown.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-muted-foreground">
              <ClubChip club={shown.club} className="py-0" />
              <span className="font-medium text-foreground/70">{when}</span>
              {shown.location && (
                <span className="inline-flex min-w-0 items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" /> {shown.location}
                </span>
              )}
            </p>
          </button>
        </div>

        {/* Social proof + inline RSVP */}
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          {typeof shown.goingCount === "number" && shown.goingCount > 0 && (
            <span className="mr-auto inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-caption-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span className="tabular-nums">{shown.goingCount}</span> going
            </span>
          )}
          <div className={cn("flex items-center gap-1.5", shown.goingCount ? "" : "sm:ml-auto")} role="group" aria-label="RSVP">
            {(
              [
                { status: "going", label: "Going", activeCls: "chip-approved" },
                { status: "maybe", label: "Maybe", activeCls: "chip-pending" },
                { status: "not_going", label: "No", activeCls: "chip-neutral" },
              ] as const
            ).map((opt) => {
              const active = myRsvp === opt.status
              const pending = rsvp.isPending && rsvp.variables?.meetingId === shown.id && rsvp.variables?.status === opt.status
              // The confirmation pop keys off justConfirmed so it replays
              // even when re-clicking the already-active chip.
              const pop = holding && active && justConfirmed?.startsWith(`${shown.id}:${opt.status}`)
              return (
                <button
                  key={opt.status}
                  type="button"
                  aria-pressed={active}
                  disabled={rsvp.isPending}
                  onClick={() => respond(shown, opt.status)}
                  className={cn(
                    "relative inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-caption-medium font-medium transition-[background-color,color,border-color,transform,box-shadow] duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none",
                    active
                      ? cn("border-transparent shadow-sm", opt.activeCls)
                      : "border-border/70 bg-muted/30 text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : pop ? (
                    <CheckCircle2 key={justConfirmed} className="h-3.5 w-3.5 animate-badge-pop" />
                  ) : active ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : null}
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* "Then" teaser — the next-next event, one line. */}
        {following && (
          <p className="relative mt-3 border-t border-border/60 pt-2.5 text-caption text-muted-foreground">
            Then{" "}
            <button
              type="button"
              onClick={() => openInClub(following.clubId, "meetings", { type: "meeting", id: following.id })}
              className="font-medium text-foreground/80 underline decoration-border decoration-1 underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded"
            >
              {following.title}
            </button>{" "}
            <span className="text-muted-foreground/70">
              {isToday(new Date(following.startTime))
                ? format(new Date(following.startTime), "h:mm a")
                : format(new Date(following.startTime), "EEE h:mm a")}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
 * SUGGESTION ROW — one horizontal rail of "what should I do next" chips,
 * derived from real data (never canned): meetings needing an RSVP, overdue
 * tasks, unread updates, urgent announcements, pending hour approvals,
 * and — when everything's clear — a quiet "You're all caught up" state.
 * Each chip deep-links to its source. Hidden entirely while loading.
 *
 * Chips are DELIBERATELY compact (12px text, 3px icons, tight padding) —
 * this row is a whisper of context under the hero, not a second hero. Long
 * titles (urgent announcements) truncate at ~32ch; titles that already
 * start with "URGENT" are not double-prefixed.
 * ═══════════════════════════════════════════════════════════════════════ */
function SuggestionRow({ data, loading, stagger }: { data: HubOverview | undefined; loading: boolean; stagger: number }) {
  const setView = useAppStore((s) => s.setView)

  const suggestions = useMemo(() => {
    if (!data) return []
    const list: { key: string; icon: React.ReactNode; text: string; tone: "accent" | "warning" | "danger" | "neutral"; onClick: () => void }[] = []
    const now = Date.now()

    const needsRsvp = data.week.filter((m) => !m.myRsvp && new Date(m.startTime).getTime() < now + 7 * 24 * 3600 * 1000)
    if (needsRsvp.length > 0) {
      list.push({
        key: "rsvp",
        icon: <CalendarDays className="h-3 w-3" />,
        text: `${needsRsvp.length} event${needsRsvp.length === 1 ? "" : "s"} need${needsRsvp.length === 1 ? "s" : ""} your RSVP`,
        tone: "accent",
        onClick: () => setView("meetings"),
      })
    }

    const overdue = data.tasks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now)
    if (overdue.length > 0) {
      list.push({
        key: "overdue",
        icon: <Clock className="h-3 w-3" />,
        text: `${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`,
        tone: "danger",
        onClick: () => setView("tasks"),
      })
    } else {
      const dueSoon = data.tasks.filter(
        (t) => t.dueDate && new Date(t.dueDate).getTime() >= now && new Date(t.dueDate).getTime() < now + 3 * 24 * 3600 * 1000
      )
      if (dueSoon.length > 0) {
        list.push({
          key: "duesoon",
          icon: <CheckSquare className="h-3 w-3" />,
          text: `${dueSoon.length} task${dueSoon.length === 1 ? "" : "s"} due in the next 3 days`,
          tone: "warning",
          onClick: () => setView("tasks"),
        })
      }
    }

    if (data.stats.unreadUpdates > 0) {
      list.push({
        key: "updates",
        icon: <Megaphone className="h-3 w-3" />,
        text: `${data.stats.unreadUpdates} unread update${data.stats.unreadUpdates === 1 ? "" : "s"}`,
        tone: "neutral",
        onClick: () => setView("announcements"),
      })
    }

    const urgent = data.updates.find((a) => a.isUrgent)
    if (urgent) {
      // Many urgent announcements already carry "URGENT:" in the title —
      // prefixing again reads as a shout ("Urgent: URGENT: …").
      const alreadyUrgent = /^\s*urgent[\s:!.]+/i.test(urgent.title)
      list.push({
        key: "urgent",
        icon: <Zap className="h-3 w-3" />,
        text: alreadyUrgent ? urgent.title.trim() : `Urgent: ${urgent.title}`,
        tone: "danger",
        onClick: () => openInClub(urgent.clubId, "announcements", { type: "announcement", id: urgent.id }),
      })
    }

    if (data.stats.pendingHours > 0) {
      list.push({
        key: "hours",
        icon: <Clock className="h-3 w-3" />,
        text: `${data.stats.pendingHours}h of service awaiting review`,
        tone: "neutral",
        onClick: () => document.getElementById("hub-activity")?.scrollIntoView({ behavior: "smooth" }),
      })
    }

    return list.slice(0, 4)
  }, [data, setView])

  if (loading) return null
  if (suggestions.length === 0) {
    return (
      <div
        className="stagger-in flex items-center gap-2 rounded-full border border-success-subtle bg-success-subtle/40 px-3 py-1.5"
        style={{ "--stagger-i": stagger } as React.CSSProperties}
        role="status"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-foreground" />
        <p className="text-caption text-success-foreground">
          You&rsquo;re all caught up.
        </p>
      </div>
    )
  }

  const toneCls: Record<string, string> = {
    accent: "border-club/30 bg-club-muted/40 text-club-ink hover:border-club/50",
    warning: "border-warning-subtle bg-warning-subtle/50 text-warning-foreground hover:border-warning-foreground/30",
    danger: "border-danger-subtle bg-danger-subtle/50 text-danger-foreground hover:border-danger-foreground/30",
    neutral: "border-border/70 bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground",
  }

  return (
    <div
      className="stagger-in scrollbar-thin flex snap-x items-center gap-1.5 overflow-x-auto pb-0.5"
      style={{ "--stagger-i": stagger } as React.CSSProperties}
      aria-label="Suggested next actions"
    >
      {suggestions.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={s.onClick}
          className={cn(
            // NB: text-[12px] (not .text-caption) — tailwind-merge drops an
            // unknown `text-*` token like text-caption when the tone class
            // (text-club-ink) merges in later.
            "flex h-8 max-w-[340px] shrink-0 snap-start items-center gap-1.5 rounded-full border px-2.5 text-[12px] leading-none font-medium transition-[background-color,border-color,color,transform] duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            toneCls[s.tone]
          )}
        >
          <span className="shrink-0 [&_svg]:h-3 [&_svg]:w-3">{s.icon}</span>
          <span className="min-w-0 truncate">{s.text}</span>
        </button>
      ))}
    </div>
  )
}

/** Count-up numeral — the stat number rises from 0 (or its previous value)
 *  over ~600ms with an ease-out curve. Writes textContent directly via rAF
 *  (no per-frame React state), skips straight to the final value under
 *  prefers-reduced-motion, and animates FROM the previous value when the
 *  stats refresh so the motion reads as "updated", not "reset". */
function CountUp({ to, suffix }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const fromRef = useRef(0)
  const reduced = useReducedMotion() ?? false

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const final = `${to}${suffix ?? ""}`
    if (reduced) {
      el.textContent = final
      fromRef.current = to
      return
    }
    let raf = 0
    const from = fromRef.current
    const t0 = performance.now()
    const dur = 620
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      el.textContent = `${Math.round(from + (to - from) * eased)}${suffix ?? ""}`
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, suffix, reduced])

  return (
    <span ref={ref} className="tabular-nums">
      {`${to}${suffix ?? ""}`}
    </span>
  )
}

function StatCard({
  icon, label, value, suffix, hint, stagger, onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number | null
  suffix?: string
  hint?: string
  stagger?: number
  onClick?: () => void
}) {
  const loading = value === null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "stagger-in group relative flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-card p-3.5 text-left shadow-card transition-[border-color,background-color,transform,box-shadow] duration-200 hover:border-club/40 hover:bg-accent/40 hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-club/50 disabled:pointer-events-none"
      )}
      style={{ "--stagger-i": stagger ?? 0 } as React.CSSProperties}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/70 text-club-ink transition-[background-color,transform] duration-200 group-hover:scale-105 group-hover:bg-club-muted [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      {loading ? (
        <span className="h-8 w-12 rounded skeleton-shimmer" aria-label="Loading" />
      ) : (
        <span className="font-display text-[1.625rem] font-bold leading-none tracking-[-0.03em] tabular-nums">
          <CountUp to={value ?? 0} suffix={suffix} />
        </span>
      )}
      <span className="text-caption-medium text-muted-foreground">
        {label}
        {hint ? <span className="text-muted-foreground/60"> · {hint}</span> : null}
      </span>
      {/* A quiet chevron, revealed on hover/focus — signals the whole card
          is a shortcut into that view (the affordance users otherwise only
          discover by accident). */}
      <ChevronRight className="absolute right-3 top-3.5 h-3.5 w-3.5 text-muted-foreground/0 transition-colors duration-200 group-hover:text-muted-foreground/70 group-focus-visible:text-muted-foreground/70" aria-hidden />
    </button>
  )
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today"
  if (isTomorrow(d)) return "Tomorrow"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEEE, MMMM d")
}

function WeekAgenda({ meetings, loading }: { meetings: HubMeeting[]; loading: boolean }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; items: HubMeeting[] }>()
    for (const m of meetings) {
      const d = new Date(m.startTime)
      const key = format(d, "yyyy-MM-dd")
      if (!map.has(key)) map.set(key, { label: dayLabel(d), items: [] })
      map.get(key)!.items.push(m)
    }
    return Array.from(map.values())
  }, [meetings])

  if (loading) {
    return (
      <div className="space-y-3 p-4" role="status" aria-label="Loading your week">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg skeleton-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-2/3 rounded skeleton-shimmer" />
              <div className="h-3 w-1/3 rounded skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (meetings.length === 0) {
    // Compact one-liner — the section shrinks instead of filling space.
    return (
      <p className="flex items-center gap-2 px-4 py-4 text-caption text-muted-foreground">
        <CalendarDays className="h-4 w-4 shrink-0 opacity-50" />
        No events yet — new events will appear here.
      </p>
    )
  }

  return (
    <div className="divide-y divide-border/50">
      {grouped.map((group) => (
        <div key={group.label} className="px-4 py-3">
          <p className="text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/70 mb-2 sticky top-0 bg-card/90 backdrop-blur-sm z-[1]">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openInClub(m.clubId, "meetings", { type: "meeting", id: m.id })}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-border/70 bg-muted/30 leading-none"
                    style={{ borderLeft: `3px solid ${m.club.accentColor}` }}
                  >
                    <span className="text-[13px] font-semibold tabular-nums">
                      {format(new Date(m.startTime), isToday(new Date(m.startTime)) ? "HH:mm" : "d")}
                    </span>
                    {/* date-fns v4 throws on an empty format pattern, so the
                        month abbrev renders only for non-today rows. */}
                    {!isToday(new Date(m.startTime)) && (
                      <span className="mt-0.5 text-[9px] uppercase text-muted-foreground">
                        {format(new Date(m.startTime), "MMM")}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-body-medium font-medium">{m.title}</span>
                      {m.myRsvp && (
                        <span className={cn(
                          "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium",
                          m.myRsvp === "going" && "chip-approved",
                          m.myRsvp === "maybe" && "chip-pending",
                          m.myRsvp === "not_going" && "chip-neutral",
                        )}>
                          {RSVP_LABEL[m.myRsvp] ?? m.myRsvp}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
                      <ClubChip club={m.club} className="py-0" />
                      {m.location && (
                        <span className="inline-flex min-w-0 items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" /> {m.location}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function MyTasks({ tasks, loading }: { tasks: HubTask[]; loading: boolean }) {
  const qc = useQueryClient()

  const toggle = useMutation({
    mutationFn: async ({ task, next }: { task: HubTask; next: string }) => {
      await api(`/api/clubs/${task.clubId}/tasks/${task.id}`, {
        method: "PATCH",
        json: { status: next },
      })
    },
    onMutate: async ({ task, next }) => {
      // Optimistic: patch the shared ["hub"] cache so the checkbox responds
      // instantly; the club-task invalidations catch the rest.
      await qc.cancelQueries({ queryKey: ["hub"] })
      const prev = qc.getQueryData<HubOverview>(["hub"])
      qc.setQueryData<HubOverview>(["hub"], (old) =>
        old
          ? {
              ...old,
              tasks: next === "done"
                ? old.tasks.filter((t) => t.id !== task.id)
                : old.tasks,
              stats: { ...old.stats, pendingTasks: Math.max(0, old.stats.pendingTasks - (next === "done" ? 1 : 0)) },
            }
          : old
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["hub"], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["hub"] })
      qc.invalidateQueries({ queryKey: ["hub-tasks"] })
    },
  })

  if (loading) {
    return (
      <div className="space-y-3 p-4" role="status" aria-label="Loading your tasks">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-5 w-5 rounded skeleton-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-3/4 rounded skeleton-shimmer" />
              <div className="h-3 w-1/2 rounded skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (tasks.length === 0) {
    // Compact one-liner — a clear task list shrinks the card to one line.
    return (
      <p className="flex items-center gap-2 px-4 py-4 text-caption text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success-foreground/70" />
        No tasks — you&rsquo;re all caught up.
      </p>
    )
  }

  const done = tasks.filter((t) => t.status === "done").length
  return (
    <div className="p-2">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-club transition-all duration-500"
            style={{ width: `${Math.min(100, Math.round((done / Math.max(1, tasks.length)) * 100))}%` }}
          />
        </div>
        <span className="text-caption-medium tabular-nums text-muted-foreground">{tasks.length} open</span>
      </div>
      <ul className="space-y-0.5">
        {tasks.map((t) => {
          const overdue = t.dueDate && new Date(t.dueDate).getTime() < Date.now()
          const dueSoon =
            t.dueDate && !overdue && new Date(t.dueDate).getTime() < Date.now() + 3 * 24 * 3600 * 1000
          return (
            <li key={t.id}>
              <div className="group flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
                <button
                  type="button"
                  aria-label={t.status === "done" ? `Reopen "${t.title}"` : `Mark "${t.title}" as done`}
                  disabled={toggle.isPending}
                  onClick={() =>
                    toggle.mutate({
                      task: t,
                      next: t.status === "done" ? "not_started" : "done",
                    })
                  }
                  className="mt-0.5 shrink-0 rounded-full text-muted-foreground/50 transition-colors hover:text-club focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                >
                  {toggle.isPending && toggle.variables?.task.id === t.id ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : t.status === "done" ? (
                    <CheckCircle2 className="h-[18px] w-[18px] text-club" />
                  ) : (
                    <Circle className="h-[18px] w-[18px]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => openInClub(t.clubId, "tasks", { type: "task", id: t.id })}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-lg"
                >
                  <span className={cn("block truncate text-body-medium", t.status === "done" && "text-muted-foreground line-through")}>
                    {t.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
                    <ClubChip club={t.club} className="py-0" />
                    {t.dueDate && (
                      <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-danger-foreground")}>
                        <Clock className="h-3 w-3" />
                        {overdue ? "Overdue · " : dueSoon ? "Due soon · " : "Due "}
                        {format(new Date(t.dueDate), "MMM d")}
                      </span>
                    )}
                    {t.subtaskTotal > 0 && (
                      <span className="tabular-nums">
                        {t.subtaskDone}/{t.subtaskTotal}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function UpdatesFeed({ updates, loading }: { updates: HubAnnouncement[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="divide-y divide-border/50" role="status" aria-label="Loading updates">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-4">
            <div className="h-9 w-9 rounded-lg skeleton-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded skeleton-shimmer" />
              <div className="h-3 w-full rounded skeleton-shimmer" />
              <div className="h-3 w-4/5 rounded skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (updates.length === 0) {
    // Compact one-liner — quiet, single-line empty state.
    return (
      <p className="flex items-center gap-2 px-4 py-4 text-caption text-muted-foreground">
        <Megaphone className="h-4 w-4 shrink-0 opacity-50" />
        No updates yet — announcements will appear here.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border/50">
      {updates.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => openInClub(a.clubId, "announcements", { type: "announcement", id: a.id })}
            className="group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
          >
            <ClubTile club={a.club} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-body-medium font-medium">{a.title}</span>
                {a.isUrgent && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-subtle px-1.5 py-px text-[10px] font-medium text-danger-foreground">
                    <Zap className="h-2.5 w-2.5" /> Urgent
                  </span>
                )}
                {a.isPinned && !a.isUrgent && <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
              </span>
              <span className="mt-1 line-clamp-2 block text-caption leading-4 text-muted-foreground">
                {a.body}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground/80">
                <span className="font-medium text-muted-foreground">{a.club.clubName}</span>
                {a.authorName && <span>{a.authorName}</span>}
                <span>{relativeTime(a.createdAt)}</span>
                {a.reactionCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <Heart className="h-3 w-3" /> {a.reactionCount}
                  </span>
                )}
                {a.commentCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" /> {a.commentCount}
                  </span>
                )}
                {a.hasPoll && <span className="rounded bg-muted px-1 py-px text-[10px]">Poll</span>}
              </span>
            </span>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function MyClubs({ clubs, loading }: { clubs: HubClubSummary[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2" role="status" aria-label="Loading clubs">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl skeleton-shimmer" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
      {clubs.map((c) => (
        <button
          key={c.clubId}
          type="button"
          onClick={() => openClubHome(c.clubId)}
          className="group relative flex flex-col overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-3 pl-3.5 text-left transition-[border-color,background-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-card active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span
            className="absolute inset-y-0 left-0 w-[3px] opacity-70 transition-opacity duration-150 group-hover:opacity-100"
            style={{ backgroundColor: c.accentColor }}
            aria-hidden
          />
          <span className="flex items-center gap-2.5">
            <ClubTile club={c} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-medium font-semibold">{c.clubName}</span>
              <span className="text-caption capitalize text-muted-foreground">{c.role}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </span>
          <span className="mt-2.5 flex items-center gap-1.5 text-caption text-muted-foreground">
            {c.nextMeeting ? (
              <>
                <CalendarDays className="h-3 w-3 shrink-0" style={{ color: c.accentColor }} />
                <span className="truncate">
                  {format(new Date(c.nextMeeting.startTime), "EEE, MMM d")} · {c.nextMeeting.title}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground/60">No upcoming meetings</span>
            )}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("clubhub:open-join"))}
        className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/80 text-muted-foreground transition-colors hover:border-border hover:bg-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Compass className="h-4 w-4" />
        <span className="text-caption-medium">Discover clubs</span>
      </button>
    </div>
  )
}

function ActivityStrip({
  activity,
  loading,
}: {
  activity: HubOverview["activity"] | undefined
  loading: boolean
}) {
  const setView = useAppStore((s) => s.setView)

  if (loading || !activity) {
    return (
      <div className="grid grid-cols-1 divide-y divide-border/50 md:grid-cols-3 md:divide-x md:divide-y-0" role="status" aria-label="Loading activity">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-5">
            <div className="h-3 w-20 rounded skeleton-shimmer" />
            <div className="mt-3 h-9 w-24 rounded skeleton-shimmer" />
            <div className="mt-2 h-3 w-32 rounded skeleton-shimmer" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 divide-y divide-border/50 md:grid-cols-3 md:divide-x md:divide-y-0">
      {/* Service hours */}
      <div className="p-4">
        <p className="text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/70">Service hours</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-numeral text-club-ink">
            {Math.round(activity.approvedHours)}
            <span className="text-[0.55em] font-semibold"> h</span>
          </span>
          {activity.pendingCount > 0 && (
            <span className="rounded-full chip-pending px-2 py-0.5 text-[11px] font-medium">
              {activity.pendingCount} pending
            </span>
          )}
        </p>
        <ul className="mt-3 space-y-1.5">
          {activity.recentHours.slice(0, 3).map((h) => (
            <li key={h.id} className="flex items-center gap-2 text-caption text-muted-foreground">
              <ClubDot club={{ clubName: h.clubName, accentColor: h.clubAccent }} className="opacity-70" />
              <span className="min-w-0 flex-1 truncate">{h.reasonText}</span>
              <span className={cn("shrink-0 tabular-nums font-medium", h.status === "approved" ? "text-success-foreground" : "text-warning-foreground")}>
                {h.status === "approved" ? "+" : ""}
                {h.hours}h
              </span>
            </li>
          ))}
          {activity.recentHours.length === 0 && (
            <li className="text-caption text-muted-foreground/60">No submissions yet</li>
          )}
        </ul>
      </div>

      {/* Badges */}
      <div className="p-4">
        <p className="text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/70">Badges earned</p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-numeral">{activity.badgesTotal}</span>
          <Trophy className="h-4 w-4 text-muted-foreground/50" />
        </p>
        <ul className="mt-3 space-y-2">
          {activity.recentBadges.map((b) => (
            <li key={b.id} className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/70 text-base" aria-hidden>
                {b.emoji}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-caption-medium font-medium text-foreground">{b.name}</span>
                <span className="text-caption text-muted-foreground">
                  {b.clubName} · {relativeTime(b.awardedAt)}
                </span>
              </span>
            </li>
          ))}
          {activity.recentBadges.length === 0 && (
            <li className="text-caption text-muted-foreground/60">
              No badges yet.
            </li>
          )}
        </ul>
      </div>

      {/* Participation summary */}
      <div className="flex flex-col p-4">
        <p className="text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/70">Participation</p>
        <ul className="mt-3 space-y-2.5 text-caption-medium text-muted-foreground">
          <li className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="flex-1">{activity.pendingCount} hour submission{activity.pendingCount === 1 ? "" : "s"} awaiting review</span>
          </li>
          <li className="flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="flex-1">
              {activity.badgesTotal > 0
                ? `Recognized ${activity.badgesTotal} time${activity.badgesTotal === 1 ? "" : "s"} by your clubs`
                : "No recognitions yet"}
            </span>
          </li>
        </ul>
        <div className="mt-auto pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between border border-border/70 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => {
              // Jump into the most relevant club's hours view — the club
              // with the most recent submission, else the first membership.
              const targetClubId =
                activity.recentHours[0]?.clubId ??
                useAppStore.getState().clubs[0]?.clubId
              if (targetClubId) openInClub(targetClubId, "hours")
            }}
          >
            Open my involvement <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
