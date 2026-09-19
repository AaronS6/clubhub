"use client"

import * as React from "react"
import { useAppStore, type View } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Search,
  Users as UsersIcon,
  CheckSquare,
  Megaphone,
  CalendarDays,
  Loader2,
  ShieldCheck,
} from "lucide-react"
import { initials, relativeTime, StatusBadge } from "@/components/shared/page-header"

// ---------------------------------------------------------------------------
// Types — matches the `/api/clubs/[clubId]/search` response.
// ---------------------------------------------------------------------------

interface MemberHit {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: "member" | "executive"
  type: "member"
}
interface TaskHit {
  id: string
  title: string
  status: string
  dueDate: string | null
  type: "task"
}
interface AnnouncementHit {
  id: string
  title: string
  createdAt: string
  isPinned: boolean
  type: "announcement"
}
interface MeetingHit {
  id: string
  title: string
  startTime: string
  endTime: string
  location: string
  type: "meeting"
}
interface SearchResponse {
  members: MemberHit[]
  tasks: TaskHit[]
  announcements: AnnouncementHit[]
  meetings: MeetingHit[]
}

const EMPTY: SearchResponse = { members: [], tasks: [], announcements: [], meetings: [] }

// ---------------------------------------------------------------------------
// Hook — opens the palette on Cmd/Ctrl+K (and `/` when not focused on a text input).
// Exposed so the app shell header button can also open it.
// ---------------------------------------------------------------------------

interface GlobalSearchHandle {
  open: () => void
}

let externalOpen: (() => void) | null = null
/**
 * Programmatically open the global search palette (used by header buttons).
 * Dispatches a window CustomEvent so the (lazily-loaded) GlobalSearch
 * component can react without a static import — keeps the heavy cmdk bundle
 * out of the initial chunk.
 */
export function openGlobalSearch() {
  if (externalOpen) {
    externalOpen()
  } else {
    window.dispatchEvent(new CustomEvent("clubhub:open-search"))
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GlobalSearch() {
  const clubId = useAppStore((s) => s.currentClubId)
  const setView = useAppStore((s) => s.setView)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResponse>(EMPTY)
  const [loading, setLoading] = React.useState(false)

  // Expose an imperative opener for the header button.
  React.useEffect(() => {
    externalOpen = () => setOpen(true)
    return () => { externalOpen = null }
  }, [])

  // Listen for the custom-event opener (used when this component is
  // lazy-loaded and the imperative ref isn't set yet).
  React.useEffect(() => {
    function onOpen() { setOpen(true) }
    window.addEventListener("clubhub:open-search", onOpen)
    return () => window.removeEventListener("clubhub:open-search", onOpen)
  }, [])

  // Global keyboard shortcut: Cmd/Ctrl+K toggles; `/` opens (when not in a text field).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)

      // Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault()
        if (clubId) setOpen((o) => !o)
        return
      }

      // `/` opens — only when not typing and palette closed.
      if (e.key === "/" && !isTyping && !open && clubId) {
        e.preventDefault()
        setOpen(true)
      }

      // Esc closes (cmdk already handles Escape inside the dialog, this is a
      // backstop for the case where focus is outside).
      if (e.key === "Escape" && open) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, clubId])

  // Debounced search. We fire only when query has at least 1 non-space char and
  // the palette is open. Empty query clears results instantly.
  React.useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    if (!clubId) return
    setLoading(true)
    const t = setTimeout(() => {
      api<SearchResponse>(`/api/clubs/${clubId}/search?q=${encodeURIComponent(q)}`)
        .then((data) => setResults(data ?? EMPTY))
        .catch(() => setResults(EMPTY))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, open, clubId])

  // Reset the input when the palette closes so reopening starts fresh.
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setQuery("")
        setResults(EMPTY)
        setLoading(false)
      }, 150)
      return () => clearTimeout(t)
    }
  }, [open])

  const totalCount =
    results.members.length +
    results.tasks.length +
    results.announcements.length +
    results.meetings.length

  const hasQuery = query.trim().length > 0

  // Selection handlers — navigate to the relevant view.
  function go(view: View) {
    setOpen(false)
    setView(view)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search this club"
      description="Find members, tasks, announcements, and meetings."
      className="sm:max-w-xl"
    >
      <CommandInput
        placeholder={clubId ? "Search members, tasks, announcements, meetings…" : "Select a club first"}
        value={query}
        onValueChange={setQuery}
        disabled={!clubId}
      />
      <CommandList>
        {!clubId ? (
          <CommandEmpty>Select or create a club to start searching.</CommandEmpty>
        ) : !hasQuery ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Search className="mx-auto mb-2 h-5 w-5 opacity-50" />
            Start typing to search this club.
          </div>
        ) : loading ? (
          <SearchSkeleton />
        ) : totalCount === 0 ? (
          <CommandEmpty>No results for “{query}”.</CommandEmpty>
        ) : (
          <>
            {results.members.length > 0 && (
              <CommandGroup heading="Members">
                {results.members.map((m) => (
                  <CommandItem
                    key={`m-${m.id}`}
                    value={`member ${m.name} ${m.email}`}
                    onSelect={() => go("members")}
                    className="gap-3"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={m.avatarUrl ?? undefined} alt={m.name} />
                      <AvatarFallback className="text-xs">
                        {initials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </div>
                    </div>
                    {m.role === "executive" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-club-subtle px-1.5 py-0.5 text-xs font-medium text-club-ink dark:bg-club-subtle dark:text-club-ink">
                        <ShieldCheck className="h-3 w-3" /> Exec
                      </span>
                    ) : (
                      <span className="text-xs  text-muted-foreground">
                        Member
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {results.tasks.length > 0 && (
              <>
                {results.members.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Tasks">
                  {results.tasks.map((t) => (
                    <CommandItem
                      key={`t-${t.id}`}
                      value={`task ${t.title}`}
                      onSelect={() => go("tasks")}
                      className="gap-3"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <CheckSquare className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {t.dueDate
                            ? `Due ${new Date(t.dueDate).toLocaleDateString()}`
                            : "No due date"}
                        </div>
                      </div>
                      <TaskStatusBadge status={t.status} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results.announcements.length > 0 && (
              <>
                {(results.members.length > 0 || results.tasks.length > 0) && (
                  <CommandSeparator />
                )}
                <CommandGroup heading="Announcements">
                  {results.announcements.map((a) => (
                    <CommandItem
                      key={`a-${a.id}`}
                      value={`announcement ${a.title}`}
                      onSelect={() => go("announcements")}
                      className="gap-3"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Megaphone className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{a.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {relativeTime(a.createdAt)}
                          {a.isPinned && " · Pinned"}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {results.meetings.length > 0 && (
              <>
                {(results.members.length > 0 ||
                  results.tasks.length > 0 ||
                  results.announcements.length > 0) && <CommandSeparator />}
                <CommandGroup heading="Meetings">
                  {results.meetings.map((m) => (
                    <CommandItem
                      key={`mt-${m.id}`}
                      value={`meeting ${m.title}`}
                      onSelect={() => go("meetings")}
                      className="gap-3"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{m.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatMeetingTime(m.startTime, m.endTime)} · {m.location}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>

      {/* Footer hint */}
      <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1">
            {results.members.length > 0 && (
              <>
                <UsersIcon className="h-3 w-3" />
                {results.members.length}
              </>
            )}
            {results.tasks.length > 0 && (
              <>
                <CheckSquare className="h-3 w-3 ml-1.5" />
                {results.tasks.length}
              </>
            )}
            {results.announcements.length > 0 && (
              <>
                <Megaphone className="h-3 w-3 ml-1.5" />
                {results.announcements.length}
              </>
            )}
            {results.meetings.length > 0 && (
              <>
                <CalendarDays className="h-3 w-3 ml-1.5" />
                {results.meetings.length}
              </>
            )}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">↵</kbd>
          <span>to open</span>
          <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">esc</kbd>
          <span>to close</span>
        </span>
      </div>
    </CommandDialog>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TaskStatusBadge({ status }: { status: string }) {
  const kind =
    status === "done"
      ? "done"
      : status === "in_progress"
      ? "in_progress"
      : "not_started"
  return <StatusBadge status={kind as any} />
}

function formatMeetingTime(startISO: string, endISO: string): string {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  const dateStr = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
  const timeStr = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  if (sameDay) return `${dateStr} · ${timeStr}`
  return `${dateStr} ${timeStr}`
}

function SearchSkeleton() {
  return (
    <div className="p-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="h-7 w-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2 w-1/3" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
      <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Searching…
      </div>
    </div>
  )
}
