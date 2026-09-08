"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { useAppStore, View } from "@/lib/store"
import { api } from "@/lib/api/client"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { initials, relativeTime } from "@/components/shared/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  LayoutDashboard, Megaphone, Clock, CheckSquare, CalendarDays, Users,
  ScrollText, Settings, Bell, LogOut, Menu, Plus, ChevronDown,
  ShieldCheck, UserCog, Sparkles, Moon, Sun, Loader2, Search as SearchIcon,
  MessageSquare, CheckCheck, ChevronRight, AlertTriangle, X, Keyboard, RefreshCw,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useIsMobile } from "@/hooks/use-mobile"
import { AuthScreen } from "@/components/auth/auth-screen"
import { CreateClubDialog } from "@/components/auth/create-club-dialog"
import { PublicClubProfile } from "@/components/public-club-profile"
import { authenticateSocket, getRealtimeSocket, onRealtimeEvent } from "@/lib/realtime-client"
import { useRealtimeSync } from "@/lib/use-realtime-sync"
import { openGlobalSearch } from "@/components/global-search"
// Lazy-load the GlobalSearch command palette (heavy: bundles cmdk). It's
// only opened on Cmd+K / `/` / header click, so deferring it keeps the
// initial chunk lean. The component still mounts on the client shortly after
// hydration and registers its keydown listener + custom-event handler.
const GlobalSearch = dynamic(
  () => import("@/components/global-search").then((m) => m.GlobalSearch),
  { ssr: false }
)
import {
  ALL_NOTIF_TYPES, NOTIF_TYPE_META, getDefaultPrefs, type NotifPrefs, type NotifType,
} from "@/lib/notif-prefs"
import {
  notifMeta, notifToneClasses, targetViewFor,
} from "@/lib/notif-meta"

interface MeResponse {
  user: { id: string; name: string; email: string; avatarUrl?: string | null } | null
  memberships: {
    clubId: string
    clubName: string
    logoUrl: string | null
    accentColor: string
    clubCode: string
    role: "member" | "executive"
  }[]
}

/**
 * Sidebar navigation, organized into tiers.
 *
 *   Home   — always-visible, most-used surfaces. Slightly larger / more
 *            prominent rows (the user lands here 90% of the time).
 *   Work   — day-to-day work surfaces. Medium weight.
 *   Manage — executive-focused admin surfaces. Smaller, muted rows so they
 *            don't dominate the nav for regular members.
 *
 * Each tier is rendered under a small uppercase muted section label so the
 * grouping is obvious. The `execOnly` items (Approvals) only render for
 * executives; if a tier ends up with zero visible items it's skipped
 * entirely so we don't show an empty section header.
 */
interface NavItem { view: View; label: string; icon: any; execOnly?: boolean }
interface NavTier { id: string; label: string; items: NavItem[] }

const NAV_TIERS: NavTier[] = [
  {
    id: "home",
    label: "Home",
    items: [
      { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { view: "announcements", label: "Announcements", icon: Megaphone },
      { view: "chat", label: "Chat", icon: MessageSquare },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [
      { view: "tasks", label: "Tasks", icon: CheckSquare },
      { view: "meetings", label: "Meetings", icon: CalendarDays },
      { view: "hours", label: "Service Hours", icon: Clock },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    items: [
      { view: "teams", label: "Teams", icon: Users },
      { view: "members", label: "Members", icon: UserCog },
      { view: "approvals", label: "Approvals", icon: ShieldCheck, execOnly: true },
      { view: "activity", label: "Activity Log", icon: ScrollText },
    ],
  },
]

/** Flat list of every nav item (used for `?view=` validation + filtering). */
const NAV: NavItem[] = NAV_TIERS.flatMap((t) => t.items)

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const { clubs, currentClub, currentClubId, view, setView, setClubs, selectClub } = useAppStore()
  const [bootstrapped, setBootstrapped] = useState(false)
  const [bootFailed, setBootFailed] = useState(false)
  const bootRef = useRef(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const params = useSearchParams()
  const { theme, setTheme } = useTheme()

  // Bootstrap: fetch /api/me once the session is authenticated. This is the
  // gate that keeps the entire app on the loading screen, so it has a hard
  // timeout (8s) that falls back to a friendly Retry UI instead of spinning
  // forever on a slow/hung request.
  useEffect(() => {
    if (status !== "authenticated" || bootstrapped || bootRef.current) return
    bootRef.current = true
    let cancelled = false
    let timedOut = false
    const timer = setTimeout(() => {
      if (cancelled || bootstrapped) return
      timedOut = true
      setBootFailed(true)
    }, 8000)
    api<MeResponse>("/api/me")
      .then((data) => {
        if (cancelled || timedOut) return
        clearTimeout(timer)
        if (data.user) setClubs(data.memberships)
        setBootstrapped(true)
      })
      .catch(() => {
        if (cancelled || timedOut) return
        clearTimeout(timer)
        // On error, still proceed — the app can render with no clubs (shows
        // the onboarding screen) rather than spinning forever.
        setBootstrapped(true)
      })
    return () => { cancelled = true; clearTimeout(timer) }
  }, [status, bootstrapped, setClubs])

  // Retry handler for the timeout fallback.
  const retryBoot = () => {
    bootRef.current = false
    setBootFailed(false)
  }

  useEffect(() => {
    const v = params.get("view") as View | null
    if (v && NAV.some((n) => n.view === v)) setView(v)
  }, [params, setView])

  // Authenticate the realtime socket once we know the user + clubs
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id || clubs.length === 0) return
    authenticateSocket(session.user.id, clubs.map((c) => c.clubId))
    const s = getRealtimeSocket()
    if (!s.connected) s.connect()
  }, [status, session, clubs])

  if (status === "loading" || (status === "authenticated" && !bootstrapped && !bootFailed)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Bootstrap timeout fallback — the /api/me call took too long. Show a
  // friendly retry instead of spinning forever.
  if (status === "authenticated" && bootFailed && !bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Loader2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Taking a moment to load</h2>
          <p className="text-sm text-muted-foreground mb-4">
            The server is taking longer than expected. This usually clears up on retry.
          </p>
          <Button onClick={retryBoot} variant="default">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  // Public read-only club profile takes precedence over both the auth screen
  // and the app shell. `?public=<code>` shows a recruiting-friendly landing
  // page for the club — unauthenticated visitors see it instead of the login
  // screen; authenticated visitors also see it (with a "Back to app" link).
  const publicCode = params.get("public")
  if (publicCode) {
    return <PublicClubProfile code={publicCode} />
  }

  if (status === "unauthenticated" || !session?.user) {
    return <AuthScreen />
  }

  // No clubs yet -> onboarding
  if (clubs.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="flex-1 flex flex-col items-center justify-center bg-club-subtle/40 p-6">
          <div className="w-full max-w-md text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-club text-club-foreground shadow-sm">
              <Sparkles className="h-7 w-7" />
            </div>
            <h1 className="text-page-title">Welcome to ClubHub</h1>
            <p className="text-body text-muted-foreground mt-2 mb-7 max-w-sm mx-auto">
              You&apos;re not in any clubs yet. Create a new club to become its first executive, or join an existing one with a club code.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="club" size="lg" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Create a club
              </Button>
              <JoinClubInline onJoined={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))} />
            </div>
          </div>
        </div>
        <Footer />
        <CreateClubDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))} />
      </div>
    )
  }

  const isExec = currentClub?.role === "executive"

  const clubSwitcher = (
    <ClubSwitcher
      clubs={clubs}
      currentClub={currentClub ?? null}
      onSelect={(id) => { selectClub(id); setMobileNavOpen(false) }}
      onCreate={() => setCreateOpen(true)}
    />
  )

  const navList = (
    <nav className="flex flex-col gap-3 px-2.5 py-3" aria-label="Primary">
      {NAV_TIERS.map((tier) => {
        const items = tier.items.filter((n) => !n.execOnly || isExec)
        if (items.length === 0) return null
        // Visual weight per tier: Home is most prominent, Manage is muted.
        const weight = tier.id === "home" ? "home" : tier.id === "work" ? "work" : "manage"
        return (
          <div key={tier.id} className="space-y-0.5">
            <div className="px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {tier.label}
            </div>
            {items.map((item) => {
              const Icon = item.icon
              const active = view === item.view
              return (
                <button
                  key={item.view}
                  onClick={() => { setView(item.view); setMobileNavOpen(false) }}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-md w-full text-left transition-colors",
                    weight === "home" && "px-3 py-2 text-sm font-semibold",
                    weight === "work" && "px-3 py-1.5 text-sm font-medium",
                    weight === "manage" && "px-3 py-1.5 text-[13px] font-medium text-muted-foreground",
                    active
                      ? "bg-club-muted text-club"
                      : weight === "manage"
                        ? "hover:bg-accent hover:text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {/* Active indicator — subtle 2px accent bar pinned to the
                      left edge of the row. Hidden when inactive. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-club transition-opacity",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Icon className={cn(
                    "shrink-0 transition-colors",
                    weight === "home" ? "h-[18px] w-[18px]" : "h-4 w-4",
                    active ? "text-club" : "text-muted-foreground/80 group-hover:text-foreground"
                  )} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.execOnly && <ShieldCheck className="ml-auto h-3 w-3 text-muted-foreground/50" />}
                </button>
              )
            })}
          </div>
        )
      })}
    </nav>
  )

  // Persistent top bar — desktop + mobile.
  //   LEFT:   profile avatar menu (UserMenu)
  //   CENTER: global search trigger
  //   RIGHT:  connection dot, keyboard help, theme toggle, notification bell
  // The club switcher has moved to the BOTTOM of the sidebar.
  const topBar = (
    <header className="flex items-center gap-2 px-3 sm:px-4 h-14 border-b bg-background/95 backdrop-blur shrink-0 sticky top-0 z-30" style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}>
      {/* Mobile hamburger */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <div className="flex-1 overflow-y-auto">{navList}</div>
          {/* Club switcher pinned to the bottom of the mobile drawer */}
          <div className="border-t p-3 shrink-0">{clubSwitcher}</div>
        </SheetContent>
      </Sheet>

      {/* Profile avatar menu — TOP LEFT of the top bar (desktop + mobile) */}
      <div className="shrink-0">
        <UserMenu compact />
      </div>

      {/* Search (center, desktop) — bordered trigger styled to match a real
          input. The previous outline/ring mismatched the dimensions; this
          uses a single border + matching py-1.5 so the focus ring sits
          flush on the box instead of offset. */}
      <button
        type="button"
        onClick={() => openGlobalSearch()}
        disabled={!currentClubId}
        className="hidden md:flex group items-center gap-2.5 h-9 rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none max-w-md flex-1 mx-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        aria-label="Open search"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">Search this club…</span>
        <kbd className="inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          <span className="text-[11px]">⌘</span>K
        </kbd>
      </button>

      {/* Mobile: club name fills the gap */}
      <div className="md:hidden font-semibold truncate flex-1 px-1 min-w-0">
        {currentClub?.clubName}
      </div>

      {/* Right side: search icon (mobile), connection, keyboard, theme, bell */}
      <div className="flex items-center gap-0.5 ml-auto shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Search"
          disabled={!currentClubId}
          onClick={() => openGlobalSearch()}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
        <ConnectionIndicator />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (press ?)"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("open-keyboard-shortcuts"))
          }
        >
          <Keyboard className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <NotificationBell />
      </div>
    </header>
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <UrgentBanner />
      {topBar}
      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex md:w-60 flex-col border-r bg-muted/20 shrink-0">
          {/* Nav occupies the scrollable middle of the sidebar */}
          <div className="flex-1 overflow-y-auto">{navList}</div>
          {/* Club switcher pinned to the BOTTOM of the sidebar (moved here
              from the top bar per the user's request). */}
          <div className="border-t p-3 shrink-0">{clubSwitcher}</div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto" key={`${currentClubId}-${view}`}>
              {children}
            </div>
          </div>
          <Footer />
        </main>
      </div>

      <CreateClubDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))} />
      <GlobalSearch />
      <KeyboardShortcutsHelp />
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t bg-background px-4 md:px-6 py-3 text-center text-xs text-muted-foreground shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <span>ClubHub · Multi-club management platform</span>
        <span aria-hidden className="text-muted-foreground/40">·</span>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("open-keyboard-shortcuts"))
          }
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Keyboard shortcuts help"
        >
          <Keyboard className="h-3 w-3" />
          <span>Shortcuts</span>
          <kbd className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded border bg-muted text-[10px] font-mono">
            ?
          </kbd>
        </button>
      </div>
    </footer>
  )
}

/**
 * Dismissible banner shown at the very top of the app whenever the current
 * club has an active urgent announcement. Dismissal is stored in localStorage
 * per-announcement (`urgent-dismissed-<id>`) and auto-expires after 7 days.
 *
 * Only the LATEST urgent announcement is shown — older urgents effectively
 * retire themselves by being superseded (the API returns only the most
 * recent one), so a new urgent clears the dismissed state by virtue of
 * having a different ID.
 */
const URGENT_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function UrgentBanner() {
  const currentClubId = useAppStore((s) => s.currentClubId)
  const setView = useAppStore((s) => s.setView)
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  const { data } = useQuery<{ announcement: {
    id: string
    title: string
    body: string
    createdAt: string
    author: { id: string; name: string }
  } | null }>({
    queryKey: ["urgent-announcement", currentClubId ?? ""],
    queryFn: () => api(`/api/clubs/${currentClubId}/announcements/urgent`),
    enabled: !!currentClubId,
    // Poll every 60s — urgent banners are high-signal; we want a near-real-time
    // surfacing of new urgent announcements without spamming the server.
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const announcement = data?.announcement ?? null

  // Read dismissal state from localStorage when the announcement changes.
  // Deferred to a microtask so we don't call setState synchronously inside
  // the effect body (which would trigger cascading renders per React 19's
  // react-hooks/set-state-in-effect rule).
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!announcement) {
        setDismissedId(null)
        return
      }
      try {
        const key = `urgent-dismissed-${announcement.id}`
        const raw = localStorage.getItem(key)
        if (!raw) {
          setDismissedId(null)
          return
        }
        const parsed = JSON.parse(raw) as { expiresAt?: number }
        if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
          setDismissedId(announcement.id)
        } else {
          // expired — clear it so the banner re-shows
          localStorage.removeItem(key)
          setDismissedId(null)
        }
      } catch {
        setDismissedId(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [announcement])

  // Realtime refresh: when an announcement is created/updated/deleted, the
  // urgent endpoint should be re-fetched so the banner appears/disappears
  // immediately rather than waiting for the next poll.
  const qc = useQueryClient()
  useEffect(() => {
    const unsub = onRealtimeEvent("realtime:club", (d: any) => {
      const t = d?.type as string | undefined
      if (
        t === "announcement_created" ||
        t === "announcement_updated" ||
        t === "announcement_deleted" ||
        t === "new_announcement"
      ) {
        qc.invalidateQueries({ queryKey: ["urgent-announcement", currentClubId ?? ""] })
      }
    })
    return () => unsub()
  }, [currentClubId, qc])

  function dismiss() {
    if (!announcement) return
    const expiresAt = Date.now() + URGENT_DISMISS_TTL_MS
    try {
      localStorage.setItem(
        `urgent-dismissed-${announcement.id}`,
        JSON.stringify({ expiresAt }),
      )
    } catch {
      // ignore — localStorage may be unavailable in private browsing
    }
    setDismissedId(announcement.id)
  }

  if (!announcement || dismissedId === announcement.id) return null

  const bodyPreview = announcement.body.length > 120
    ? announcement.body.slice(0, 117) + "…"
    : announcement.body

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-3 sm:px-4 py-2 border-b border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-100 animate-fade-in"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">
            {announcement.title}
          </span>
          <span className="text-[10px] uppercase tracking-wide opacity-70 shrink-0">
            Urgent · {relativeTime(announcement.createdAt)} · {announcement.author.name}
          </span>
        </div>
        <p className="text-xs opacity-90 truncate hidden sm:block">{bodyPreview}</p>
      </div>
      <Button
        type="button"
        variant="club"
        size="sm"
        className="shrink-0 h-7"
        onClick={() => setView("announcements")}
      >
        View
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss urgent banner"
        className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ClubSwitcher({
  clubs, currentClub, onSelect, onCreate,
}: {
  clubs: MeResponse["memberships"]
  currentClub: MeResponse["memberships"][number] | null
  onSelect: (id: string) => void
  onCreate: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-auto py-2 px-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: currentClub?.accentColor ?? "#10b981" }}
            >
              {currentClub ? initials(currentClub.clubName) : "?"}
            </div>
            <div className="min-w-0 text-left">
              <div className="text-sm font-medium truncate">{currentClub?.clubName ?? "Select club"}</div>
              <div className="text-caption capitalize truncate">
                {currentClub ? currentClub.role : "No club selected"}
              </div>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-caption-medium uppercase tracking-wide">Your clubs</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {clubs.map((c) => (
          <DropdownMenuItem key={c.clubId} onClick={() => onSelect(c.clubId)} className="cursor-pointer gap-2.5 py-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md text-white text-[10px] font-bold shrink-0"
              style={{ backgroundColor: c.accentColor }}
            >
              {initials(c.clubName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{c.clubName}</div>
              <div className="text-caption capitalize">{c.role}</div>
            </div>
            {currentClub?.clubId === c.clubId && <span className="h-1.5 w-1.5 rounded-full bg-club shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreate} className="cursor-pointer text-club">
          <Plus className="mr-2 h-4 w-4" /> Create new club
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu({ desktop, compact }: { desktop?: boolean; compact?: boolean }) {
  const { data: session } = useSession()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<"profile" | "notifications" | "security">("profile")
  const [showJoin, setShowJoin] = useState(false)
  const setClubs = useAppStore((s) => s.setClubs)
  const user = session?.user

  // Listen for the `open-settings` custom event so other surfaces (e.g. the
  // NotificationBell footer's "Notification settings" link) can open the
  // dialog on a specific tab. The event detail carries `{ tab: "..." }`.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: string } | undefined
      if (detail?.tab === "notifications" || detail?.tab === "security" || detail?.tab === "profile") {
        setSettingsTab(detail.tab)
      } else {
        setSettingsTab("profile")
      }
      setShowSettings(true)
    }
    window.addEventListener("open-settings", handler as EventListener)
    return () => window.removeEventListener("open-settings", handler as EventListener)
  }, [])

  function openSettingsFromMenu() {
    setSettingsTab("profile")
    setShowSettings(true)
  }

  // `compact` is the top-bar avatar — small, circular, just the avatar with a
  // chevron. `desktop` is the old full-width sidebar row (now only used in
  // contexts that haven't migrated to the new top-bar layout, kept for
  // backwards compatibility).
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 hover:bg-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name} />
                <AvatarFallback className="text-xs">{initials(user?.name)}</AvatarFallback>
              </Avatar>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ) : desktop ? (
            <button
              type="button"
              className="flex items-center gap-2.5 w-full rounded-md px-2 py-2 text-left hover:bg-accent transition-colors"
              aria-label="Account menu"
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name} />
                <AvatarFallback className="text-xs">{initials(user?.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{user?.name}</div>
                <div className="text-caption truncate">{user?.email}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ) : (
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.image ?? undefined} alt={user?.name} />
                <AvatarFallback className="text-xs">{initials(user?.name)}</AvatarFallback>
              </Avatar>
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={compact ? "start" : "end"} className="w-56">
          <DropdownMenuLabel className="truncate normal-case font-normal">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-caption truncate">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowJoin(true)} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" /> Join a club
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openSettingsFromMenu} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" /> Account settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="cursor-pointer text-red-600 focus:text-red-600">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <JoinClubDialog open={showJoin} onOpenChange={setShowJoin} onJoined={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))} />
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        tab={settingsTab}
        onTabChange={(t) => setSettingsTab(t as "profile" | "notifications" | "security")}
      />
    </>
  )
}

/** Subtle dot showing realtime connection state — green=live, amber=reconnecting. */
function ConnectionIndicator() {
  const state = useRealtimeSync()
  if (state === "connected") {
    // Only render a very subtle dot; don't make it prominent.
    return (
      <span
        className="hidden sm:inline-block h-1.5 w-1.5 rounded-full bg-club shrink-0"
        title="Live sync active"
        aria-label="Live sync active"
      />
    )
  }
  return (
    <span
      className="hidden sm:inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse"
      title="Reconnecting…"
      aria-label="Reconnecting"
    />
  )
}

function JoinClubInline({ onJoined }: { onJoined: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Join a club with a code
      </Button>
      <JoinClubDialog open={open} onOpenChange={setOpen} onJoined={onJoined} />
    </>
  )
}

function JoinClubDialog({
  open, onOpenChange, onJoined,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onJoined: () => void
}) {
  const [clubCode, setClubCode] = useState("")
  const [clubPassword, setClubPassword] = useState("")
  const [loading, setLoading] = useState(false)
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await api("/api/clubs/join", { method: "POST", json: { clubCode: clubCode.toUpperCase(), clubPassword } })
      toast.success("Joined club successfully!")
      setClubCode("")
      setClubPassword("")
      onJoined()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a club</DialogTitle>
          <DialogDescription>Enter the club code and password shared by the club organizer.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleJoin} className="space-y-4">
          <div className="space-y-2">
            <Label>Club code</Label>
            <Input value={clubCode} onChange={(e) => setClubCode(e.target.value.toUpperCase())} placeholder="e.g. AB3K9X" maxLength={10} className="uppercase font-mono tracking-wider" />
          </div>
          <div className="space-y-2">
            <Label>Club password</Label>
            <Input type="password" value={clubPassword} onChange={(e) => setClubPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <DialogFooter>
            <Button type="submit" variant="club" disabled={loading}>
              {loading ? "Joining..." : "Join club"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SettingsDialog({
  open, onOpenChange, tab, onTabChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tab: "profile" | "notifications" | "security"
  onTabChange: (v: "profile" | "notifications" | "security") => void
}) {
  const { data: session } = useSession()
  const [name, setName] = useState(session?.user?.name ?? "")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState(session?.user?.image ?? "")
  const [loading, setLoading] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const setClubs = useAppStore((s) => s.setClubs)

  async function saveProfile() {
    setLoading(true)
    try {
      await api("/api/me", { method: "PATCH", json: { name, bio, avatarUrl: avatarUrl || null } })
      toast.success("Profile updated")
      const d = await api<MeResponse>("/api/me")
      setClubs(d.memberships)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }
  async function changePassword() {
    setLoading(true)
    try {
      await api("/api/me", { method: "PUT", json: { currentPassword, newPassword } })
      toast.success("Password changed")
      setCurrentPassword("")
      setNewPassword("")
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription>Update your profile, notification preferences, and password.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as "profile" | "notifications" | "security")} className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Avatar URL</Label>
                <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
              </div>
              <Button variant="club" onClick={saveProfile} disabled={loading}>
                {loading ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <NotificationsTab userEmail={session?.user?.email ?? ""} />
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <div className="space-y-2">
              <Label>Change password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (8+ chars, letter + number)" />
              <Button variant="club" onClick={changePassword} disabled={loading}>
                {loading ? "Saving..." : "Change password"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Notifications tab inside the Account Settings dialog. Loads the user's
 * normalized prefs on mount, lets them toggle email/in-app per type, and
 * pick an email mode (instant | digest). Save calls PATCH endpoint.
 */
function NotificationsTab({ userEmail }: { userEmail: string }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => getDefaultPrefs())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api<{ prefs: NotifPrefs; email: string }>("/api/me/notifications/preferences")
      .then((data) => {
        if (!active) return
        setPrefs(data.prefs)
      })
      .catch((err: any) => {
        toast.error(err?.message ?? "Failed to load preferences")
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function toggleEmail(type: NotifType, value: boolean) {
    setPrefs((p) => ({ ...p, email: { ...p.email, [type]: value } }))
  }
  function toggleInApp(type: NotifType, value: boolean) {
    setPrefs((p) => ({ ...p, inApp: { ...p.inApp, [type]: value } }))
  }
  function setMode(mode: "instant" | "digest") {
    setPrefs((p) => ({ ...p, emailMode: mode }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await api<{ prefs: NotifPrefs; email: string }>(
        "/api/me/notifications/preferences",
        { method: "PATCH", json: prefs },
      )
      setPrefs(res.prefs)
      toast.success("Notification preferences saved")
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save preferences")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Email delivery mode — kept as the two radio cards; this is the only
          binary choice that benefits from the larger card affordance. */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Email delivery</Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Sent to <span className="font-medium text-foreground">{userEmail || "your account email"}</span>.
        </p>
        <RadioGroup
          value={prefs.emailMode}
          onValueChange={(v) => setMode(v as "instant" | "digest")}
          className="grid grid-cols-2 gap-2"
        >
          <label
            htmlFor="mode-instant"
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors text-sm",
              prefs.emailMode === "instant" ? "border-club bg-club-subtle" : "border-border hover:bg-accent/50",
            )}
          >
            <RadioGroupItem value="instant" id="mode-instant" />
            <span className="font-medium">Instant</span>
          </label>
          <label
            htmlFor="mode-digest"
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors text-sm",
              prefs.emailMode === "digest" ? "border-club bg-club-subtle" : "border-border hover:bg-accent/50",
            )}
          >
            <RadioGroupItem value="digest" id="mode-digest" />
            <span className="font-medium">Daily digest</span>
          </label>
        </RadioGroup>
      </div>

      {/* Compact per-type table — one row per notification type, with
          In-app and Email toggles side by side. Replaces the previous
          two tall stacked lists (which doubled the vertical length). */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Per type</Label>
        <div className="rounded-md border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 bg-muted/40 border-b text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Type</span>
            <span className="w-14 text-center">In-app</span>
            <span className="w-14 text-center">Email</span>
          </div>
          {/* Rows */}
          {ALL_NOTIF_TYPES.map((type) => {
            const meta = NOTIF_TYPE_META[type]
            return (
              <div
                key={type}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 border-b last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{meta.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{meta.description}</div>
                </div>
                <div className="w-14 flex justify-center">
                  <Switch
                    checked={prefs.inApp[type]}
                    onCheckedChange={(v) => toggleInApp(type, v)}
                    aria-label={`In-app ${meta.label}`}
                  />
                </div>
                <div className="w-14 flex justify-center">
                  <Switch
                    checked={prefs.email[type]}
                    onCheckedChange={(v) => toggleEmail(type, v)}
                    aria-label={`Email ${meta.label}`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Button variant="club" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save preferences"}
      </Button>
    </div>
  )
}

/** Shape of a notification item as returned by GET /api/notifications. */
interface NotifItem {
  id: string
  type: string
  message: string
  linkUrl: string | null
  isRead: boolean
  createdAt: string
  clubId: string | null
}

interface NotifListResponse {
  items: NotifItem[]
  hasMore: boolean
  total: number
  unread: number
  page: number
  pageSize: number
}

/**
 * Bell dropdown — recent notifications grouped by New / Earlier, each with a
 * type-tinted icon, relative time, and click-to-navigate. Footer links open
 * the full NotificationsView or the Notifications settings tab.
 *
 * Live updates: subscribes to `realtime:notification` events for instant
 * refetch + toast on arrival; falls back to a 20s poll.
 */
function NotificationBell() {
  const [items, setItems] = useState<NotifItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const setView = useAppStore((s) => s.setView)

  const refresh = useCallback(async () => {
    try {
      const data = await api<NotifListResponse>("/api/notifications?pageSize=10")
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      /* noop — silent failure for the bell preview */
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 20_000)
    // Instant refresh when a realtime notification arrives + toast.
    const unsub = onRealtimeEvent("realtime:notification", (data: any) => {
      refresh()
      if (data?.message) {
        toast.message(data.message, { description: "Just now" })
      }
    })
    return () => { clearInterval(t); unsub() }
  }, [refresh])

  async function markAllRead() {
    if (markingAll) return
    setMarkingAll(true)
    // Optimistic — flip everything immediately for snappy UX.
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })))
    setUnread(0)
    try {
      await api("/api/notifications/read-all", { method: "POST" })
    } catch {
      // Re-fetch on failure so we don't lie about state.
      refresh()
    } finally {
      setMarkingAll(false)
    }
  }

  async function markRead(id: string) {
    // Optimistic — only flip the targeted row.
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isRead: true } : i))
    )
    setUnread((u) => Math.max(0, u - 1))
    try {
      await api(`/api/notifications/${id}/read`, { method: "POST" })
    } catch {
      refresh()
    }
  }

  function handleNotifClick(n: NotifItem) {
    const { view } = targetViewFor(n)
    if (!n.isRead) markRead(n.id)
    setView(view)
    setOpen(false)
  }

  function openSettingsTab() {
    window.dispatchEvent(
      new CustomEvent("open-settings", { detail: { tab: "notifications" } })
    )
    setOpen(false)
  }

  function viewAll() {
    setView("notifications")
    setOpen(false)
  }

  const newItems = items.filter((n) => !n.isRead)
  const earlierItems = items.filter((n) => n.isRead)
  const triggerLabel =
    unread > 0 ? `Notifications, ${unread} unread` : "Notifications"

  const triggerButton = (
    <Button variant="ghost" size="icon" className="relative" aria-label={triggerLabel}>
      <Bell className="h-4 w-4" />
      {unread > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
          aria-hidden="true"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  )

  const body = (
    <BellBody
      items={items}
      newItems={newItems}
      earlierItems={earlierItems}
      unread={unread}
      markingAll={markingAll}
      onMarkAllRead={markAllRead}
      onMarkRead={markRead}
      onNotifClick={handleNotifClick}
      onViewAll={viewAll}
      onOpenSettings={openSettingsTab}
    />
  )

  const isMobile = useIsMobile()

  if (isMobile) {
    // Mobile: full-width bottom Sheet that slides up from the bottom. The
    // anchored Popover is too cramped at 360–428px and its hover-only mark-read
    // affordance is unreachable on touch.
    return (
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (o) refresh() }}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="p-0 gap-0 max-h-[90dvh] flex flex-col rounded-t-xl"
          aria-label="Recent notifications"
        >
          {/* Drag handle */}
          <div className="pt-3 pb-1 flex justify-center shrink-0">
            <span className="h-1.5 w-10 rounded-full bg-muted" aria-hidden />
          </div>
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) refresh() }}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] max-w-[calc(100vw-1.5rem)] p-0"
        aria-label="Recent notifications"
      >
        {body}
      </PopoverContent>
    </Popover>
  )
}

/** Shared body for the notification bell — rendered inside either a Popover
 *  (desktop) or a Sheet (mobile). */
function BellBody({
  items,
  newItems,
  earlierItems,
  unread,
  markingAll,
  onMarkAllRead,
  onMarkRead,
  onNotifClick,
  onViewAll,
  onOpenSettings,
}: {
  items: NotifItem[]
  newItems: NotifItem[]
  earlierItems: NotifItem[]
  unread: number
  markingAll: boolean
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
  onNotifClick: (n: NotifItem) => void
  onViewAll: () => void
  onOpenSettings: () => void
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">Notifications</span>
          {unread > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              disabled={markingAll}
              className="inline-flex items-center gap-1 text-caption-medium text-club hover:underline disabled:opacity-50 min-h-9"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-0.5 text-caption-medium text-muted-foreground hover:text-foreground hover:underline min-h-9"
          >
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bell className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-caption text-muted-foreground mt-1 max-w-[240px] mx-auto">
            When something happens in your clubs, it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[60vh] sm:max-h-[420px]">
          <div aria-label="Recent notifications">
            {newItems.length > 0 && (
              <NotifSection label={`New · ${newItems.length}`}>
                {newItems.map((n) => (
                  <NotifRow
                    key={n.id}
                    n={n}
                    onClick={() => onNotifClick(n)}
                    onMarkRead={() => onMarkRead(n.id)}
                  />
                ))}
              </NotifSection>
            )}
            {earlierItems.length > 0 && (
              <NotifSection label="Earlier">
                {earlierItems.map((n) => (
                  <NotifRow
                    key={n.id}
                    n={n}
                    onClick={() => onNotifClick(n)}
                    onMarkRead={() => onMarkRead(n.id)}
                  />
                ))}
              </NotifSection>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Footer */}
      <div className="border-t px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 text-caption-medium text-muted-foreground hover:text-foreground transition-colors min-h-9"
        >
          <Settings className="h-3.5 w-3.5" />
          Notification settings
        </button>
      </div>
    </>
  )
}

/** Section wrapper with a small uppercase muted label. */
function NotifSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="px-3 pt-2.5 pb-1 text-caption-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="divide-y">{children}</div>
    </section>
  )
}

/** Single notification row in the dropdown. */
function NotifRow({
  n,
  onClick,
  onMarkRead,
}: {
  n: NotifItem
  onClick: () => void
  onMarkRead: () => void
}) {
  const meta = notifMeta(n.type)
  const Icon = meta.icon
  const toneClasses = notifToneClasses(meta.tone)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        "group relative flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm cursor-pointer transition-colors hover:bg-accent/60 focus:outline-none focus-visible:bg-accent/60",
        !n.isRead && "bg-club-subtle"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          toneClasses
        )}
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          <p
            className={cn(
              "text-sm leading-snug flex-1 break-words",
              !n.isRead ? "font-medium text-foreground" : "text-foreground/90"
            )}
          >
            {n.message}
          </p>
          {!n.isRead && (
            <span
              className="mt-1.5 h-1.5 w-1.5 rounded-full bg-club shrink-0"
              aria-label="Unread"
            />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-caption text-muted-foreground">{meta.label}</span>
          <span className="text-caption text-muted-foreground/60" aria-hidden="true">·</span>
          <span className="text-caption text-muted-foreground">{relativeTime(n.createdAt)}</span>
        </div>
      </div>
      {!n.isRead && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMarkRead() }}
          aria-label="Mark as read"
          className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <CheckCheck className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/**
 * Keyboard shortcuts help dialog.
 *
 * Listens globally for `?` (Shift+/) and opens a small Dialog listing every
 * keyboard shortcut available in the app. The listener is intentionally
 * suppressed when the user is typing in an input/textarea/contentEditable
 * element, or when a meta key (Cmd/Ctrl/Alt) is held — those combinations
 * belong to the OS or browser, not us.
 *
 * Other UI surfaces (the footer "Shortcuts" button, the top-bar `?` button)
 * dispatch an `open-keyboard-shortcuts` CustomEvent to trigger the same dialog
 * — same pattern the SettingsDialog uses for its `open-settings` event.
 */
function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when a meta/ctrl/alt key is held — those are browser/OS
      // shortcuts, not ours.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Ignore when the user is typing in an input, textarea, or any
      // contentEditable element. (Selects are included too — typing `?`
      // inside a select wouldn't make sense anyway.)
      const t = e.target as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          t.isContentEditable
        ) {
          return
        }
      }
      if (e.key === "?") {
        e.preventDefault()
        setOpen(true)
      }
    }
    function onOpenEvent(e: Event) {
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("open-keyboard-shortcuts", onOpenEvent as EventListener)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("open-keyboard-shortcuts", onOpenEvent as EventListener)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-club" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Press these keys anywhere in the app to navigate faster.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 mt-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 rounded-md border bg-card/40 px-3 py-2"
            >
              <span className="text-body-medium">{s.label}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map((k, i) => (
                  <kbd
                    key={i}
                    className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded border bg-muted text-[11px] font-mono text-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-caption text-muted-foreground mt-3">
          Tip: shortcuts are ignored while you&apos;re typing in a text field.
        </p>
      </DialogContent>
    </Dialog>
  )
}

/** Keyboard shortcuts surfaced in the help dialog. */
const SHORTCUTS: { label: string; keys: string[] }[] = [
  { label: "Open search", keys: ["⌘/Ctrl", "K"] },
  { label: "Open search (alt)", keys: ["/"] },
  { label: "Open this help", keys: ["?"] },
  { label: "Send chat message", keys: ["Enter"] },
  { label: "New line in chat", keys: ["Shift", "Enter"] },
  { label: "Close dialog or menu", keys: ["Esc"] },
]
