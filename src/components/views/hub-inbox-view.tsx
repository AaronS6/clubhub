"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { format, isToday, isThisYear } from "date-fns"
import {
  MessageSquare, Hash, Users, ChevronRight, Inbox, CheckCheck,
} from "lucide-react"
import { api } from "@/lib/api/client"
import { usePollingFallback } from "@/lib/realtime-store"
import { openClubConversation } from "@/lib/hub-nav"
import type { HubConversation } from "@/lib/hub-types"
import { ClubChip, ClubTile } from "@/components/shared/club-badge-chip"
import { UnreadDot } from "@/components/shared/unread-indicator"
import { cn } from "@/lib/utils"

/**
 * MESSAGES (My Hub context) — a combined inbox across every club the
 * student belongs to: club-wide channels, group chats and DMs, most
 * recently active first, with unread indicators and club identity.
 *
 * Opening a conversation switches into its club workspace and opens the
 * EXISTING chat there (full history, typing indicators, reactions, pins —
 * none of that is duplicated here).
 */

export function HubInboxView() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [clubFilter, setClubFilter] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ conversations: HubConversation[] }>({
    queryKey: ["hub-conversations"],
    queryFn: () => api<{ conversations: HubConversation[] }>("/api/hub/conversations"),
    refetchInterval: usePollingFallback(15_000),
    staleTime: 8_000,
  })

  const clubs = useMemo(() => {
    const map = new Map<string, { clubId: string; clubName: string; accentColor: string }>()
    for (const c of data?.conversations ?? []) {
      if (!map.has(c.clubId))
        map.set(c.clubId, { clubId: c.clubId, clubName: c.club.clubName, accentColor: c.club.accentColor })
    }
    return Array.from(map.values())
  }, [data])

  const conversations = useMemo(() => {
    let list = data?.conversations ?? []
    if (unreadOnly) list = list.filter((c) => c.unreadCount > 0)
    if (clubFilter) list = list.filter((c) => c.clubId === clubFilter)
    return list
  }, [data, unreadOnly, clubFilter])

  const totalUnread = (data?.conversations ?? []).reduce((acc, c) => acc + c.unreadCount, 0)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title">Messages</h1>
          <p className="text-body text-muted-foreground mt-1">
            Every conversation in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUnreadOnly((v) => !v)}
          aria-pressed={unreadOnly}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-caption-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            unreadOnly
              ? "border-transparent bg-secondary font-semibold text-foreground"
              : "border-border/80 text-muted-foreground hover:border-border hover:text-foreground"
          )}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Unread only{totalUnread > 0 ? ` · ${totalUnread}` : ""}
        </button>
      </header>

      {/* Club filter chips */}
      {clubs.length > 1 && (
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
          {clubs.map((c) => (
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

      {isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading conversations">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-4">
              <div className="h-10 w-10 rounded-full skeleton-shimmer" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-1/3 rounded skeleton-shimmer" />
                <div className="h-3 w-2/3 rounded skeleton-shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card px-6 py-16 text-center shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <h3 className="text-card-title">
            {unreadOnly ? "No unread messages" : "No conversations yet"}
          </h3>
          <p className="text-body text-muted-foreground mt-1.5 max-w-sm">
            {unreadOnly ? "You're all caught up." : "Club channels and DMs will appear here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <ConversationRow key={c.id} conversation={c} />
          ))}
        </ul>
      )}
    </div>
  )
}

function conversationIcon(c: HubConversation) {
  if (c.type === "club_wide")
    return <Hash className="h-4 w-4 text-muted-foreground" aria-hidden />
  if (c.type === "group")
    return <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
  return <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, "h:mm a")
  if (isThisYear(d)) return format(d, "MMM d")
  return format(d, "MMM d, yyyy")
}

function ConversationRow({ conversation: c }: { conversation: HubConversation }) {
  const preview = c.lastMessage
    ? c.lastMessage.isDeleted
      ? "Message deleted"
      : c.lastMessage.body
    : "No messages yet"

  return (
    <li>
      <button
        type="button"
        onClick={() => openClubConversation(c.clubId, c.id)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left shadow-card transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          c.unreadCount > 0
            ? "border-border bg-card hover:bg-accent/30"
            : "border-border/80 bg-card hover:border-border hover:bg-accent/30"
        )}
      >
        {/* Avatar: the other member for DMs, a club-tinted tile otherwise */}
        {c.otherUser ? (
          <ClubTile
            club={{ clubName: c.otherUser.name, logoUrl: null, accentColor: c.club.accentColor }}
            className="rounded-full"
          />
        ) : (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: c.club.accentColor }}
          >
            {conversationIcon(c)}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-body-medium",
                c.unreadCount > 0 ? "font-semibold text-foreground" : "font-medium"
              )}
            >
              {c.title}
            </span>
            {c.type !== "direct" && c.type !== "club_wide" && (
              <span className="shrink-0 text-caption text-muted-foreground/70">
                {c.memberCount}
              </span>
            )}
            <span className="ml-auto shrink-0 text-caption text-muted-foreground/70">
              {c.lastMessage ? timeLabel(c.lastMessage.createdAt) : ""}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-caption",
                c.unreadCount > 0 ? "font-medium text-foreground/80" : "text-muted-foreground"
              )}
            >
              {preview}
            </span>
            {c.unreadCount > 0 && (
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-club px-1.5 text-[10px] font-bold tabular-nums text-club-foreground"
                aria-label={`${c.unreadCount} unread`}
              >
                {c.unreadCount > 99 ? "99+" : c.unreadCount}
              </span>
            )}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <ClubChip club={c.club} className="py-0" />
          </span>
        </span>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </button>
    </li>
  )
}
