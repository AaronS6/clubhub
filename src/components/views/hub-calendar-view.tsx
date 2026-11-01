"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  addMonths, format, isSameDay, isSameMonth, isToday, startOfMonth,
  endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, getDay,
} from "date-fns"
import {
  CalendarDays, ChevronLeft, ChevronRight, MapPin, CalendarClock,
  Users, Ban,
} from "lucide-react"
import { api } from "@/lib/api/client"
import { usePollingFallback } from "@/lib/realtime-store"
import { openInClub } from "@/lib/hub-nav"
import type { HubMeeting } from "@/lib/hub-types"
import { ClubChip } from "@/components/shared/club-badge-chip"
import { cn } from "@/lib/utils"

/**
 * CALENDAR (My Hub context) — one combined calendar across every club the
 * student belongs to. Month grid + agenda for the selected day, club filter
 * chips, and full club identity on every entry. Clicking an event jumps to
 * the original meeting inside its club workspace (where RSVP, editing and
 * the .ics export live — none of that is duplicated here).
 */

interface HubMeetingsResponse {
  meetings: HubMeeting[]
  clubs: { clubId: string; clubName: string; logoUrl: string | null; accentColor: string }[]
  from: string
  to: string
}

const RSVP_LABEL: Record<string, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not going",
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function HubCalendarView() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [clubFilter, setClubFilter] = useState<string | null>(null)

  // Query window = the visible month grid, EXTENDED 3 months forward so the
  // Upcoming events panel can list what's beyond the current month. (The
  // API caps results at 400 rows; 3 months of student-club meetings sits
  // comfortably inside that, and anything further out is fluid anyway.)
  const windowFrom = useMemo(() => startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), [month])
  const windowTo = useMemo(
    () => endOfWeek(endOfMonth(addMonths(month, 3)), { weekStartsOn: 1 }),
    [month]
  )

  const { data, isLoading } = useQuery<HubMeetingsResponse>({
    queryKey: ["hub-meetings", format(windowFrom, "yyyy-MM-dd"), format(windowTo, "yyyy-MM-dd")],
    queryFn: () =>
      api<HubMeetingsResponse>(
        `/api/hub/meetings?from=${encodeURIComponent(windowFrom.toISOString())}&to=${encodeURIComponent(windowTo.toISOString())}`
      ),
    refetchInterval: usePollingFallback(30_000),
    staleTime: 15_000,
  })

  const meetings = useMemo(
    () => (clubFilter ? data?.meetings.filter((m) => m.clubId === clubFilter) : data?.meetings) ?? [],
    [data, clubFilter]
  )

  const byDay = useMemo(() => {
    const map = new Map<string, HubMeeting[]>()
    for (const m of meetings) {
      const key = format(new Date(m.startTime), "yyyy-MM-dd")
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return map
  }, [meetings])

  const gridDays = useMemo(
    () => eachDayOfInterval({
      start: windowFrom,
      end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    }),
    [windowFrom, month]
  )

  const dayMeetings = byDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []
  // Upcoming = everything from NOW forward (whole year window), soonest
  // first, cancelled events excluded. 8 rows keeps the panel useful without
  // becoming a second agenda.
  const upcoming = useMemo(
    () =>
      meetings
        .filter((m) => new Date(m.startTime).getTime() >= Date.now() && !m.cancelledAt)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 8),
    [meetings]
  )

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">Calendar</h1>
          <p className="text-body text-muted-foreground mt-1">
            Every meeting and event, one calendar.
          </p>
        </div>
        <MonthNav
          month={month}
          onPrev={() => setMonth((m) => addMonths(m, -1))}
          onNext={() => setMonth((m) => addMonths(m, 1))}
          onToday={() => {
            const now = new Date()
            setMonth(startOfMonth(now))
            setSelectedDay(now)
          }}
        />
      </header>

      {/* Club filter chips */}
      {data && data.clubs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by club">
          <button
            type="button"
            aria-pressed={clubFilter === null}
            onClick={() => setClubFilter(null)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-caption-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              clubFilter === null
                ? "border-transparent bg-secondary font-semibold text-foreground"
                : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            All clubs
          </button>
          {data.clubs.map((c) => (
            <button
              key={c.clubId}
              type="button"
              aria-pressed={clubFilter === c.clubId}
              onClick={() => setClubFilter(clubFilter === c.clubId ? null : c.clubId)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-caption-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                clubFilter === c.clubId
                  ? "border-transparent bg-secondary font-semibold text-foreground"
                  : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: c.accentColor }} />
              {c.clubName}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Month grid */}
        <section
          className="lg:col-span-7 rounded-xl border border-border/80 bg-card shadow-card overflow-hidden"
          aria-label="Month calendar"
        >
          <div className="grid grid-cols-7 border-b border-border/70">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-2 text-center text-caption-medium uppercase tracking-[0.1em] text-muted-foreground/70"
              >
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{d[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" role="grid">
            {isLoading
              ? Array.from({ length: 42 }).map((_, i) => (
                  <div key={i} className="aspect-square sm:aspect-[1/0.85] p-1.5">
                    <div className="h-full w-full rounded-lg skeleton-shimmer" />
                  </div>
                ))
              : gridDays.map((day) => {
                  const inMonth = isSameMonth(day, month)
                  const key = format(day, "yyyy-MM-dd")
                  const dayEvents = byDay.get(key) ?? []
                  const isSel = isSameDay(day, selectedDay)
                  return (
                    <button
                      key={key}
                      role="gridcell"
                      aria-label={`${format(day, "EEEE, MMMM d")}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`}
                      aria-selected={isSel}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "relative flex aspect-square sm:aspect-[1/0.9] flex-col border-b border-r border-border/40 p-1.5 text-left align-top transition-colors focus-visible:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                        inMonth ? "hover:bg-accent/40" : "opacity-40 hover:opacity-70",
                        isSel && "bg-accent/50",
                        (getDay(day) === 0) && "border-r-0"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 shrink-0 items-center justify-center text-caption-medium tabular-nums",
                          isToday(day) && "bg-club font-bold text-club-foreground",
                          isSel && !isToday(day) && "font-bold text-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {/* Event chips — a sliver of WHAT the day holds (time +
                          title, tinted by the owning club), not just a dot.
                          sm+ shows up to two titles; mobile keeps compact
                          pill bars so the grid still fits a thumb column. */}
                      <span className="mt-1 flex min-h-0 flex-col gap-0.5 overflow-hidden">
                        {dayEvents.slice(0, 2).map((e) => (
                          <span
                            key={e.id}
                            aria-hidden
                            className={cn(
                              "truncate rounded px-1 text-[10px] leading-4 font-medium",
                              e.cancelledAt && "opacity-40 line-through"
                            )}
                            style={{
                              backgroundColor: `color-mix(in oklab, ${e.club.accentColor} 18%, transparent)`,
                              color: e.club.accentColor,
                            }}
                            title={`${e.title} · ${format(new Date(e.startTime), "h:mm a")}`}
                          >
                            <span className="hidden sm:inline">{format(new Date(e.startTime), "h:mm")} </span>
                            {e.title}
                          </span>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="px-1 text-[9px] leading-3 text-muted-foreground">
                            +{dayEvents.length - 2} more
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
          </div>
        </section>

        {/* Agenda for selected day + upcoming */}
        <div className="lg:col-span-5 space-y-4">
          <section
            className="rounded-xl border border-border/80 bg-card shadow-card overflow-hidden"
            aria-label="Selected day"
          >
            <div className="border-b border-border/70 px-4 py-3">
              <h2 className="text-body-medium font-semibold">
                {isToday(selectedDay) ? "Today" : format(selectedDay, "EEEE, MMMM d")}
              </h2>
            </div>
            {dayMeetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <CalendarDays className="mb-2 h-5 w-5 text-muted-foreground/50" />
                <p className="text-caption text-muted-foreground">Nothing scheduled this day</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {dayMeetings.map((m) => (
                  <MeetingRow key={m.id} meeting={m} />
                ))}
              </ul>
            )}
          </section>

        {/* Upcoming events — the forward-looking agenda across every club,
            spanning past the visible month (the query window covers a year).
            Always rendered: an empty state here answers "is anything coming?"
            at a glance, which a missing panel never can. */}
        <section
          className="rounded-xl border border-border/80 bg-card shadow-card overflow-hidden"
          aria-label="Upcoming events"
        >
          <div className="border-b border-border/70 px-4 py-3">
            <h2 className="flex items-center gap-2 text-body-medium font-semibold">
              <CalendarClock className="h-4 w-4 text-muted-foreground" /> Upcoming events
              {upcoming.length > 0 && (
                <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
                  {upcoming.length}
                </span>
              )}
            </h2>
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-8 text-center">
              <CalendarClock className="mb-2 h-5 w-5 text-muted-foreground/50" />
              <p className="text-caption text-muted-foreground">Nothing scheduled ahead</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {upcoming.map((m) => (
                <MeetingRow key={m.id} meeting={m} showDate />
              ))}
            </ul>
          )}
        </section>
        </div>
      </div>
    </div>
  )
}

function MeetingRow({ meeting, showDate = false }: { meeting: HubMeeting; showDate?: boolean }) {
  const start = new Date(meeting.startTime)
  return (
    <li>
      <button
        type="button"
        onClick={() => openInClub(meeting.clubId, "meetings", { type: "meeting", id: meeting.id })}
        className={cn(
          "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
          meeting.cancelledAt && "opacity-55"
        )}
      >
        <span className="flex w-14 shrink-0 flex-col items-center">
          <span className="text-body-medium font-semibold tabular-nums">{format(start, "h:mm")}</span>
          <span className="text-[10px] uppercase text-muted-foreground">
            {format(start, "a")}
          </span>
          {/* In the Upcoming list the day varies row to row — show it so the
              timeline reads at a glance (today's rows omit it; the section
              header already anchors the date). */}
          {showDate && !isToday(start) && (
            <span className="mt-0.5 text-[10px] font-medium text-muted-foreground/80">
              {format(start, "MMM d")}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="h-9 w-[3px] shrink-0 rounded-full"
          style={{ backgroundColor: meeting.club.accentColor }}
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-body-medium font-medium", meeting.cancelledAt && "line-through")}>
            {meeting.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-caption text-muted-foreground">
            <ClubChip club={meeting.club} className="py-0" />
            {meeting.teamName && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {meeting.teamName}
              </span>
            )}
            {meeting.location && (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" /> {meeting.location}
              </span>
            )}
          </span>
        </span>
        {meeting.cancelledAt ? (
          <span className="shrink-0 rounded-full chip-neutral px-2 py-0.5 text-[10px] font-medium">
            <span className="inline-flex items-center gap-1">
              <Ban className="h-2.5 w-2.5" /> Cancelled
            </span>
          </span>
        ) : meeting.myRsvp ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              meeting.myRsvp === "going" && "chip-approved",
              meeting.myRsvp === "maybe" && "chip-pending",
              meeting.myRsvp === "not_going" && "chip-neutral"
            )}
          >
            {RSVP_LABEL[meeting.myRsvp] ?? meeting.myRsvp}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        )}
      </button>
    </li>
  )
}

function MonthNav({
  month, onPrev, onNext, onToday,
}: {
  month: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onToday}
        className="mr-1 rounded-lg border border-border/80 px-2.5 py-1.5 text-caption-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        Today
      </button>
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous month"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span
        aria-live="polite"
        className="min-w-[8.5rem] text-center text-body-medium font-semibold"
      >
        {format(month, "MMMM yyyy")}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next month"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
