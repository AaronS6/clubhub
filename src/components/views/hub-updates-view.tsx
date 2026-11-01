"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Megaphone, Pin, Zap, Heart, MessageSquare, ChevronRight, Loader2, BarChart3,
} from "lucide-react"
import { api } from "@/lib/api/client"
import { usePollingFallback } from "@/lib/realtime-store"
import { openInClub } from "@/lib/hub-nav"
import type { HubAnnouncement } from "@/lib/hub-types"
import { ClubTile } from "@/components/shared/club-badge-chip"
import { relativeTime } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"

/**
 * UPDATES (My Hub context) — announcements from every club the student
 * belongs to in one chronological feed, each badged with full club identity.
 * Reactions, comments, polls and everything else happen in the ORIGINAL
 * club announcement (click-through) — this page is a lens, not a duplicate
 * announcement system.
 */

interface HubUpdatesResponse {
  items: HubAnnouncement[]
  hasMore: boolean
  page: number
  total: number
  clubs: { clubId: string; clubName: string; logoUrl: string | null; accentColor: string }[]
}

export function HubUpdatesView() {
  const [clubFilter, setClubFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching } = useQuery<HubUpdatesResponse>({
    queryKey: ["hub-updates", page],
    queryFn: () => api<HubUpdatesResponse>(`/api/hub/announcements?page=${page}`),
    refetchInterval: usePollingFallback(30_000),
    staleTime: 15_000,
  })

  // Client-side club filter (server pages are cross-club chronological; the
  // filter narrows the current pages without extra round-trips).
  const items = useMemo(
    () => (clubFilter ? data?.items.filter((a) => a.clubId === clubFilter) : data?.items) ?? [],
    [data, clubFilter]
  )

  // §9 — visiting the combined feed marks the cross-club updates as "seen",
  // clearing the shared-nav unread dot (same convention as the per-club
  // announcements view's baseline stamp).
  useEffect(() => {
    const latest = data?.items?.[0]?.createdAt
    if (!latest) return
    try {
      localStorage.setItem("last-seen-announcements-hub", String(new Date(latest).getTime()))
    } catch {
      // ignore — private browsing
    }
  }, [data])

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-page-title">Updates</h1>
        <p className="text-body text-muted-foreground mt-1">
          Every announcement, newest first.
        </p>
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

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading updates">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/80 bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg skeleton-shimmer" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-1/2 rounded skeleton-shimmer" />
                  <div className="h-3 w-1/3 rounded skeleton-shimmer" />
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-3 w-full rounded skeleton-shimmer" />
                <div className="h-3 w-5/6 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-6 py-16 text-center shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
            <Megaphone className="h-5 w-5" />
          </div>
          <h3 className="text-card-title">No announcements yet</h3>
          <p className="text-body text-muted-foreground mt-1.5 max-w-sm">
            When your clubs post announcements{clubFilter ? " (matching this filter)" : ""}, they&rsquo;ll
            appear here.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((a) => (
              <AnnouncementCard key={a.id} announcement={a} />
            ))}
          </ul>

          {/* Load more */}
          <div className="flex justify-center pt-1">
            {data?.hasMore ? (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
                className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-card px-4 py-2 text-caption-medium text-muted-foreground shadow-card transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
              >
                {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more updates
              </button>
            ) : (
              <p className="text-caption text-muted-foreground/60">You&rsquo;re all caught up.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AnnouncementCard({ announcement: a }: { announcement: HubAnnouncement }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => openInClub(a.clubId, "announcements", { type: "announcement", id: a.id })}
        className="group w-full rounded-xl border border-border/80 bg-card p-4 text-left shadow-card transition-[border-color,background-color,transform] duration-150 hover:border-border hover:bg-accent/30 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {/* Identity row — club + author + time */}
        <div className="flex items-center gap-2.5">
          <ClubTile club={a.club} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-caption-medium font-semibold text-foreground">
                {a.club.clubName}
              </span>
              {a.isUrgent && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-subtle px-1.5 py-px text-[10px] font-medium text-danger-foreground">
                  <Zap className="h-2.5 w-2.5" /> Urgent
                </span>
              )}
              {a.isPinned && !a.isUrgent && (
                <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-label="Pinned" />
              )}
            </div>
            <div className="mt-px flex items-center gap-1.5 text-caption text-muted-foreground">
              {a.authorName ? (
                <>
                  <span className="truncate">{a.authorName}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span>{relativeTime(a.createdAt)}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </div>

        {/* Body */}
        <h2 className="mt-3 text-card-title">{a.title}</h2>
        <p className="mt-1.5 line-clamp-3 text-body leading-6 text-muted-foreground">{a.body}</p>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-muted-foreground/80">
          {a.tag && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `color-mix(in oklab, ${a.club.accentColor} 12%, transparent)`,
                color: `color-mix(in oklab, ${a.club.accentColor} 75%, var(--foreground))`,
              }}
            >
              {a.tag}
            </span>
          )}
          {a.hasPoll && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
              <BarChart3 className="h-3 w-3" /> Poll
            </span>
          )}
          {a.reactionCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {a.reactionCount}
            </span>
          )}
          {a.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {a.commentCount}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}
