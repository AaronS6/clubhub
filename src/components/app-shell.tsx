"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { useAppStore, View } from "@/lib/store"
import { api, apiUpload } from "@/lib/api/client"
import { useSearchParams } from "next/navigation"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { initials, relativeTime } from "@/components/shared/page-header"
import { UnreadDot, UnreadBadge } from "@/components/shared/unread-indicator"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  LayoutDashboard, Megaphone, Clock, CheckSquare, CalendarDays, Users,
  ScrollText, Wallet, Settings, Bell, LogOut, LogIn, Menu, Plus, ChevronDown,
  ShieldCheck, UserCog, Sparkles, Moon, Sun, Loader2, Search as SearchIcon,
  MessageSquare, CheckCheck, ChevronRight, AlertTriangle, X, RefreshCw,
  Upload, Trash2,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useIsMobile } from "@/hooks/use-mobile"
import { AuthScreen } from "@/components/auth/auth-screen"
import { CreateClubDialog } from "@/components/auth/create-club-dialog"
import { CropAvatarDialog } from "@/components/profile/crop-avatar-dialog"
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
      { view: "financials", label: "Financials", icon: Wallet },
      { view: "approvals", label: "Approvals", icon: ShieldCheck, execOnly: true },
      { view: "activity", label: "Activity Log", icon: ScrollText, execOnly: true },
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
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark")

  // §45 — Unread-announcements indicator. Polls the first page of the
  // announcements list for the current club and compares the latest item's
  // createdAt to a localStorage timestamp (`last-seen-announcements-<clubId>`).
  // When newer, returns true so the Announcements nav item can show a
  // small accent dot.
  const hasUnreadAnnouncements = useUnreadAnnouncements(currentClubId ?? undefined)

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
            <h1 className="text-3xl font-extrabold tracking-tight mb-2">ClubHub</h1>
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
    />
  )

  const navList = (
    <nav className="flex flex-col gap-4 px-2.5 py-3" aria-label="Primary">
      {NAV_TIERS.map((tier) => {
        const items = tier.items.filter((n) => !n.execOnly || isExec)
        if (items.length === 0) return null
        return (
          <div key={tier.id} className="space-y-0.5">
            <div className="px-3 pt-1 pb-0.5 text-xs font-medium text-muted-foreground/70">
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
                    "group flex items-center gap-2.5 rounded-md w-full h-9 px-3 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-club-subtle text-club-ink"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors",
                    active ? "bg-club/15 text-club-ink" : "bg-muted/60 text-muted-foreground/80 group-hover:bg-accent group-hover:text-foreground"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.view === "announcements" &&
                    hasUnreadAnnouncements &&
                    !active && (
                      <UnreadDot pulse className="ml-auto" aria-label="New announcements" />
                    )}
                  {item.execOnly && <ShieldCheck className="ml-auto h-3 w-3 text-muted-foreground/50" />}
                </button>
              )
            })}
          </div>
        )
      })}
    </nav>
  )

  // Page title for the top bar — derived from the active nav item's label.
  const currentNavItem = NAV.find((n) => n.view === view)
  const pageTitle = currentNavItem?.label ?? "Dashboard"

  // Persistent top bar — desktop + mobile.
  //   LEFT:   hamburger (mobile) + brand mark (desktop)
  //   CENTER: global search trigger
  //   RIGHT:  connection dot, notification bell, profile avatar
  // The club switcher + theme toggle live in the sidebar (top + bottom).
  const topBar = (
    <header className="flex items-center gap-2 px-3 sm:px-4 h-14 border-b bg-background/95 backdrop-blur shrink-0 z-30" style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}>
      {/* Page title (display face, 20px) — replaces the old 'ClubHub' wordmark.
          The wordmark competed with the club switcher in the sidebar.
          Mobile nav is via the bottom tab bar's "More" button — no hamburger
          in the top bar (it was redundant). */}
      <div className="hidden md:flex items-center shrink-0 min-w-0">
        <h1 className="text-page-title truncate" style={{ fontSize: "1.25rem", lineHeight: "1.75rem" }}>{pageTitle}</h1>
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
        <kbd className="inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Mobile: page title fills the gap (replaces the club name) */}
      <div className="md:hidden font-semibold truncate flex-1 px-1 min-w-0">
        {pageTitle}
      </div>

      {/* Right side: search icon (mobile), connection, bell, profile avatar */}
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
        <NotificationBell />
        {/* Profile avatar menu — moved to the RIGHT side of the top bar */}
        <div className="shrink-0">
          <UserMenu compact />
        </div>
      </div>
    </header>
  )

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <UrgentBanner />
      {topBar}
      <div className="flex flex-1 min-h-0 p-3 gap-3">
        {/* Floating sidebar card — ~240px, inset from the left edge + below
            the top bar, 16px radius (rounded-2xl), 1px border. Club-switcher
            card pinned at the top, nav in the scrollable middle, theme toggle
            at the bottom. */}
        <aside className="hidden md:flex md:w-[240px] flex-col rounded-2xl border border-border bg-card overflow-hidden shrink-0">
          {/* Club switcher — bordered card at the top: accent logo, name,
              role, chevron. */}
          <div className="p-3 shrink-0">{clubSwitcher}</div>
          {/* Nav occupies the scrollable middle of the sidebar */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">{navList}</div>
          {/* Theme toggle pinned to the BOTTOM of the sidebar */}
          <div className="p-2 shrink-0 border-t border-border">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="ml-2">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </Button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* No top padding so view headers connect flush to the app top bar.
              Bottom padding clears the mobile bottom tab bar (pb-16 on mobile). */}
          <div className="flex-1 overflow-y-auto scroll-smooth px-4 md:px-6 pb-16 md:pb-6">
            <div className="max-w-7xl mx-auto pt-4 md:pt-6" key={`${currentClubId}-${view}`}>
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar (below md) — Dashboard, Tasks, Chat, Meetings, More.
          Safe-area padding, accent on the active tab. */}
      <MobileTabBar />

      <CreateClubDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))} />
      <GlobalSearch />
      <BadgeConfettiPopup />
    </div>
  )
}

function Footer() {
  // Footer removed per user request
}

/**
 * SwipeDownToClose — a grab-handle bar at the top of a bottom sheet /
 * dropdown. A small rounded pill visualizes "grab here", and dragging it
 * down past 80px (or a click) closes the parent. Used by the mobile "More"
 * bottom sheet and the notification bell dropdown so users can swipe down
 * from the top to dismiss on mobile.
 */
function SwipeDownToClose({ onClose }: { onClose: () => void }) {
  const startY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  function onPointerDown(e: React.PointerEvent) {
    startY.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startY.current == null) return
    const dy = e.clientY - startY.current
    if (dy > 0) setDragY(dy)
  }
  function onPointerUp() {
    if (dragY > 80) onClose()
    setDragY(0)
    startY.current = null
  }
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="shrink-0 flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
      style={{ transform: dragY ? `translateY(${Math.min(dragY, 120)}px)` : undefined, transition: dragY ? "none" : "transform 200ms ease" }}
      aria-label="Swipe down to close"
    >
      <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
    </div>
  )
}

/**
 * Mobile bottom tab bar (below md) — Dashboard, Tasks, Chat, Meetings, More.
 * "More" opens the existing mobile drawer (Sheet). Safe-area padding, accent on
 * the active tab, unread dots. Hidden below md (the sidebar takes over at md+).
 */
function MobileTabBar() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const hasUnreadAnnouncements = useUnreadAnnouncements(useAppStore((s) => s.currentClubId) ?? undefined)

  const tabs: { view: View; label: string; icon: any }[] = [
    { view: "dashboard", label: "Home", icon: LayoutDashboard },
    { view: "tasks", label: "Tasks", icon: CheckSquare },
    { view: "chat", label: "Chat", icon: MessageSquare },
    { view: "meetings", label: "Meetings", icon: CalendarDays },
  ]

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch justify-around border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Mobile primary"
      >
        {tabs.map((t) => {
          const active = view === t.view
          const Icon = t.icon
          return (
            <button
              key={t.view}
              onClick={() => setView(t.view)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 min-h-[52px] text-xs font-medium transition-colors",
                active ? "text-club-ink" : "text-muted-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5 transition-transform", active && "text-club-ink scale-110")} />
              <span>{t.label}</span>
              {t.view === "announcements" && hasUnreadAnnouncements && !active && (
                <UnreadDot className="absolute top-1 right-1/4" />
              )}
            </button>
          )
        })}
        {/* More — opens the mobile drawer (full nav + club switcher + theme) */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <button
              className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 min-h-[52px] text-xs font-medium text-muted-foreground"
              aria-label="More"
            >
              <Menu className="h-5 w-5" />
              <span>More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-xl p-0 flex flex-col max-h-[80dvh]">
            <SwipeDownToClose onClose={() => setMobileNavOpen(false)} />
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <MobileDrawerNav onPick={(v) => { setView(v); setMobileNavOpen(false) }} />
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  )
}

/** Compact nav used inside the mobile "More" bottom-sheet.
 *  Filters out execOnly items for members (Approvals, Activity Log). */
function MobileDrawerNav({ onPick }: { onPick: (v: View) => void }) {
  const view = useAppStore((s) => s.view)
  const currentClub = useAppStore((s) => s.currentClub)
  const isExec = currentClub?.role === "executive"
  return (
    <nav className="flex flex-col gap-4 px-2.5 py-4" aria-label="More">
      {NAV_TIERS.map((tier) => {
        const items = tier.items.filter((n) => !n.execOnly || isExec)
        if (items.length === 0) return null
        return (
          <div key={tier.id} className="space-y-0.5">
            <div className="px-3 pb-0.5 text-xs font-medium text-muted-foreground/70">{tier.label}</div>
            {items.map((item) => {
              const Icon = item.icon
              const active = view === item.view
              return (
                <button
                  key={item.view}
                  onClick={() => onPick(item.view)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md w-full h-11 px-3 text-left text-sm font-medium transition-colors",
                    active ? "bg-club-subtle text-club-ink" : "text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

/**
 * §45 — Hook: unread announcements indicator.
 *
 * Polls the first page of the announcements list for the current club and
 * compares the latest item's createdAt to a localStorage timestamp under
 * `last-seen-announcements-<clubId>`. Returns true when there's at least
 * one announcement newer than the stored timestamp.
 *
 * The timestamp is updated (in AnnouncementsView) whenever the user opens
 * the announcements view, so the dot clears once they've "seen" them.
 */
function useUnreadAnnouncements(clubId: string | undefined): boolean {
  const [hasUnread, setHasUnread] = useState(false)

  const { data } = useQuery<{ items: { id: string; createdAt: string }[] }>({
    queryKey: ["announcements-unread-peek", clubId ?? ""],
    queryFn: () =>
      api<{ items: { id: string; createdAt: string }[] }>(
        `/api/clubs/${clubId}/announcements?page=1`
      ),
    enabled: !!clubId,
    // Poll every 60s — same cadence as the urgent banner. Don't hammer.
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  useEffect(() => {
    let cancelled = false
    // Deferred to a microtask so we don't call setState synchronously inside
    // the effect body (avoids cascading renders per the React 19 lint rule).
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!clubId) {
        setHasUnread(false)
        return
      }
      const items = data?.items
      if (!items || items.length === 0) {
        setHasUnread(false)
        return
      }
      let lastSeen = 0
      try {
        const raw = localStorage.getItem(`last-seen-announcements-${clubId}`)
        if (raw) {
          const parsed = parseInt(raw, 10)
          if (!isNaN(parsed)) lastSeen = parsed
        }
      } catch {
        setHasUnread(false)
        return
      }
      // First-run (no stored baseline) — seed silently so we don't surprise
      // the user with a dot for announcements they already implicitly know
      // about.
      if (lastSeen === 0) {
        const latest = new Date(items[0].createdAt).getTime()
        try {
          localStorage.setItem(
            `last-seen-announcements-${clubId}`,
            String(latest)
          )
        } catch {
          // ignore
        }
        setHasUnread(false)
        return
      }
      const hasNew = items.some(
        (it) => new Date(it.createdAt).getTime() > lastSeen
      )
      setHasUnread(hasNew)
    })
    return () => {
      cancelled = true
    }
  }, [data, clubId])

  return hasUnread
}

// ---------------------------------------------------------------------------
// Badge confetti popup
// ---------------------------------------------------------------------------
//
// On app load (when AppShell mounts — which only happens after the session
// resolves + the user has at least one club), check /api/me/badges?since=
// <last-seen-badges> for any new badge awards. If there are any, pop a
// celebratory confetti overlay with the most recent award's details.
//
// The "last-seen-badges" localStorage value is a Unix-ms timestamp. First
// run (no value stored) initializes it to "now" and shows nothing — the
// baseline is the moment the user first opened the app, so only badges
// awarded AFTER that point trigger the popup.

interface BadgeAwardSummary {
  id: string
  badge: { id: string; name: string; emoji: string; description: string | null }
  awardedByName: string
  awardedAt: string
  clubName: string
}

const CONFETTI_COLORS = [
  "#16a34a", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#ec4899", // pink
  "#10b981", // teal
  "#f97316", // orange
  "#facc15", // yellow
]

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

function BadgeConfettiPopup() {
  const [activeAward, setActiveAward] = useState<BadgeAwardSummary | null>(null)
  // Generate the confetti piece positions ONCE per mount. Re-rolling on every
  // render would make the pieces jump.
  const [pieces] = useState(() => buildConfettiPieces(36))

  useEffect(() => {
    let cancelled = false

    // Read the last-seen baseline. If missing, seed it to "now" and bail —
    // we treat the first run as the baseline so we don't surprise the user
    // with a popup for badges they were already aware of before this first
    // load.
    let lastSeenMs: number | null = null
    try {
      const raw = localStorage.getItem("last-seen-badges")
      if (raw) {
        const parsed = parseInt(raw, 10)
        if (!isNaN(parsed)) lastSeenMs = parsed
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — bail silently.
      return
    }

    if (lastSeenMs === null) {
      try {
        localStorage.setItem("last-seen-badges", String(Date.now()))
      } catch {
        // ignore
      }
      return
    }

    const sinceIso = new Date(lastSeenMs).toISOString()
    api<{ awards: BadgeAwardSummary[] }>(
      `/api/me/badges?since=${encodeURIComponent(sinceIso)}`
    )
      .then((data) => {
        if (cancelled) return
        // Awards come back ordered by awardedAt desc, so the first one is
        // the most recent. Show that one — the user already got the bell
        // notification for all of them; this popup is the celebratory moment
        // for the freshest award.
        if (data.awards.length > 0) {
          setActiveAward(data.awards[0])
        }
      })
      .catch(() => {
        // Silently ignore — the confetti popup is non-critical.
      })

    return () => {
      cancelled = true
    }
  }, [])

  function dismiss() {
    // Mark every award up to "now" as seen. This includes any awarded
    // during the current session so the next load doesn't re-pop them.
    try {
      localStorage.setItem("last-seen-badges", String(Date.now()))
    } catch {
      // ignore
    }
    setActiveAward(null)
  }

  // Auto-dismiss after 5 seconds.
  useEffect(() => {
    if (!activeAward) return
    const timer = setTimeout(dismiss, 5000)
    return () => clearTimeout(timer)
  }, [activeAward])

  if (!activeAward) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="You were awarded a new badge"
    >
      {/* Dim backdrop — click anywhere to dismiss */}
      <button
        type="button"
        aria-label="Dismiss badge celebration"
        onClick={dismiss}
        className="absolute inset-0 w-full h-full bg-black/50 backdrop-blur-sm cursor-default"
      />

      {/* Confetti layer — pointer-events-none so it never blocks clicks */}
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
              // Custom property consumed by the @keyframes in globals.css
              // to drive horizontal drift as each piece falls.
              ["--confetti-x" as string]: `${p.x}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Center card */}
      <div className="relative pointer-events-auto rounded-xl border bg-background shadow-2xl px-6 py-6 max-w-sm w-full text-center animate-badge-pop">
        <div className="text-5xl leading-none mb-2" aria-hidden>
          {activeAward.badge.emoji}
        </div>
        <h2 className="text-lg font-semibold">You earned a badge! 🎉</h2>
        <p className="text-sm text-muted-foreground mt-1.5">
          You were awarded the{" "}
          <span className="font-semibold text-foreground">
            {activeAward.badge.emoji} {activeAward.badge.name}
          </span>{" "}
          badge by {activeAward.awardedByName}
          {activeAward.clubName ? ` in ${activeAward.clubName}` : ""}.
        </p>
        <Button variant="club" className="mt-4" onClick={dismiss}>
          Awesome!
        </Button>
      </div>
    </div>
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
      className="flex items-center gap-3 px-3 sm:px-4 py-2 border-b border-danger/30 bg-danger-subtle text-danger-foreground"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-danger-foreground dark:text-danger-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">
            {announcement.title}
          </span>
          <span className="text-xs  opacity-70 shrink-0">
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
        className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-danger-subtle dark:hover:bg-danger transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ClubSwitcher({
  clubs, currentClub, onSelect,
}: {
  clubs: MeResponse["memberships"]
  currentClub: MeResponse["memberships"][number] | null
  onSelect: (id: string) => void
}) {
  const [showJoin, setShowJoin] = useState(false)
  const setClubs = useAppStore((s) => s.setClubs)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between h-auto py-2.5 px-3 rounded-xl gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold shrink-0 overflow-hidden"
                style={{ backgroundColor: currentClub?.accentColor ?? "#10b981" }}
              >
                {currentClub ? initials(currentClub.clubName) : "?"}
              </div>
              <div className="min-w-0 text-left">
                <div className="text-sm font-semibold truncate">{currentClub?.clubName ?? "Select club"}</div>
                <div className="text-xs text-muted-foreground capitalize truncate">
                  {currentClub ? currentClub.role : "No club selected"}
                </div>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Clubs</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {clubs.map((c) => (
            <DropdownMenuItem key={c.clubId} onClick={() => onSelect(c.clubId)} className="cursor-pointer gap-2.5 py-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md text-white text-xs font-bold shrink-0"
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
          <DropdownMenuItem onClick={() => setShowJoin(true)} className="cursor-pointer text-club">
            <LogIn className="mr-2 h-4 w-4" /> Join a club
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <JoinClubDialog
        open={showJoin}
        onOpenChange={setShowJoin}
        onJoined={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))}
      />
    </>
  )
}

function UserMenu({ desktop, compact }: { desktop?: boolean; compact?: boolean }) {
  const { data: session } = useSession()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<"profile" | "notifications" | "security">("profile")
  const [showJoin, setShowJoin] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
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
            <LogIn className="mr-2 h-4 w-4" /> Join a club
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openSettingsFromMenu} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" /> Account settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowCreate(true)} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" /> Create a club
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="cursor-pointer text-danger-foreground focus:text-danger-foreground">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <JoinClubDialog open={showJoin} onOpenChange={setShowJoin} onJoined={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))} />
      <CreateClubDialog open={showCreate} onOpenChange={setShowCreate} onCreated={() => api<MeResponse>("/api/me").then((d) => setClubs(d.memberships))} />
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        tab={settingsTab}
        onTabChange={(t) => setSettingsTab(t as "profile" | "notifications" | "security")}
        isExec={useAppStore.getState().currentClub?.role === "executive"}
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
      className="hidden sm:inline-block h-1.5 w-1.5 rounded-full bg-warning shrink-0 animate-pulse"
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
  open, onOpenChange, tab, onTabChange, isExec,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tab: "profile" | "notifications" | "security"
  onTabChange: (v: "profile" | "notifications" | "security") => void
  isExec: boolean
}) {
  const { data: session, update } = useSession()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(session?.user?.name ?? "")
  const [bio, setBio] = useState("")
  const [avatarUrl, setAvatarUrl] = useState(session?.user?.image ?? "")
  const [loading, setLoading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  // §44 — Drag-and-drop state for the avatar upload drop zone.
  const [avatarDragging, setAvatarDragging] = useState(false)
  // Selected file awaiting crop confirmation. When set, the CropAvatarDialog
  // opens; on confirm the cropped blob is uploaded to /api/me/avatar.
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const setClubs = useAppStore((s) => s.setClubs)
  const avatarFileRef = useRef<HTMLInputElement>(null)

  // Avatar upload — opens the crop dialog with the chosen file. The actual
  // upload happens in handleCropConfirm once the user positions the crop and
  // presses Confirm. The endpoint resizes the cropped image with sharp and
  // stores a base64 data URL in User.avatarUrl. After upload we update local
  // state + call session.update() so the header avatar refreshes without a
  // full page reload.
  function openCropFromFile(f: File) {
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    setCropFile(f)
  }
  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    openCropFromFile(f)
    if (avatarFileRef.current) avatarFileRef.current.value = ""
  }

  // §44 — Drag-and-drop handlers for the avatar upload area. Allow dropping
  // an image file onto the avatar/Upload button row. Re-uses the same upload
  // path as the file-input flow.
  function onAvatarDragOver(e: React.DragEvent) {
    if (!e.dataTransfer?.types?.includes("Files")) return
    e.preventDefault()
    setAvatarDragging(true)
  }
  function onAvatarDragLeave(e: React.DragEvent) {
    if (e.currentTarget === e.target) setAvatarDragging(false)
  }
  async function onAvatarDrop(e: React.DragEvent) {
    if (!e.dataTransfer?.files?.length) return
    e.preventDefault()
    setAvatarDragging(false)
    const f = e.dataTransfer.files[0]
    openCropFromFile(f)
  }

  // Crop confirmed — upload the cropped JPEG blob to /api/me/avatar, then
  // refresh local state + the session so the header avatar updates live.
  async function handleCropConfirm(blob: Blob) {
    setAvatarUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", blob, "avatar.jpg")
      const res = await apiUpload<{ avatarUrl: string }>("/api/me/avatar", fd)
      setAvatarUrl(res.avatarUrl)
      await update({ image: res.avatarUrl })
      toast.success("Avatar updated")
    } catch (err: any) {
      toast.error(err.message || "Couldn't upload avatar")
    } finally {
      setAvatarUploading(false)
      setCropFile(null)
    }
  }

  async function handleAvatarRemove() {
    setAvatarUploading(true)
    try {
      await api("/api/me/avatar", { method: "DELETE" })
      setAvatarUrl("")
      await update({ image: null })
      toast.success("Avatar removed")
    } catch (err: any) {
      toast.error(err.message || "Couldn't remove avatar")
    } finally {
      setAvatarUploading(false)
    }
  }

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
      <DialogContent className={cn(DIALOG_CLASS, "sm:max-w-lg")} showCloseButton>
        <DialogHeader>
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription>Update your profile, notification preferences, and password.</DialogDescription>
        </DialogHeader>
        {/* Theme toggle — mobile only (desktop has the sidebar toggle) */}
        <div className="md:hidden flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            <span className="text-sm font-medium">{theme === "dark" ? "Dark mode" : "Light mode"}</span>
          </div>
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="relative h-6 w-11 rounded-full bg-muted border border-border transition-colors"
            aria-label="Toggle theme"
          >
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-transform", theme === "dark" ? "translate-x-[22px]" : "translate-x-0.5")} />
          </button>
        </div>
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as "profile" | "notifications" | "security")} className="w-full">
          <TabsList className={cn("w-full", isExec ? "grid grid-cols-3" : "grid grid-cols-2")}>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            {isExec && <TabsTrigger value="security">Security</TabsTrigger>}
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Avatar</Label>
                {/* §44 — Drop zone wrapper. The dashed border + tinted bg appear
                    only when avatarDragging; the inner avatar + buttons row is
                    unchanged otherwise. */}
                <div
                  className={cn(
                    "flex items-center gap-4 rounded-md p-2 -m-2 transition-colors",
                    avatarDragging && "border-2 border-dashed border-club bg-club-muted/20"
                  )}
                  onDragOver={onAvatarDragOver}
                  onDragLeave={onAvatarDragLeave}
                  onDrop={onAvatarDrop}
                >
                  <Avatar className="h-16 w-16 shrink-0 border">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt={name || "Your avatar"} />
                    ) : null}
                    <AvatarFallback className="text-lg font-semibold">
                      {avatarUploading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        initials(name || session?.user?.name || "?")
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={avatarFileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      aria-hidden
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => avatarFileRef.current?.click()}
                      disabled={avatarUploading}
                    >
                      {avatarUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span>{avatarUploading ? "Uploading…" : "Upload"}</span>
                    </Button>
                    {avatarUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={handleAvatarRemove}
                        disabled={avatarUploading}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Remove</span>
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-caption text-muted-foreground">
                  PNG, JPG, or WebP. You can crop &amp; rotate after picking a file.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
              </div>
              <Button variant="club" onClick={saveProfile} disabled={loading}>
                {loading ? "Saving..." : "Save profile"}
              </Button>

              <DangerZoneSection isExec={isExec} />
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <NotificationsTab userEmail={session?.user?.email ?? ""} />
          </TabsContent>

          {isExec && (
            <TabsContent value="security" className="mt-4">
              <div className="space-y-2">
                <Label>Change password</Label>
                {!isExec && (
                  <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
                )}
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (8+ chars, letter + number)" />
                <Button variant="club" onClick={changePassword} disabled={loading}>
                  {loading ? "Saving..." : "Change password"}
                </Button>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
      {/* Crop-then-upload dialog: opens when a file is picked/dropped. The
          user positions the square crop + zoom/rotate, then confirms to
          upload the cropped JPEG to /api/me/avatar. */}
      <CropAvatarDialog
        file={cropFile}
        open={!!cropFile}
        uploading={avatarUploading}
        onConfirm={handleCropConfirm}
        onCancel={() => setCropFile(null)}
      />
    </Dialog>
  )
}

/**
 * Danger Zone — appears at the bottom of the Profile tab. Groups the two
 * destructive club-level actions (leave + delete) inside a red-tinted panel
 * so they're visually separated from the rest of the settings. Both actions
 * reuse the existing API endpoints (`/api/clubs/[id]/leave` and
 * `DELETE /api/clubs/[id]`); no data logic is changed here.
 */
function DangerZoneSection({ isExec }: { isExec: boolean }) {
  const clubId = useAppStore((s) => s.currentClubId)
  const clubName = useAppStore((s) => s.currentClub?.clubName) ?? "this club"
  const setClubs = useAppStore((s) => s.setClubs)
  const clubs = useAppStore((s) => s.clubs)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Hide the entire section if the user isn't currently in a club context.
  if (!clubId) return null

  async function handleLeave() {
    setLeaving(true)
    try {
      await api(`/api/clubs/${clubId}/leave`, { method: "POST" })
      toast.success("You left the club")
      const me = await api<{ memberships: any[] }>("/api/me")
      setClubs(me.memberships ?? clubs.filter((c) => c.clubId !== clubId))
      setLeaveOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLeaving(false)
    }
  }

  async function handleDelete() {
    if (!deletePassword.trim()) {
      toast.error("Enter the club password to confirm deletion")
      return
    }
    setDeleting(true)
    try {
      await api(`/api/clubs/${clubId}`, {
        method: "DELETE",
        json: { confirmPassword: deletePassword },
      })
      toast.success(`Club "${clubName}" has been permanently deleted`)
      setDeleteOpen(false)
      setTimeout(() => window.location.reload(), 500)
    } catch (e: any) {
      toast.error(e.message || "Failed to delete club")
      setDeleting(false)
    }
  }

  return (
    <div className="border border-danger/30 dark:border-danger/40/50 rounded-xl p-4 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-4 w-4 text-danger-foreground dark:text-danger-foreground" />
        <h3 className="text-sm font-semibold text-danger-foreground dark:text-danger-foreground">
          Danger Zone
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        These actions are permanent and cannot be undone.
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Leave this club</p>
          <p className="text-xs text-muted-foreground">
            You&apos;ll lose access immediately and can rejoin later with the club code.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-danger/40 text-danger-foreground hover:bg-danger-subtle dark:border-danger/30 dark:text-danger-foreground dark:hover:bg-danger-subtle shrink-0"
          onClick={() => setLeaveOpen(true)}
        >
          <LogOut className="mr-1.5 h-4 w-4" /> Leave club
        </Button>
      </div>

      {isExec && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-t border-danger/30/60 dark:border-danger/40/40 mt-1">
          <div className="min-w-0">
            <p className="text-sm font-medium">Delete this club</p>
            <p className="text-xs text-muted-foreground">
              Permanently removes &quot;{clubName}&quot; and all of its data.
            </p>
          </div>
          <AlertDialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeletePassword("") }}>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-xs text-muted-foreground/70 hover:text-danger-foreground dark:hover:text-danger-foreground transition-colors underline-offset-2 hover:underline shrink-0"
              >
                Delete this club
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-danger-foreground" />
                  Delete &quot;{clubName}&quot;?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the club, all members, teams, tasks, hours, and messages.
                  This cannot be undone. Enter the club password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Club password"
                className="mt-2"
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault()
                    handleDelete()
                  }}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete club"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Leave confirm */}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this club?</AlertDialogTitle>
            <AlertDialogDescription>
              You will lose access to this club immediately. If you are the only executive, you must
              promote another member first. You can rejoin later with the club code and password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                handleLeave()
              }}
              disabled={leaving}
            >
              {leaving ? "Leaving…" : "Leave club"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 bg-muted/40 border-b text-xs font-semibold  text-muted-foreground">
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
                  <div className="text-xs text-muted-foreground truncate">{meta.description}</div>
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
  const [clearingAll, setClearingAll] = useState(false)
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

  async function clearAll() {
    if (clearingAll) return
    setClearingAll(true)
    // Optimistic — empty the list + reset the unread badge immediately.
    const prevItems = items
    setItems([])
    setUnread(0)
    try {
      await api("/api/notifications", { method: "DELETE" })
      toast.success("All notifications cleared")
    } catch (err) {
      // Roll back on failure so we don't lie about state.
      setItems(prevItems)
      refresh()
      toast.error(
        err instanceof Error ? err.message : "Failed to clear notifications"
      )
    } finally {
      setClearingAll(false)
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
        <UnreadBadge
          count={unread}
          className="absolute -top-0.5 -right-0.5"
          aria-hidden="true"
        />
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
      clearingAll={clearingAll}
      onMarkAllRead={markAllRead}
      onClearAll={clearAll}
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
          {/* Swipe-down-to-close grab handle (real gesture, not just visual) */}
          <SwipeDownToClose onClose={() => setOpen(false)} />
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
  clearingAll,
  onMarkAllRead,
  onClearAll,
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
  clearingAll: boolean
  onMarkAllRead: () => void
  onClearAll: () => void
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
          {unread > 0 && <UnreadBadge count={unread} />}
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
          {items.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              disabled={clearingAll}
              aria-label="Clear all notifications"
              className="inline-flex items-center gap-1 text-caption-medium text-muted-foreground hover:text-destructive hover:underline disabled:opacity-50 min-h-9"
            >
              {clearingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Clear all
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
        <div className="max-h-[264px] overflow-y-auto scrollbar-thin">
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
        </div>
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
      <div className="px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground text-muted-foreground">
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
            <UnreadDot className="mt-1.5" aria-label="Unread" />
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
// KeyboardShortcutsHelp + SHORTCUTS removed
