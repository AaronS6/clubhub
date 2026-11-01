"use client"

import * as React from "react"
import { useAppStore, type View } from "@/lib/store"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { openChatAt } from "@/lib/chat-deep-link"
import { openInClub, openClubConversation } from "@/lib/hub-nav"
import type { HubClubBadge } from "@/lib/hub-types"
import { useSearchShortcutHint } from "@/hooks/use-platform"
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
  MessageSquare,
  Clock,
  NotebookPen,
  Wallet,
  LayoutDashboard,
  Settings as SettingsIcon,
  Bell,
  HardDrive,
  UserCheck,
  ScrollText,
  Palette,
  KeyRound,
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
  /** §9 hub search — the club this hit lives in. */
  clubId?: string
  club?: HubClubBadge
}
interface AnnouncementHit {
  id: string
  title: string
  createdAt: string
  isPinned: boolean
  type: "announcement"
  clubId?: string
  club?: HubClubBadge
}
interface MeetingHit {
  id: string
  title: string
  startTime: string
  endTime: string
  location: string
  type: "meeting"
  clubId?: string
  club?: HubClubBadge
}
interface MessageHit {
  id: string
  body: string
  createdAt: string
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  conversationId: string
  conversationType: string
  conversationName: string
  type: "message"
  clubId?: string
  club?: HubClubBadge
}
interface SearchResponse {
  members: MemberHit[]
  tasks: TaskHit[]
  announcements: AnnouncementHit[]
  meetings: MeetingHit[]
  messages: MessageHit[]
}

const EMPTY: SearchResponse = {
  members: [],
  tasks: [],
  announcements: [],
  meetings: [],
  messages: [],
}

// ---------------------------------------------------------------------------
// Navigation results — the "just press Enter" layer. Every app surface is
// reachable by typing what you'd CALL it ("settings", "hours", "money",
// "messages"), including the three Account-settings tabs. Purely client-side:
// no request needed, so these results appear instantly alongside (or before)
// server hits.
// ---------------------------------------------------------------------------

type NavAction =
  | { kind: "view"; view: View }
  | { kind: "settings"; tab: "profile" | "security" | "appearance" }

interface NavItem {
  key: string
  label: string
  hint: string
  icon: typeof UsersIcon
  keywords: string[]
  action: NavAction
}

const NAV_ITEMS: NavItem[] = [
  { key: "dash", label: "Dashboard", hint: "Home", icon: LayoutDashboard, keywords: ["home", "overview", "start", "main"], action: { kind: "view", view: "dashboard" } },
  { key: "ann", label: "Announcements", hint: "Feed", icon: Megaphone, keywords: ["post", "posts", "news", "feed", "announcement", "poll", "polls", "urgent"], action: { kind: "view", view: "announcements" } },
  { key: "chat", label: "Chat", hint: "Messages", icon: MessageSquare, keywords: ["messages", "message", "dm", "dms", "talk", "texts", "channel", "channels", "conversation"], action: { kind: "view", view: "chat" } },
  { key: "hours", label: "Service Hours", hint: "Volunteer log", icon: Clock, keywords: ["hours", "service", "volunteer", "volunteering", "service hours", "log", "track", "goal", "goals"], action: { kind: "view", view: "hours" } },
  { key: "tasks", label: "Tasks", hint: "To-dos", icon: CheckSquare, keywords: ["task", "todo", "todos", "checklist", "assignment", "assignments", "work"], action: { kind: "view", view: "tasks" } },
  { key: "notes", label: "Notes", hint: "Docs", icon: NotebookPen, keywords: ["note", "notes", "doc", "docs", "wiki", "handbook"], action: { kind: "view", view: "notes" } },
  { key: "meetings", label: "Meetings", hint: "Calendar", icon: CalendarDays, keywords: ["meeting", "meetings", "calendar", "schedule", "event", "events", "rsvp"], action: { kind: "view", view: "meetings" } },
  { key: "teams", label: "Teams", hint: "Groups", icon: UsersIcon, keywords: ["team", "teams", "group", "groups", "squad", "crew"], action: { kind: "view", view: "teams" } },
  { key: "members", label: "Members", hint: "Roster", icon: UserCheck, keywords: ["member", "people", "roster", "exec", "execs", "executive", "club settings", "club name"], action: { kind: "view", view: "members" } },
  { key: "financials", label: "Financials", hint: "Budget", icon: Wallet, keywords: ["money", "budget", "finance", "financial", "financials", "transaction", "transactions", "expense", "expenses", "funds", "fundraiser", "treasurer", "income"], action: { kind: "view", view: "financials" } },
  { key: "approvals", label: "Approvals", hint: "Review queue", icon: ShieldCheck, keywords: ["approve", "approval", "approvals", "review", "pending", "queue", "requests"], action: { kind: "view", view: "approvals" } },
  { key: "activity", label: "Activity Log", hint: "History", icon: ScrollText, keywords: ["activity", "log", "logs", "history", "audit", "recent"], action: { kind: "view", view: "activity" } },
  { key: "storage", label: "Storage", hint: "Usage", icon: HardDrive, keywords: ["storage", "files", "quota", "usage", "space", "images"], action: { kind: "view", view: "storage" } },
  { key: "notif", label: "Notifications", hint: "Alerts", icon: Bell, keywords: ["notification", "notifications", "alert", "alerts", "unread", "inbox"], action: { kind: "view", view: "notifications" } },
  { key: "settings", label: "Account settings", hint: "Profile · password · theme", icon: SettingsIcon, keywords: ["settings", "setting", "account", "preferences", "config"], action: { kind: "settings", tab: "profile" } },
  { key: "security", label: "Security & password", hint: "Change password", icon: KeyRound, keywords: ["password", "security", "change password", "reset password", "login", "sign in"], action: { kind: "settings", tab: "security" } },
  { key: "appearance", label: "Appearance & theme", hint: "Dark mode · colors", icon: Palette, keywords: ["appearance", "theme", "dark mode", "light mode", "color", "colors", "background", "customize", "customization"], action: { kind: "settings", tab: "appearance" } },
]

// Words people type when DESCRIBING what they want ("how to get service
// hours") that shouldn't have to match anything.
const STOP_WORDS = new Set([
  "how", "to", "get", "the", "a", "an", "my", "i", "for", "of", "in", "on",
  "do", "does", "me", "you", "your", "what", "where", "can", "is", "are",
  "find", "show", "go", "and", "it", "this", "that", "with", "up", "open",
  "page", "screen", "section", "place", "thing", "stuff",
])

/** Does this query match the nav item? Any non-stopword token hitting the
 *  label or a keyword counts — so "how to get service hours" finds the
 *  Service Hours view via "service" + "hours". */
function navItemMatches(item: NavItem, query: string): boolean {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
  if (tokens.length === 0) return false
  const label = item.label.toLowerCase()
  const keywords = item.keywords.map((k) => k.toLowerCase())
  return tokens.some(
    (t) =>
      label.includes(t) ||
      keywords.some((k) => k.includes(t) || t.includes(k)),
  )
}

/** Direct label/keyword prefix hits rank above incidental ones. */
function navItemRank(item: NavItem, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  if (item.label.toLowerCase().startsWith(q)) return 0
  if (item.label.toLowerCase().includes(q)) return 1
  if (item.keywords.some((k) => k.startsWith(q))) return 2
  return 3
}

/**
 * cmdk's default filter requires EVERY search word to match the value, so a
 * natural phrase like "how to get service hours" matches nothing. This
 * filter drops stop-words, keeps ALL items where ANY meaningful token hits,
 * and ranks: full-phrase > label-prefix > more token hits. Server-side
 * groups only contain items the API already matched, so widening here is
 * safe — it just keeps them visible under phrase queries.
 */
function smartFilter(value: string, search: string): number {
  const v = value.toLowerCase()
  const raw = search.trim().toLowerCase()
  if (!raw) return 1
  const tokens = raw.split(/\s+/).filter((t) => t.length > 0 && !STOP_WORDS.has(t))
  if (v.includes(raw)) return 1000 // exact phrase contained → top
  if (tokens.length === 0) return 0 // only stop-words and no phrase match
  let hits = 0
  for (const t of tokens) {
    if (v.includes(t)) hits++
  }
  if (hits === 0) return 0
  return hits * 10 + hits / tokens.length
}

// ---------------------------------------------------------------------------
// Presentation tokens — the palette's visual language (rounded-xl shell,
// sidebar-style micro group labels, kbd caps, comfortable rows).
// ---------------------------------------------------------------------------

/** kbd cap — same recipe as the SearchShortcutHint caps in app-shell.tsx. */
const KBD_CAP =
  "rounded border border-border/80 bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium leading-none text-muted-foreground"

/** Micro group label — the sidebar's tier-label language: 10px, medium,
 *  tracked, muted. Rendered as a node inside cmdk's group-heading wrapper
 *  (its px-2 + this ml-1 ≈ px-3), so labels align with item text at px-3. */
const GROUP_LABEL =
  "ml-1 block text-[10px] font-medium tracking-[0.14em] text-muted-foreground/70"

/** CommandDialog pads items via a `[&_[cmdk-item]]:px-2` variant on the
 *  Command root, which out-ranks any padding class on the item itself —
 *  so the comfortable px-3 row padding is applied inline (always wins). */
const ITEM_PAD: React.CSSProperties = {
  paddingLeft: "0.75rem",
  paddingRight: "0.75rem",
}

/** Quick jumps shown when the palette opens with an empty query — the
 *  club's busiest surfaces, keyboard-selectable like any search hit. */
const QUICK_JUMPS: {
  view: View
  label: string
  icon: typeof UsersIcon
  hint: string
  /** §9 — shared-nav quick jumps render in BOTH contexts; club-only ones
   *  only inside a club workspace. */
  shared?: boolean
}[] = [
  { view: "chat", label: "Messages", icon: MessageSquare, hint: "c", shared: true },
  { view: "tasks", label: "My Tasks", icon: CheckSquare, hint: "t", shared: true },
  { view: "announcements", label: "Updates", icon: Megaphone, hint: "a", shared: true },
  { view: "meetings", label: "Calendar", icon: CalendarDays, hint: "m", shared: true },
  { view: "hours", label: "Service Hours", icon: Clock, hint: "h" },
  { view: "members", label: "Members", icon: UsersIcon, hint: "m" },
]

// ---------------------------------------------------------------------------
// Hook — opens the palette on Cmd/Ctrl+K (and `/` when not focused on a text input).
// Exposed so the app shell header button can also open it.
// ---------------------------------------------------------------------------

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
  const currentClub = useAppStore((s) => s.currentClub)
  const context = useAppStore((s) => s.context)
  const setView = useAppStore((s) => s.setView)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<SearchResponse>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const shortcut = useSearchShortcutHint()

  // §9 — the palette searches the ACTIVE context: My Hub aggregates across
  // every club (/api/hub/search), a club workspace searches that club.
  const isHub = context === "hub"
  const activeClubId = isHub ? null : clubId

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
        if (activeClubId || isHub) setOpen((o) => !o)
        return
      }

      // `/` opens — only when not typing and palette closed.
      if (e.key === "/" && !isTyping && !open && (activeClubId || isHub)) {
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
  }, [open, activeClubId, isHub])

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
    if (!activeClubId && !isHub) return
    setLoading(true)
    const t = setTimeout(() => {
      api<SearchResponse>(
        isHub
          ? `/api/hub/search?q=${encodeURIComponent(q)}`
          : `/api/clubs/${activeClubId}/search?q=${encodeURIComponent(q)}`
      )
        .then((data) => setResults({ ...EMPTY, ...data }))
        .catch(() => setResults(EMPTY))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query, open, activeClubId, isHub])

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

  const hasQuery = query.trim().length > 0
  const trimmedQuery = query.trim()

  // Navigation matches — instant (no server round-trip), ranked. §9 — in
  // My Hub, club-only destinations are hidden from the palette (they have
  // no hub surface); they remain one g-chord or context switch away.
  const navMatches = React.useMemo(() => {
    if (!hasQuery) return []
    const clubOnlyViews = new Set([
      "hours", "notes", "teams", "members", "financials", "approvals", "activity", "storage",
    ])
    return NAV_ITEMS.filter((item) => {
      if (item.action.kind !== "view") return true
      if (isHub && clubOnlyViews.has(item.action.view)) return false
      return true
    })
      .filter((item) => navItemMatches(item, trimmedQuery))
      .sort((a, b) => navItemRank(a, trimmedQuery) - navItemRank(b, trimmedQuery))
  }, [hasQuery, trimmedQuery, isHub])

  const totalCount =
    navMatches.length +
    results.members.length +
    results.messages.length +
    results.tasks.length +
    results.announcements.length +
    results.meetings.length

  // Selection handlers — navigate to the relevant view.
  function go(view: View) {
    setOpen(false)
    setView(view)
  }

  function goSettings(tab: "profile" | "security" | "appearance") {
    setOpen(false)
    // Same custom event the What's New modal uses — the UserMenu's settings
    // dialog listens for it and opens on the requested tab.
    window.dispatchEvent(new CustomEvent("open-settings", { detail: { tab } }))
  }

  function goMessage(hit: MessageHit) {
    setOpen(false)
    // §9 — in My Hub, jump into the message's club workspace and open the
    // conversation there; inside a club, the existing in-club deep link.
    if (isHub && hit.clubId) {
      openClubConversation(hit.clubId, hit.conversationId, hit.id)
      return
    }
    setView("chat")
    // Slight delay so the chat view mounts before the deep-link event — the
    // chat-deep-link module also keeps a pending target for exactly this,
    // so this is belt-and-suspenders ordering insurance.
    requestAnimationFrame(() => {
      openChatAt(hit.conversationId, hit.id)
    })
  }

  /** §9 — task/announcement/meeting hits: in My Hub, deep-link into the
   *  item's ORIGINAL club (with a flash highlight on the target card); in a
   *  club workspace, the existing in-club navigation. */
  function goHit(view: View, hit?: { id?: string; clubId?: string }) {
    setOpen(false)
    if (isHub && hit?.clubId) {
      const focusType =
        view === "tasks" ? "task" : view === "announcements" ? "announcement" : view === "meetings" ? "meeting" : undefined
      openInClub(hit.clubId, view, focusType && hit.id ? { type: focusType, id: hit.id } : undefined)
      return
    }
    setView(view)
  }

  const hasServerResults =
    results.members.length > 0 ||
    results.messages.length > 0 ||
    results.tasks.length > 0 ||
    results.announcements.length > 0 ||
    results.meetings.length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={isHub ? "Search all your clubs" : "Search this club"}
      description={
        isHub
          ? "Find your tasks, updates, meetings and messages across every club."
          : "Jump anywhere, find messages, members, tasks and more."
      }
      className="sm:max-w-xl rounded-xl shadow-dialog"
      commandProps={{ filter: smartFilter }}
    >
      {/* Input row — 16px type in a 48px-tall row: search glyph left,
          esc cap right (visual only — cmdk handles the Escape key itself). */}
      <div className="relative">
        <CommandInput
          placeholder={
            isHub
              ? "Search all your clubs — try “updates”, “tasks”, a message…"
              : clubId
                ? "Search — try “settings”, “hours”, a message…"
                : "Select a club first"
          }
          value={query}
          onValueChange={setQuery}
          disabled={!clubId && !isHub}
          className="pr-14 text-base"
        />
        <kbd
          aria-hidden
          className={cn(
            KBD_CAP,
            "pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
          )}
        >
          esc
        </kbd>
      </div>
      <CommandList className="max-h-[min(70vh,420px)] pt-1.5 pb-1.5">
        {!clubId && !isHub ? (
          <CommandEmpty className="text-muted-foreground">
            Select a club first.
          </CommandEmpty>
        ) : !hasQuery ? (
          <>
            {/* Empty query → "Jump to" quick navigation. §9 — in My Hub the
                shared destinations; inside a club, the club's busiest
                surfaces (keyboard-selectable like any search hit). */}
            <CommandGroup heading={<span className={GROUP_LABEL}>JUMP TO</span>}>
              {QUICK_JUMPS.filter((q) => !isHub || q.shared).map((q) => {
                const Icon = q.icon
                return (
                  <CommandItem
                    key={q.view}
                    value={`jump ${q.view} ${q.label}`}
                    onSelect={() => go(q.view)}
                    className="gap-3 rounded-lg"
                    style={ITEM_PAD}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 truncate font-medium">{q.label}</span>
                    <kbd aria-hidden className={KBD_CAP}>
                      {q.hint}
                    </kbd>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <div className="flex items-center gap-1.5 py-2 pr-3 pl-5 text-xs text-muted-foreground">
              <Search className="h-3 w-3 shrink-0 opacity-60" />
              <span>Type to search settings, views, messages{isHub ? ", tasks…" : ", people…"}</span>
            </div>
          </>
        ) : loading && !hasServerResults ? (
          <SearchSkeleton />
        ) : totalCount === 0 ? (
          <CommandEmpty className="text-muted-foreground">
            Nothing for “{query}” — try a shorter word or a name.
          </CommandEmpty>
        ) : (
          <>
            {/* ── Navigation / settings (instant, client-side) ── */}
            {navMatches.length > 0 && (
              <CommandGroup heading={<span className={GROUP_LABEL}>GO TO</span>}>
                {navMatches.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.key}
                      value={`nav ${item.label} ${item.keywords.join(" ")}`}
                      onSelect={() =>
                        item.action.kind === "view"
                          ? go(item.action.view)
                          : goSettings(item.action.tab)
                      }
                      className="gap-3 rounded-lg"
                      style={ITEM_PAD}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate font-medium">{item.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.hint}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {/* ── Chat messages (server) ── */}
            {results.messages.length > 0 && (
              <>
                {navMatches.length > 0 && <CommandSeparator />}
                <CommandGroup heading={<span className={GROUP_LABEL}>CHAT MESSAGES</span>}>
                  {results.messages.map((m) => (
                    <CommandItem
                      key={`msg-${m.id}`}
                      value={`message ${m.body} ${m.authorName} ${m.conversationName} ${m.club?.clubName ?? ""}`}
                      onSelect={() => goMessage(m)}
                      className="gap-3 rounded-lg"
                      style={ITEM_PAD}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <MessageSquare className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {/* §9 — hub hits lead with the club identity; club
                              hits keep the conversation · author line. */}
                          {isHub
                            ? `${m.club?.clubName ?? "Club"} · ${m.authorName || "Message"}`
                            : `${m.conversationName} · ${m.authorName}`}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          <MessageSnippet body={m.body} query={trimmedQuery} />
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        {relativeTime(m.createdAt)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* ── People (server) — club workspace only: people live inside
                a club's directory, so My Hub's palette omits the section. ── */}
            {!isHub && results.members.length > 0 && (
              <>
                {(navMatches.length > 0 || results.messages.length > 0) && <CommandSeparator />}
                <CommandGroup heading={<span className={GROUP_LABEL}>PEOPLE</span>}>
                  {results.members.map((m) => (
                    <CommandItem
                      key={`m-${m.id}`}
                      value={`member ${m.name} ${m.email}`}
                      onSelect={() => go("members")}
                      className="gap-3 rounded-lg"
                      style={ITEM_PAD}
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
              </>
            )}

            {/* ── Tasks (server) ── */}
            {results.tasks.length > 0 && (
              <>
                {(navMatches.length > 0 || results.messages.length > 0 || results.members.length > 0) && <CommandSeparator />}
                <CommandGroup heading={<span className={GROUP_LABEL}>TASKS</span>}>
                  {results.tasks.map((t) => (
                    <CommandItem
                      key={`t-${t.id}`}
                      value={`task ${t.title} ${t.club?.clubName ?? ""}`}
                      onSelect={() => goHit("tasks", t)}
                      className="gap-3 rounded-lg"
                      style={ITEM_PAD}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <CheckSquare className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {isHub && t.club ? `${t.club.clubName} · ` : ""}
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

            {/* ── Announcements (server) ── */}
            {results.announcements.length > 0 && (
              <>
                {(navMatches.length > 0 || results.messages.length > 0 || results.members.length > 0 || results.tasks.length > 0) && <CommandSeparator />}
                <CommandGroup heading={<span className={GROUP_LABEL}>ANNOUNCEMENTS</span>}>
                  {results.announcements.map((a) => (
                    <CommandItem
                      key={`a-${a.id}`}
                      value={`announcement ${a.title} ${a.club?.clubName ?? ""}`}
                      onSelect={() => goHit("announcements", a)}
                      className="gap-3 rounded-lg"
                      style={ITEM_PAD}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Megaphone className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{a.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {isHub && a.club ? `${a.club.clubName} · ` : ""}
                          {relativeTime(a.createdAt)}
                          {a.isPinned && " · Pinned"}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {/* ── Meetings (server) ── */}
            {results.meetings.length > 0 && (
              <>
                {(navMatches.length > 0 || results.messages.length > 0 || results.members.length > 0 || results.tasks.length > 0 || results.announcements.length > 0) && <CommandSeparator />}
                <CommandGroup heading={<span className={GROUP_LABEL}>MEETINGS</span>}>
                  {results.meetings.map((m) => (
                    <CommandItem
                      key={`mt-${m.id}`}
                      value={`meeting ${m.title} ${m.club?.clubName ?? ""}`}
                      onSelect={() => goHit("meetings", m)}
                      className="gap-3 rounded-lg"
                      style={ITEM_PAD}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{m.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {isHub && m.club ? `${m.club.clubName} · ` : ""}
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

      {/* Footer — club identity on the left (accent dot + name), keyboard
          affordances on the right (platform-correct shortcut: ⌘K on Mac,
          Ctrl K on Windows/Linux — both always work). */}
      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              !currentClub?.accentColor && "bg-primary"
            )}
            style={
              currentClub?.accentColor
                ? { backgroundColor: currentClub.accentColor }
                : undefined
            }
          />
          <span className="truncate">{currentClub?.clubName ?? "ClubHub"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <kbd className={KBD_CAP} aria-label={shortcut.ariaLabel}>
            {shortcut.label ?? "Ctrl K"}
          </kbd>
          <kbd className={KBD_CAP}>↵ open</kbd>
          <kbd className={KBD_CAP}>esc close</kbd>
        </span>
      </div>
    </CommandDialog>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Context window around the first query match inside a message body, with
 *  the match itself highlighted — “…budget for the <b>hours</b> tracker…” */
function MessageSnippet({ body, query }: { body: string; query: string }) {
  const q = query.toLowerCase()
  const idx = body.toLowerCase().indexOf(q)
  if (idx === -1) {
    return <span className="truncate">{body.slice(0, 96)}{body.length > 96 ? "…" : ""}</span>
  }
  const start = Math.max(0, idx - 30)
  const end = Math.min(body.length, idx + q.length + 46)
  const prefix = start > 0 ? "…" : ""
  const suffix = end < body.length ? "…" : ""
  return (
    <span className="truncate">
      {prefix}
      {body.slice(start, idx)}
      <mark className="rounded-sm bg-club/25 px-0.5 text-foreground">
        {body.slice(idx, idx + q.length)}
      </mark>
      {body.slice(idx + q.length, end)}
      {suffix}
    </span>
  )
}

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
        <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
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
