"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { useAppStore, View } from "@/lib/store"
import { api, apiUpload } from "@/lib/api/client"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { initials, relativeTime } from "@/components/shared/page-header"
import { UnreadDot, UnreadBadge } from "@/components/shared/unread-indicator"
import { DIALOG_CLASS } from "@/components/shared/dialog-class"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ResilientImage } from "@/components/ui/resilient-image"
import {
  DecoratedAvatar,
  DECORATION_IDS,
  DECORATION_LABELS,
  toDecorationId,
  type DecorationId,
} from "@/components/shared/decorated-avatar"
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
  Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  LayoutDashboard, Megaphone, Clock, CheckSquare, CalendarDays, Users,
  ScrollText, Wallet, Settings, Bell, LogOut, LogIn, Menu, Plus, ChevronDown,
  ShieldCheck, UserCog, Sparkles, Moon, Sun, Loader2, Search as SearchIcon,
  MessageSquare, CheckCheck, Check, ChevronRight, AlertTriangle, X, RefreshCw,
  Upload, Trash2, Palette, NotebookPen, KeyRound, Compass, UserCheck,
  BookOpen, BookOpenCheck, Keyboard, Database, GraduationCap, PlayCircle,
  User, Link2, ChevronLeft, CheckCircle2, UserPlus,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useIsMobile } from "@/hooks/use-mobile"
import { useSearchShortcutHint } from "@/hooks/use-platform"
import { CreateClubDialog } from "@/components/auth/create-club-dialog"
import { CropAvatarDialog } from "@/components/profile/crop-avatar-dialog"
import { authenticateSocket, getRealtimeSocket, onRealtimeEvent } from "@/lib/realtime-client"
import { openGlobalSearch } from "@/components/global-search"
// Lazy-load the GlobalSearch command palette (heavy: bundles cmdk). It's
// only opened on Cmd+K / `/` / header click, so deferring it keeps the
// initial chunk lean. The component still mounts on the client shortly after
// hydration and registers its keydown listener + custom-event handler.
const GlobalSearch = dynamic(
  () => import("@/components/global-search").then((m) => m.GlobalSearch),
  { ssr: false }
)
// Public landing page — lazy-loaded because only UNAUTHENTICATED visitors
// need it. Signed-in users never download this chunk, and it keeps the
// unauth first paint snappy.
const LandingPage = dynamic(
  () => import("@/components/landing/landing-page").then((m) => m.LandingPage),
  { ssr: false }
)
// §Load speed — code-split the rarely-rendered / event-driven surfaces so
// ~250KB of source leaves the shell's critical chunk (smaller first paint
// + faster hydration; these chunks stream in parallel only when actually
// needed):
//   • PublicClubProfile — renders ONLY for ?public=<code> visitors.
//   • AuthScreen — renders ONLY for ?auth=login|signup or reset links.
//   • OnboardingTour / AdminTour / ExecHandbookModal — overlay guides that
//     mount idle and listen for events; their auto-open flows all carry
//     ≥1.1s settle delays, so a parallel chunk fetch never races them.
// AdminTour is additionally gated below on the executive role, so regular
// members never download it at all.
const PublicClubProfile = dynamic(
  () => import("@/components/public-club-profile").then((m) => m.PublicClubProfile),
  { ssr: false, loading: () => <FullBleedLoader label="Loading club…" /> }
)
const AuthScreen = dynamic(
  () => import("@/components/auth/auth-screen").then((m) => m.AuthScreen),
  { ssr: false, loading: () => <FullBleedLoader label="Loading…" /> }
)
const OnboardingTour = dynamic(
  () => import("@/components/onboarding-tour").then((m) => m.OnboardingTour),
  { ssr: false, loading: () => null }
)
const AdminTour = dynamic(
  () => import("@/components/admin-tour").then((m) => m.AdminTour),
  { ssr: false, loading: () => null }
)
const ExecHandbookModal = dynamic(
  () => import("@/components/exec-handbook-modal").then((m) => m.ExecHandbookModal),
  { ssr: false, loading: () => null }
)
// Minimal full-bleed loader for the code-split full-page branches above —
// the visitor sees a quiet spinner for the ~100-300ms the chunk streams in.
function FullBleedLoader({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground" role="status" aria-label={label}>
      <Loader2 className="h-6 w-6 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
import {
  notifMeta, notifToneClasses, targetViewFor,
} from "@/lib/notif-meta"
import { useCustomizationStore, AMBIENT_PRESETS, THEME_COLOR_PRESETS } from "@/lib/customization-store"
import { AmbientPreviewMini } from "@/components/shared/ambient-preview-mini"
import { useWhatsNewNotif, openWhatsNew } from "@/lib/whats-new"
// APP_VERSION (not whats-new's ack key "7.5.1") — the bell section label
// displays the real user-facing version.
import { APP_VERSION } from "@/lib/version"
import { KeyboardShortcuts, OPEN_KEYBOARD_SHORTCUTS_EVENT } from "@/components/shared/keyboard-shortcuts"

interface MeResponse {
  user: { id: string; name: string; email: string; avatarUrl?: string | null } | null
  memberships: {
    clubId: string
    clubName: string
    logoUrl: string | null
    accentColor: string
    clubCode: string
    role: "member" | "executive"
    /** Null until an executive confirms the Executive Admin Handbook popup
     *  for this club (stamped once per club lifetime in the DB). */
    handbookAcceptedAt?: string | null
  }[]
}

/** The club payload returned by POST /api/clubs/join and POST /api/clubs —
 *  carried into `onJoined`/`onCreated` so the app can switch straight into
 *  the club the user just landed in (instead of the previously-open one). */
interface JoinedClubInfo {
  id: string
  name: string
  clubCode: string
  accentColor: string
}

/** A club entry in the public directory list (GET /api/public/clubs) — the
 *  public-safe recruiting fields the join dialog's Explore tab renders in
 *  its mini-directory (the same shape the landing page directory consumes).
 *  No passwords, no member lists — identity info only. */
interface PublicClubMini {
  name: string
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  /** 0–1 vertical focal point for the banner crop (as the landing cards). */
  bannerFocalY: number | null
  accentColor: string
  clubCode: string
  /** How new members get in: type the code, or request approval. */
  joinMode: "code" | "request"
  memberCount: number
}

/** sessionStorage key set right before the public club profile navigates into
 *  the app after an in-page join — app-shell consumes it after bootstrap to
 *  land in the JUST-JOINED club (a full page load would otherwise restore the
 *  previously-open club from the persisted store). */
const SELECT_CLUB_KEY = "clubhub-select-club"
/** Marker written by the public profile's JOIN flow only — tells this shell
 *  to open the introduction tour after switching into the new club. An
 *  existing member using "Open club workspace" writes SELECT_CLUB_KEY without
 *  this marker, so they get a silent club switch (no tour replay). */
const JUST_JOINED_KEY = "clubhub-just-joined"

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
      { view: "notes", label: "Notes", icon: NotebookPen },
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
      { view: "storage", label: "Storage", icon: Database, execOnly: true },
    ],
  },
]

/** Flat list of every nav item (used for `?view=` validation + filtering). */
const NAV: NavItem[] = NAV_TIERS.flatMap((t) => t.items)

/** Refresh memberships and switch straight into the given club — the one
 *  just joined or created — instead of staying on the previously-open club
 *  (fixes "after I joined it redirected me to my other club"). Reads the
 *  store imperatively so any component (AppShell, UserMenu, dialogs) can
 *  call it without prop-drilling. */
function landInClub(clubId?: string | null) {
  api<MeResponse>("/api/me")
    .then((d) => {
      const { setClubs, selectClub } = useAppStore.getState()
      setClubs(d.memberships)
      if (clubId) selectClub(clubId)
    })
    .catch(() => {})
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const { clubs, currentClub, currentClubId, view, setView, setClubs, selectClub } = useAppStore()
  const [bootstrapped, setBootstrapped] = useState(false)
  const [bootFailed, setBootFailed] = useState(false)
  const bootRef = useRef(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const params = useSearchParams()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark")

  // §45 — Unread-announcements indicator. Polls the first page of the
  // announcements list for the current club and compares the latest item's
  // createdAt to a localStorage timestamp (`last-seen-announcements-<clubId>`).
  // When newer, returns true so the Announcements nav item can show a
  // small accent dot.
  const hasUnreadAnnouncements = useUnreadAnnouncements(currentClubId ?? undefined)

  // ── Session-loading timeout + manual session probe ──────────────────────
  // NextAuth v4's `useSession()` can intermittently get stuck in the "loading"
  // state on page navigation (known issue in the App Router where the
  // SessionProvider's in-memory cache desyncs from the freshly-set cookie).
  // We can't rely on `status` alone to gate the app — a stuck "loading" would
  // spin forever.
  //
  // Strategy: do a manual `fetch('/api/auth/session')` on mount. If it
  // returns a session, we mark `manualSession` as the authoritative auth
  // state. We then treat `status === "loading"` as "unauthenticated" UNLESS
  // the manual probe found a session (in which case we proceed as
  // authenticated). This means:
  //   - Fresh visit, no cookie → manual probe returns null → show auth screen
  //     immediately (no spinner blocking the UI).
  //   - Just-logged-in → manual probe returns the user → proceed to app
  //     even if SessionProvider is still "loading".
  //   - Stuck SessionProvider on a page reload → same as above.
  // The SessionProvider's `status` still drives the realtime socket auth
  // and the `session` object, but it no longer gates the initial render.
  const [manualSession, setManualSession] = useState<{ user: { id: string } | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => { if (!cancelled) setManualSession({ user: d?.user ?? null }) })
      .catch(() => { if (!cancelled) setManualSession({ user: null }) })
    return () => { cancelled = true }
  }, [])

  // Effective auth state: if the manual probe has completed, use it as the
  // source of truth (it's a fresh fetch every page load, so it's always
  // current). Fall back to the SessionProvider's status only before the
  // probe completes (the first ~50ms).
  const manualAuthenticated = manualSession?.user != null
  const effectiveStatus: "loading" | "authenticated" | "unauthenticated" =
    manualSession == null
      ? "loading"
      : manualAuthenticated
        ? "authenticated"
        : "unauthenticated"
  // We still use `session?.user?.id` from the SessionProvider for the actual
  // user id (the manual probe only confirms presence). If the manual probe
  // says authenticated but the SessionProvider hasn't resolved yet, we
  // synthesize a minimal session from the manual probe's user id.
  const effectiveUserId = session?.user?.id ?? manualSession?.user?.id ?? null

  // Bootstrap: fetch /api/me once the session is authenticated. This is the
  // gate that keeps the entire app on the loading screen, so it has a hard
  // timeout (8s) that falls back to a friendly Retry UI instead of spinning
  // forever on a slow/hung request. We use `effectiveStatus` (which is
  // backed by the manual session probe) instead of `status` from the
  // SessionProvider, because the SessionProvider can get stuck in "loading".
  useEffect(() => {
    if (effectiveStatus !== "authenticated" || bootstrapped || bootRef.current) return
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
  }, [effectiveStatus, bootstrapped, setClubs])

  // Retry handler for the timeout fallback.
  const retryBoot = () => {
    bootRef.current = false
    setBootFailed(false)
  }

  // ── Join intent (public site → authenticated join flow) ─────────────────
  // When an unauthenticated visitor clicks "Join this club" on a public club
  // profile, we store the club code in sessionStorage and route them to the
  // auth screen. After they sign up / log in and the app bootstraps, we
  // re-check membership: if they already belong to the club we open that
  // club's workspace; otherwise we open the EXISTING join dialog with the
  // code prefilled. The club password is still required — authentication
  // alone never grants membership.
  const [joinIntent, setJoinIntent] = useState<string | null>(null)
  useEffect(() => {
    if (!bootstrapped) return
    // Deferred to a microtask so we don't call setState synchronously inside
    // the effect body (avoids cascading renders per the React 19 lint rule —
    // same pattern as the onboarding-dismissal effect above).
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      let intent: string | null = null
      try {
        intent = sessionStorage.getItem("clubhub-join-intent")
      } catch {
        intent = null
      }
      if (!intent) return
      try {
        sessionStorage.removeItem("clubhub-join-intent")
      } catch {
        /* ignore */
      }
      const code = intent.trim().toUpperCase()
      const existing = clubs.find((c) => c.clubCode === code)
      if (existing) {
        toast(`Already a member of ${existing.clubName}.`)
        selectClub(existing.clubId)
        return
      }
      setJoinIntent(code)
    })
    return () => {
      cancelled = true
    }
  }, [bootstrapped, clubs, selectClub])

  // ── New-club-join detection ─────────────────────────────────────────────
  // Whenever the user's club count INCREASES (joining a club, joining via a
  // public profile, creating a club, or an exec approving their request),
  // we auto-open the OnboardingTour so the introduction guide walks them
  // through the club they just landed in — EVERY new club, not just the
  // first one (per user request). The guide can always be dismissed, and
  // it stays replayable from the account menu.
  const prevClubsCountRef = useRef(clubs.length)
  const tourArmedRef = useRef(false)
  useEffect(() => {
    // Pre-bootstrap (zustand persist hydration + the /api/me sync) is NOT a
    // join — keep the baseline in sync without arming, otherwise every page
    // reload would re-open the guide.
    if (!bootstrapped) {
      prevClubsCountRef.current = clubs.length
      return
    }
    const prev = prevClubsCountRef.current
    prevClubsCountRef.current = clubs.length
    // Transition: ANY increase in club count (0→1 first club, or n→n+1 when
    // joining/creating/approved into another club) → show the guide.
    if (clubs.length > prev) {
      tourArmedRef.current = true
    }
  }, [clubs.length, bootstrapped])

  // ── Executive Admin Handbook (once per club lifetime) ────────────────────
  // The FIRST club where the viewer is an active executive and the handbook
  // hasn't been acknowledged (club.handbookAcceptedAt == null) gets the
  // non-dismissible handbook popup. Typically that's the club they just
  // created; confirming stamps the DB flag so it never shows again. If the
  // handbook popup is up, the tour waits until it's confirmed.
  //
  // `confirmedThisSession` guards the brief window between the confirm POST
  // succeeding and the memberships refetch landing (clubs is still stale
  // there, so without the guard the modal would instantly re-open).
  const [confirmedThisSession, setConfirmedThisSession] = useState<string[]>([])
  const handbookDue = useMemo(
    () =>
      clubs.find(
        (c) =>
          c.role === "executive" &&
          (c.handbookAcceptedAt ?? null) === null &&
          !confirmedThisSession.includes(c.clubId),
      ) ?? null,
    [clubs, confirmedThisSession],
  )

  // The tour itself: fires 600ms after the club list settles, deferred
  // behind the handbook popup when one is due (the exec confirms the
  // handbook FIRST, then gets the introduction guide for the new club).
  // Fire-and-forget on purpose: the handbook confirm triggers a SECOND
  // render (the memberships refetch) whose effect cleanup would otherwise
  // cancel the pending dispatch.
  //
  // EXECUTIVES get the dedicated EXECUTIVE guide instead (admin-tour.tsx):
  // it opens itself ~1.1s after the handbook is acknowledged for the club,
  // so the member tour is deliberately skipped here — the two guides never
  // race. Regular members keep getting the onboarding tour below.
  useEffect(() => {
    if (!tourArmedRef.current) return
    if (handbookDue) return // wait for the handbook modal to be confirmed
    tourArmedRef.current = false
    if (useAppStore.getState().currentClub?.role === "executive") return
    setTimeout(() => window.dispatchEvent(new CustomEvent("open-onboarding-tour")), 600)
  }, [clubs, handbookDue])

  /** Handbook confirmed → mark it confirmed for this session (instantly
   *  hides the modal) + refresh memberships (the DB flag is the permanent
   *  record — this refetch lets the tour trigger release and re-evaluates
   *  the next unacknowledged exec club, if any). */
  const handleHandbookConfirmed = useCallback(
    (clubId: string) => {
      setConfirmedThisSession((prev) =>
        prev.includes(clubId) ? prev : [...prev, clubId],
      )
      api<MeResponse>("/api/me").then((d) => setClubs(d.memberships)).catch(() => {})
    },
    [setClubs],
  )

  // ── Executive Admin Handbook — REVIEW mode ──────────────────────────────
  // Execs can re-read the handbook anytime: Settings → Security (rendered
  // only when the viewer is an exec of the ACTIVE club) dispatches the
  // `open-exec-handbook` window event — same pattern as `open-onboarding-tour`.
  // The settings dialog closes itself first (`close-settings`) so the handbook
  // overlay never stacks on a Radix dialog.
  const [handbookReview, setHandbookReview] = useState<{
    clubId: string
    clubName: string
  } | null>(null)
  useEffect(() => {
    const openHandler = () => {
      const c = useAppStore.getState().currentClub
      if (!c || c.role !== "executive") return // execs of the active club only
      setHandbookReview({ clubId: c.clubId, clubName: c.clubName })
    }
    window.addEventListener("open-exec-handbook", openHandler)
    return () => window.removeEventListener("open-exec-handbook", openHandler)
  }, [])

  // ── Land in the just-joined club after a FULL page navigation ────────────
  // The public club profile joins (or "Open club workspace") in-page, then
  // does window.location.assign("/") so the shell bootstraps fresh. Before
  // navigating it stashes the target club id under SELECT_CLUB_KEY — consumed
  // here (once per load) to switch into that club. A fresh JOIN additionally
  // writes JUST_JOINED_KEY, which opens the introduction guide for it.
  const afterLoadTourFiredRef = useRef(false)
  useEffect(() => {
    if (!bootstrapped) return
    let id: string | null = null
    let justJoined = false
    try {
      id = sessionStorage.getItem(SELECT_CLUB_KEY)
      justJoined = !!sessionStorage.getItem(JUST_JOINED_KEY)
      sessionStorage.removeItem(JUST_JOINED_KEY)
    } catch {
      id = null
    }
    if (!id) return
    try {
      sessionStorage.removeItem(SELECT_CLUB_KEY)
    } catch {
      /* ignore */
    }
    if (!clubs.some((c) => c.clubId === id)) return
    // Deferred to a microtask so we don't call setState synchronously inside
    // the effect body (React 19 lint rule, same as the join-intent effect).
    const clubId = id
    Promise.resolve().then(() => {
      selectClub(clubId)
    })
    // Joined a NEW club on the public profile → open the introduction guide
    // for it. Fire-once per page load (no cleanup — later effect re-runs from
    // refetches must not cancel the pending tour dispatch). "Open club
    // workspace" (existing member) skips this — they've seen it already.
    if (justJoined && !afterLoadTourFiredRef.current) {
      afterLoadTourFiredRef.current = true
      setTimeout(() => window.dispatchEvent(new CustomEvent("open-onboarding-tour")), 900)
    }
  }, [bootstrapped, clubs, selectClub])

  useEffect(() => {
    const v = params.get("view") as View | null
    if (v && NAV.some((n) => n.view === v)) setView(v)
  }, [params, setView])

  // ── View-switch feel: scroll reset + URL mirroring ────────────────────
  // Switching views (or clubs) remounts the keyed content wrapper below, so
  // the scroll container would otherwise stay wherever the previous view
  // left it — "switch views → land mid-page". Reset BEFORE paint
  // (useLayoutEffect) with an explicit `instant` behavior: the container is
  // `scroll-smooth`, so the default would glide visibly to the top.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" })
  }, [view, currentClubId])

  // Write side of the `?view=` param (the effect above is the read side).
  // Native history API — next/navigation's router.replace would re-render
  // the tree. "dashboard" is the default view and keeps the bare URL; all
  // other query params (?public= / ?auth= / ?landing=) are preserved. On
  // mount the URL is the source of truth (the read effect's setView may
  // still be in flight), so the first run never overwrites a differing
  // ?view= — otherwise a stale persisted view could clobber a fresh deep
  // link before the read side lands.
  const viewUrlFirstRun = useRef(true)
  useEffect(() => {
    const url = new URL(window.location.href)
    const current = url.searchParams.get("view")
    const target = view === "dashboard" ? null : view
    if (viewUrlFirstRun.current) {
      viewUrlFirstRun.current = false
      // URL carries a different view than the store → the read effect's
      // setView is already queued; let it land and re-run this effect.
      if (current !== null && current !== target) return
    }
    if (current === target) return
    if (target === null) url.searchParams.delete("view")
    else url.searchParams.set("view", view)
    window.history.replaceState(null, "", url.toString())
  }, [view])

  // Authenticate the realtime socket once we know the user + clubs. We use
  // `effectiveUserId` (from the manual probe fallback) so the socket connects
  // even if the SessionProvider is still "loading".
  useEffect(() => {
    if (effectiveStatus !== "authenticated" || !effectiveUserId || clubs.length === 0) return
    authenticateSocket(effectiveUserId, clubs.map((c) => c.clubId))
    const s = getRealtimeSocket()
    if (!s.connected) s.connect()
  }, [effectiveStatus, effectiveUserId, clubs])

  // The manual session probe completes in ~50ms. We only show the bare
  // spinner for that brief window (manualSession == null). Once the probe
  // returns, we immediately render either the auth screen (no session) or
  // proceed to bootstrap. This eliminates the "stuck on loading" failure
  // mode entirely — there's no long-lived "loading" state to get stuck in.
  if (effectiveStatus === "loading" || (effectiveStatus === "authenticated" && !bootstrapped && !bootFailed)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Bootstrap timeout fallback — the /api/me call took too long. Show a
  // friendly retry instead of spinning forever.
  if (effectiveStatus === "authenticated" && bootFailed && !bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Loader2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Taking a moment to load</h2>
          <p className="text-sm text-muted-foreground mb-4">
            This usually clears up on retry.
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

  // `?landing=1` forces the public landing page even while signed in. The
  // join dialog's "Explore clubs" tab navigates here so members can browse
  // the full public directory (photos, descriptions, how to join) instead of
  // the cramped inline mini-list. The landing page itself detects the
  // session and shows an "Open the app" button instead of Log in / Sign up,
  // so nobody gets stranded outside the app. (Unauthenticated visitors
  // already get the landing page at "/" — this only changes logged-in users.)
  if (params.get("landing")) {
    return <LandingPage />
  }

  if (effectiveStatus === "unauthenticated") {
    // `?auth=login|signup` renders the EXISTING auth screen (the component
    // itself is unchanged) — this is what the public landing page's Log In /
    // Sign Up buttons link to. Without the param, unauthenticated visitors
    // get the public landing page with club discovery instead of a login wall.
    // `?reset=TOKEN` (an emailed password-reset link) ALSO needs the auth
    // screen — AuthScreen internally swaps in the reset-password form when
    // it sees the token (it accepts both `reset` and legacy `resetToken`).
    const authParam = params.get("auth")
    const hasResetToken = params.get("reset") || params.get("resetToken")
    if (authParam === "login" || authParam === "signup" || hasResetToken) {
      return <AuthScreen />
    }
    return <LandingPage />
  }

  // No clubs yet -> onboarding
  if (clubs.length === 0) {
    const firstName = session?.user?.name?.split(" ")[0]
    return (
      <div className="min-h-screen flex flex-col bg-transparent relative z-10">
        {/* Header — wordmark left, profile menu right (account settings,
            join/create, and Sign out live in the dropdown). */}
        <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
          <span className="text-lg font-extrabold tracking-tight">ClubHub</span>
          <UserMenu compact />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-card shadow-card p-6 m-3">
          <div className="w-full max-w-md text-center">
            {firstName && (
              <p className="text-caption uppercase tracking-wider text-muted-foreground/70 mb-2">
                Welcome, {firstName}
              </p>
            )}
            <h1 className="text-page-title mb-2">Get started</h1>
            <p className="text-body text-muted-foreground mt-2 mb-7 max-w-sm mx-auto">
              Create a club, or join one with a code.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="club" size="lg" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Create a club
              </Button>
              <JoinClubInline onJoined={(club) => landInClub(club?.id)} />
              <Button variant="ghost" onClick={() => router.push("/?landing=1")}>
                <Compass className="mr-1.5 h-4 w-4" /> Explore clubs
              </Button>
            </div>
          </div>
        </div>
        <CreateClubDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(club) => landInClub(club?.id)} />
        {/* Join-intent resume (public site → this brand-new account): the
            prefilled join dialog opens here too, right on the onboarding
            screen. */}
        {joinIntent && (
          <JoinClubDialog
            key={joinIntent}
            open
            onOpenChange={(o) => { if (!o) setJoinIntent(null) }}
            onJoined={(club) => {
              setJoinIntent(null)
              landInClub(club?.id)
            }}
            defaultClubCode={joinIntent}
          />
        )}
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
            {/* Group label — one consistent 10px uppercase tracked muted label.
                No top padding: the nav's gap-4 between tiers keeps the rhythm
                even, so every label sits the same distance from what's above. */}
            <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
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
                    "group relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-[color,background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]",
                    active
                      ? "bg-secondary/80 font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : "font-normal text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {/* Active row — the Linear-style recipe: a neutral secondary
                      fill, a 3px club-accent bar on the LEFT edge, a
                      foreground label, a club-ink icon, and a whisper inset
                      highlight. Everything rides theme tokens (secondary /
                      club), so any per-club accent and dark mode keep reading
                      correctly. Inactive rows stay muted and only pick up a
                      whisper of neutral fill on hover. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 h-[18px] w-[3px] rounded-full bg-club transition-opacity duration-150",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-club-ink")} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.view === "announcements" &&
                    hasUnreadAnnouncements &&
                    !active && (
                      <UnreadDot pulse aria-label="New announcements" />
                    )}
                  {item.execOnly && <ShieldCheck className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
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
  // PERF: no backdrop-blur on the header (was bg-background/80 +
  // backdrop-blur-md) — a blurred full-width header re-rasters EVERY frame
  // while a sheet/dialog overlay fades in over it AND while the ambient
  // background morphs behind it, which was the single biggest cause of the
  // choppy More / notifications sheet opens on mobile. A nearly-opaque solid
  // background looks identical for ~0 paint cost (same fix the bottom tab
  // bar got earlier).
  const topBar = (
    <header className="flex items-center gap-2 px-3 sm:px-4 h-14 border-b border-border/70 bg-background/95 shrink-0 z-30" style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}>
      {/* Page title (display face, 20px) — replaces the old 'ClubHub' wordmark.
          The wordmark competed with the club switcher in the sidebar.
          Mobile nav is via the bottom tab bar's "More" button — no hamburger
          in the top bar (it was redundant). */}
      <div className="hidden md:flex items-center shrink-0 min-w-0">
        <h1 className="truncate font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem", lineHeight: "1.5rem", letterSpacing: "-0.018em" }}>{pageTitle}</h1>
      </div>

      {/* Search (center, desktop) — a full-round pill that reads bespoke, not
          templated: the placeholder carries the club's OWN name ("Search
          Robotics Club…"), and the ⌘K hint is a physical keycap floating on
          the pill's right edge (opaque key + hairline border + elevation
          shadow). The trigger blurs itself when it opens the palette so no
          browser (Safari/Firefox included) can paint a focus ring on it while
          the palette is up. */}
      <button
        type="button"
        onClick={(e) => { openGlobalSearch(); e.currentTarget.blur() }}
        disabled={!currentClubId}
        className="hidden md:flex group items-center gap-2.5 h-9 rounded-full border border-input bg-muted/40 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground hover:border-border transition-[background-color,color,border-color] disabled:opacity-50 disabled:pointer-events-none max-w-md flex-1 mx-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0"
        aria-label={currentClub ? `Search ${currentClub.clubName}` : "Open search"}
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">{currentClub ? `Search ${currentClub.clubName}…` : "Search this club…"}</span>
        <SearchShortcutHint />
      </button>

      {/* Mobile: page title fills the gap (replaces the club name) */}
      <div className="md:hidden font-semibold truncate flex-1 px-1 min-w-0" style={{ letterSpacing: "-0.01em" }}>
        {pageTitle}
      </div>

      {/* Right side: search icon (mobile), bell, profile avatar */}
      <div className="flex items-center gap-0.5 ml-auto shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Search"
          disabled={!currentClubId}
          onClick={(e) => { openGlobalSearch(); e.currentTarget.blur() }}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>
        <NotificationBell />
        {/* Profile avatar menu — moved to the RIGHT side of the top bar */}
        <div className="shrink-0">
          <UserMenu compact />
        </div>
      </div>
    </header>
  )

  return (
    // `ch-app` marks the in-app (non-portal) DOM subtree — globals.css uses
    // it to pause background decoration animations while modal overlays are
    // open (decorations rendered inside sheet/dialog PORTALS keep animating,
    // e.g. the settings effect picker previews).
    <div className="ch-app h-dvh flex flex-col overflow-hidden relative z-10">
      {/* The ambient background (CustomizationProvider renders this) sits at
          z-0 behind this z-10 shell. We use `bg-transparent` here so the
          ambient shows through. Cards/surfaces inside (bg-card) remain opaque
          so content stays readable. */}
      <UrgentBanner />
      {topBar}
      <div className="flex flex-1 min-h-0 p-3 gap-3">
        {/* Sidebar surface — one card formula with everything else in the app:
            rounded-2xl (16px), 1px hairline border, quiet card shadow.
            "Glassier nav": a translucent card body + backdrop saturation so
            the sidebar reads
            as frosted glass floating over the ambient background (the sidebar
            is only 240px wide, so the blur cost that disqualified the top bar
            doesn't apply). A lit top edge (inset 1px highlight) carries the
            physical elevation language. Club-switcher card pinned at the top,
            nav in the scrollable middle, theme toggle at the bottom. */}
        <aside className="hidden md:flex md:w-[240px] flex-col rounded-2xl border border-border/80 bg-card/85 backdrop-blur-md backdrop-saturate-[1.15] overflow-hidden shrink-0 shadow-card dark:bg-card/80">
          {/* Club switcher — hairline ghost row at the top (transparent at
              rest, fill only on hover/open): accent logo, name, role,
              chevron. */}
          <div className="p-3 shrink-0">{clubSwitcher}</div>
          {/* Nav occupies the scrollable middle of the sidebar */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">{navList}</div>
          {/* Theme toggle pinned to the BOTTOM of the sidebar */}
          <div className="p-2 shrink-0 border-t border-border/80">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="ml-2">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </Button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          {view === "chat" ? (
            /* ── iOS Safari keyboard fix: dedicated NON-scrollable branch ──
               Chat renders its own full-height panes (conversation list +
               thread) that manage their own internal scrolling. Wrapping
               them in the standard overflow-y-auto container made the pane
               (~48px taller than the wrapper: pt-4 + pb-16 + topbar) scroll
               the page, and iOS caret-reveal rescrolled that container on
               EVERY keystroke — the composer visibly slid down/jumped while
               typing. Here the pane flex-fills this branch exactly, so
               there is nothing to rescroll. No horizontal/bottom wrapper
               padding; the only clearance is mobile-only, lifting the pane
               above the shell's fixed bottom tab bar (52px + safe area;
               the outer main row's p-3 adds the rest — desktop shows no
               tab bar, hence md:pb-0). scrollRef stays unattached in this
               branch — the scroll-reset effect above already null-guards
               with optional chaining, so it's a no-op here. */
            <div
              className="ch-view-enter flex-1 min-h-0 flex flex-col pb-[calc(3.25rem_+_env(safe-area-inset-bottom))] md:pb-0"
              key={`${currentClubId}-${view}`}
            >
              {children}
            </div>
          ) : (
            /* No top padding so view headers connect flush to the app top bar.
               Bottom padding clears the mobile bottom tab bar (pb-16 on mobile). */
            <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-smooth px-4 md:px-6 pb-16 md:pb-6">
              {/* ch-view-enter: one-shot 200ms opacity + 6px rise on every
                  view/club switch (replayed by the remount key below);
                  neutralized under prefers-reduced-motion in globals.css. */}
              <div className="ch-view-enter max-w-7xl mx-auto pt-4 md:pt-6" key={`${currentClubId}-${view}`}>
                {children}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom tab bar (below md) — Dashboard, Tasks, Chat, Meetings, More.
          Safe-area padding, accent on the active tab. */}
      <MobileTabBar />

      <CreateClubDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(club) => landInClub(club?.id)} />
      {/* Join-intent resume — a visitor who clicked "Join this club" on the
          public site gets the join dialog with the code prefilled after
          signing in. They still confirm with the club password. */}
      {joinIntent && (
        <JoinClubDialog
          key={joinIntent}
          open
          onOpenChange={(o) => { if (!o) setJoinIntent(null) }}
          onJoined={(club) => {
            setJoinIntent(null)
            landInClub(club?.id)
          }}
          defaultClubCode={joinIntent}
        />
      )}
      <GlobalSearch />
      {/* g-chord navigation + `?` cheat sheet (§ v7.2). Listens globally;
          only mounts inside the authenticated shell. */}
      <KeyboardShortcuts />
      <BadgeConfettiPopup />
      {/* Onboarding tour — auto-opens on first club join, or replayable from
          the account menu via the `open-onboarding-tour` window event. */}
      <OnboardingTour />
      {/* Executive introduction guide — the dedicated admin walkthrough
          (branding, invites, approvals, oversight…). Auto-opens once per
          executive club per browser (after the handbook is acknowledged,
          which also covers club creation and mid-session promotions), and
          replayable anytime via the `open-admin-tour` window event from
          Settings → Security. Executives only — so the ~100KB chunk is
          gated on the role: regular members never download it. */}
      {currentClub?.role === "executive" && <AdminTour />}
      {/* Executive Admin Handbook — the one-time acknowledgment popup for
          clubs the viewer runs that haven't confirmed it yet (typically the
          club they just created). Non-dismissible until confirmed. In REVIEW
          mode (opened from Settings → Security by an exec) the same content
          renders dismissibly so the guide can be re-read anytime. Only
          mounted when there's actually something to show — the modal's
          chunk stays unloaded otherwise. */}
      {(handbookReview || handbookDue) && (
        <ExecHandbookModal
          club={
            handbookReview ??
            (handbookDue ? { clubId: handbookDue.clubId, clubName: handbookDue.clubName } : null)
          }
          mode={handbookReview ? "review" : "acknowledge"}
          onConfirmed={handleHandbookConfirmed}
          onClose={() => setHandbookReview(null)}
        />
      )}
    </div>
  )
}

function Footer() {
  // Footer removed per user request
}

/** PWA install hint — shows an "Install ClubHub" button when the
 *  beforeinstallprompt event is available (Android Chrome), or iOS
 *  instructions on iOS Safari. Hidden when already installed. */
function InstallHint() {
  const [promptEvent, setPromptEvent] = useState<any>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [installed, setInstalled] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true
    if (isStandalone) { setInstalled(true); return }
    const ua = window.navigator.userAgent
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream)
    const handler = (e: Event) => { e.preventDefault(); setPromptEvent(e) }
    window.addEventListener("beforeinstallprompt", handler as EventListener)
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (installed) return null

  if (promptEvent) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Install ClubHub</p>
          <p className="text-xs text-muted-foreground">Add ClubHub to your home screen.</p>
        </div>
        <Button size="sm" variant="club" onClick={() => { promptEvent.prompt(); setPromptEvent(null) }}>Install</Button>
      </div>
    )
  }

  if (isIOS) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 mb-4">
        <p className="text-sm font-medium">Install ClubHub</p>
        <p className="text-xs text-muted-foreground mt-1">Tap <span className="font-medium">Share</span> in Safari, then <span className="font-medium">Add to Home Screen</span>.</p>
      </div>
    )
  }

  return null
}

/** Platform-aware ⌘K / Ctrl K hint for the desktop search trigger.
 *  Own component (its own hook) so AppShell's conditional branches don't
 *  have to care. The trigger only renders in the authenticated, client-side
 *  branch — never in SSR HTML — so there is no hydration mismatch. The label
 *  comes from the shared platform helper (Mac → ⌘K, Windows/Linux → Ctrl K,
 *  touch phones never see this trigger — it's desktop-only). */
function SearchShortcutHint() {
  const { label } = useSearchShortcutHint()
  // §Physical keycap — an opaque key resting on the pill: solid background
  // (not the translucent muted of the old inline hint), hairline border, and
  // a real two-stop elevation shadow so the cap reads as raised hardware.
  return (
    <kbd
      aria-hidden
      className="ml-1 shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium leading-none text-muted-foreground shadow-[0_1px_0_rgba(0,0,0,0.05),0_2px_3px_-1px_rgba(0,0,0,0.18)] dark:border-white/15 dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_2px_3px_-1px_rgba(0,0,0,0.5)]"
    >
      {label ?? "Ctrl K"}
    </kbd>
  )
}

/**
 * PullDownSheet — a bottom Sheet whose WHOLE CONTENT follows the finger
 * while dragging the grab handle, and springs back (or dismisses past the
 * threshold) on release. The previous implementation only translated the
 * little handle bar itself, which felt broken: the line moved but the sheet
 * stayed put until it suddenly closed.
 *
 * Implementation notes:
 *  - Pointer events with pointer capture keep the gesture tracking the
 *    finger even as the sheet (and handle) move under it.
 *  - The transform is applied to the SheetContent itself; while the radix
 *    enter/exit animations are CSS *animations* they take precedence over
 *    inline styles, so open/close transitions still play normally.
 *  - On release below the threshold, a 240ms spring-ease transition eases
 *    the sheet back to its resting position.
 */
function PullDownSheet({
  open,
  onOpenChange,
  trigger,
  ariaLabel,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  trigger?: React.ReactNode
  ariaLabel?: string
  className?: string
  children: React.ReactNode
}) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef<number | null>(null)

  function endDrag() {
    const shouldClose = dragY > 90
    setDragY(0)
    setDragging(false)
    startY.current = null
    if (shouldClose) onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        side="bottom"
        aria-label={ariaLabel}
        className={className}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          onPointerDown={(e) => {
            startY.current = e.clientY
            setDragging(true)
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (startY.current == null) return
            const dy = e.clientY - startY.current
            // Downward drag only; clamp so the sheet can't be flung
            // unreasonably far past the viewport.
            setDragY(Math.min(Math.max(0, dy), 480))
          }}
          onPointerUp={endDrag}
          onPointerCancel={() => {
            setDragY(0)
            setDragging(false)
            startY.current = null
          }}
          className="shrink-0 flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
          aria-label="Drag down to close"
        >
          <span className="h-1.5 w-10 rounded-full bg-muted-foreground/40" />
        </div>
        {children}
      </SheetContent>
    </Sheet>
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

  const tabs: { view: View; label: string; icon: any }[] = [
    { view: "dashboard", label: "Home", icon: LayoutDashboard },
    { view: "tasks", label: "Tasks", icon: CheckSquare },
    { view: "chat", label: "Chat", icon: MessageSquare },
    { view: "meetings", label: "Meetings", icon: CalendarDays },
  ]

  return (
    <>
      {/* PERF: no backdrop-blur — a blurred full-width bar re-rastered every
          frame while the notification/More sheet's overlay faded over it,
          which was a big part of the sheets' choppy opening on mobile. A
          nearly-opaque solid background looks the same for ~0 paint cost. */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-stretch justify-around border-t border-border/80 bg-background/95"
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
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 min-h-[52px] text-xs font-medium transition-[color,background-color,transform] active:scale-[0.96]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              {/* Active indicator — same recipe as the desktop sidebar: the
                  icon sits on a neutral secondary fill with club-ink glyphs,
                  and a short club-accent bar rides the tab's top edge (the
                  bottom-bar transpose of the sidebar's left-edge bar). No
                  saturated accent blob. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-club transition-opacity duration-150",
                  active ? "opacity-100" : "opacity-0"
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150",
                  active ? "bg-secondary/80 text-club-ink" : ""
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span>{t.label}</span>
            </button>
          )
        })}
        {/* More — opens the mobile drawer (full nav + club switcher + theme).
            PullDownSheet: the whole sheet follows the finger on drag. */}
        <PullDownSheet
          open={mobileNavOpen}
          onOpenChange={setMobileNavOpen}
          ariaLabel="More navigation"
          className="rounded-t-xl p-0 flex flex-col max-h-[80dvh] shadow-dialog"
          trigger={
            <button
              className="flex flex-col items-center justify-center gap-1 flex-1 py-1.5 min-h-[52px] text-xs font-medium text-muted-foreground hover:text-foreground transition-[color,transform,translate,scale,rotate] active:scale-95"
              aria-label="More"
            >
              <Menu className="h-5 w-5" />
              <span>More</span>
            </button>
          }
        >
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <MobileDrawerNav onPick={(v) => { setView(v); setMobileNavOpen(false) }} />
          </div>
        </PullDownSheet>
      </nav>
    </>
  )
}

/** Compact nav used inside the mobile "More" bottom-sheet.
 *  Filters out execOnly items for members (Approvals, Activity Log).
 *  The club switcher is pinned at the BOTTOM so it's thumb-reachable and
 *  visually separated from the nav list. */
function MobileDrawerNav({ onPick }: { onPick: (v: View) => void }) {
  const view = useAppStore((s) => s.view)
  const clubs = useAppStore((s) => s.clubs)
  const currentClub = useAppStore((s) => s.currentClub)
  const selectClub = useAppStore((s) => s.selectClub)
  const isExec = currentClub?.role === "executive"
  return (
    <div className="flex flex-col h-full">
      <nav className="flex flex-col gap-4 px-2.5 py-4 flex-1 overflow-y-auto scrollbar-thin" aria-label="More">
        {NAV_TIERS.map((tier) => {
          const items = tier.items.filter((n) => !n.execOnly || isExec)
          if (items.length === 0) return null
          return (
            <div key={tier.id} className="space-y-0.5">
              <div className="px-3 pb-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{tier.label}</div>
              {items.map((item) => {
              const Icon = item.icon
              const active = view === item.view
              return (
                <button
                  key={item.view}
                  onClick={() => onPick(item.view)}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md w-full h-11 px-3 text-left text-sm transition-[color,background-color,border-color,transform,translate,scale,rotate] active:scale-[0.98]",
                    active
                      ? "bg-secondary/80 font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      : "font-normal text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  {/* Same active recipe as the desktop sidebar: neutral fill
                      + left-edge accent bar + club-ink icon. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-club transition-opacity duration-150",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Icon className={cn("h-4 w-4", active && "text-club-ink")} />
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        )
      })}
      </nav>
      {/* Club switcher — pinned at the bottom of the "More" sheet, thumb-
          reachable, visually separated by a top border. */}
      <div className="border-t border-border px-2.5 pt-3 pb-4 shrink-0" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">Club</div>
        <ClubSwitcher
          clubs={clubs}
          currentClub={currentClub ?? null}
          onSelect={(id) => { selectClub(id); onPick("dashboard") }}
        />
      </div>
    </div>
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
          <span className="font-semibold text-foreground">
            {activeAward.badge.emoji} {activeAward.badge.name}
          </span>{" "}
          from {activeAward.awardedByName}
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
          <span className="text-sm font-semibold line-clamp-2 sm:truncate">
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
          {/* Hairline ghost at rest (transparent + hairline border, neutral
              fill only on hover/open) — the club's accent logo tile carries
              the color. */}
          <Button
            variant="ghost"
            className="w-full justify-between h-auto py-2.5 px-3 rounded-xl gap-3 border border-border/80 bg-transparent text-foreground hover:bg-secondary/60 hover:text-foreground dark:hover:bg-secondary/60 data-[state=open]:bg-secondary/70 dark:data-[state=open]:bg-secondary/70"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Club tile — the club's actual logo when one exists (kept in
                  sync via /api/me + patchCurrentClub), initials otherwise.
                  §Resilient: retries a transiently-dropped request once, then
                  clean initials — never the broken-image glyph. */}
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white text-sm font-bold shrink-0 overflow-hidden"
                style={{ backgroundColor: currentClub?.accentColor ?? "#10b981" }}
              >
                {currentClub ? (
                  <ResilientImage
                    src={currentClub.logoUrl}
                    alt={currentClub.clubName}
                    name={currentClub.clubName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "?"
                )}
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
        <DropdownMenuContent align="start" className="w-64 shadow-popover">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Clubs</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {clubs.map((c) => (
            <DropdownMenuItem key={c.clubId} onClick={() => onSelect(c.clubId)} className="cursor-pointer gap-2.5 py-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md text-white text-xs font-bold shrink-0 overflow-hidden"
                style={{ backgroundColor: c.accentColor }}
              >
                <ResilientImage
                  src={c.logoUrl}
                  alt={c.clubName}
                  name={c.clubName}
                  className="h-full w-full object-cover"
                />
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
  const [settingsTab, setSettingsTab] = useState<"profile" | "security" | "appearance">("profile")
  const [showJoin, setShowJoin] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const setClubs = useAppStore((s) => s.setClubs)
  const user = session?.user

  // Listen for the `open-settings` custom event so other surfaces (e.g. the
  // What's New modal's "Choose your effect" CTA) can open the dialog on a
  // specific tab. The event detail carries `{ tab: "..." }`. Also listen
  // for `close-settings` so the AppearanceTab can close the dialog before
  // opening the onboarding tour (otherwise the tour is buried behind the
  // modal).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: string } | undefined
      if (detail?.tab === "security" || detail?.tab === "profile" || detail?.tab === "appearance") {
        setSettingsTab(detail.tab)
      } else {
        setSettingsTab("profile")
      }
      setShowSettings(true)
    }
    const closeHandler = () => setShowSettings(false)
    window.addEventListener("open-settings", handler as EventListener)
    window.addEventListener("close-settings", closeHandler as EventListener)
    return () => {
      window.removeEventListener("open-settings", handler as EventListener)
      window.removeEventListener("close-settings", closeHandler as EventListener)
    }
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
              <DecoratedAvatar
                decoration={user?.avatarDecoration}
                src={user?.image ?? undefined}
                name={user?.name ?? ""}
                className="h-8 w-8"
                avatarClassName="text-xs"
              />
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ) : desktop ? (
            <button
              type="button"
              className="flex items-center gap-2.5 w-full rounded-md px-2 py-2 text-left hover:bg-accent transition-colors"
              aria-label="Account menu"
            >
              <DecoratedAvatar
                decoration={user?.avatarDecoration}
                src={user?.image ?? undefined}
                name={user?.name ?? ""}
                className="h-8 w-8"
                avatarClassName="text-xs"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{user?.name}</div>
                <div className="text-caption truncate">{user?.email}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ) : (
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <DecoratedAvatar
                decoration={user?.avatarDecoration}
                src={user?.image ?? undefined}
                name={user?.name ?? ""}
                className="h-8 w-8"
                avatarClassName="text-xs"
              />
            </Button>
          )}
        </DropdownMenuTrigger>
        {/* §Modern account menu — a refined identity header + grouped
            sections with micro tier labels, in the same language as the
            sidebar nav and the settings rail. Every item keeps its exact
            handler; only the presentation changed. */}
        <DropdownMenuContent align={compact ? "start" : "end"} className="w-64 shadow-popover">
          {/* Identity header — avatar + name/email riding a quiet card. */}
          <div className="flex items-center gap-3 px-2 pb-2 pt-2.5">
            <DecoratedAvatar
              decoration={user?.avatarDecoration}
              src={user?.image ?? undefined}
              name={user?.name ?? ""}
              className="h-9 w-9 shrink-0"
              avatarClassName="text-xs"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{user?.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <DropdownMenuSeparator />

          {/* CLUBS — membership actions */}
          <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            Clubs
          </div>
          <DropdownMenuItem onClick={() => setShowJoin(true)} className="cursor-pointer gap-2.5 rounded-lg py-2">
            <LogIn className="h-4 w-4 shrink-0 text-muted-foreground" /> Join a club
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowCreate(true)} className="cursor-pointer gap-2.5 rounded-lg py-2">
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" /> Create a club
          </DropdownMenuItem>

          {/* ACCOUNT */}
          <div className="px-2 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            Account
          </div>
          <DropdownMenuItem onClick={openSettingsFromMenu} className="cursor-pointer gap-2.5 rounded-lg py-2">
            <Settings className="h-4 w-4 shrink-0 text-muted-foreground" /> Account settings
          </DropdownMenuItem>

          {/* HELP */}
          <div className="px-2 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
            Help
          </div>
          <DropdownMenuItem
            onClick={() => window.dispatchEvent(new CustomEvent("open-onboarding-tour"))}
            className="cursor-pointer gap-2.5 rounded-lg py-2"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" /> Replay introduction guide
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.dispatchEvent(new CustomEvent(OPEN_KEYBOARD_SHORTCUTS_EVENT))}
            className="cursor-pointer gap-2.5 rounded-lg py-2"
          >
            <Keyboard className="h-4 w-4 shrink-0 text-muted-foreground" /> Keyboard shortcuts
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1.5" />
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/" })}
            className="cursor-pointer gap-2.5 rounded-lg py-2 text-danger-foreground focus:text-danger-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <JoinClubDialog open={showJoin} onOpenChange={setShowJoin} onJoined={(club) => landInClub(club?.id)} />
      <CreateClubDialog open={showCreate} onOpenChange={setShowCreate} onCreated={(club) => landInClub(club?.id)} />
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        tab={settingsTab}
        onTabChange={(t) => setSettingsTab(t as "profile" | "security" | "appearance")}
        isExec={useAppStore.getState().currentClub?.role === "executive"}
      />
    </>
  )
}

function JoinClubInline({ onJoined }: { onJoined: (club?: JoinedClubInfo) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* True ghost with a hairline ring — transparent at rest so the
          onboarding card's solid club primary keeps the hierarchy. */}
      <Button variant="ghost" className="border border-border" onClick={() => setOpen(true)}>
        Join a club
      </Button>
      <JoinClubDialog open={open} onOpenChange={setOpen} onJoined={onJoined} />
    </>
  )
}

/**
 * JoinClubDialog — the "room-code moment", redesigned as a two-segment
 * dialog:
 *
 *   1. "Join with a code": the club-code input is the hero (centered, mono,
 *      wide tracking) and the dialog live-detects the club from the public
 *      API — a spinner / ✓ club-name / "No club found" answer row appears
 *      right beneath it. Then BOTH paths together, split by a hairline "or":
 *        - primary   → club password → instant join (POST /api/clubs/join),
 *                      full-width emerald button
 *        - secondary → a calm request card (POST /api/join-requests) an
 *                      executive approves from Members → Join requests.
 *                      Optional 280-char note.
 *      A wrong password gently points at the request path instead of
 *      dead-ending.
 *   2. "Explore clubs": a live mini-directory of the public clubs (banner
 *      cards with join mode + member counts). Each card's "Join" pre-fills
 *      the code pane with that club's code; "View club" deep-links to the
 *      public profile (same /?public=<code> route the landing directory
 *      uses); the full landing-page directory stays one tap away as the
 *      quiet bottom action.
 *
 * The public club endpoints are unauthenticated and cheap — keyed + cached by
 * TanStack Query so re-typing a code doesn't spam the server.
 */
function JoinClubDialog({
  open, onOpenChange, onJoined, defaultClubCode,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Called with the club that was just joined so the caller can switch
   *  straight into it (instead of staying on the previously-open club). */
  onJoined: (club?: JoinedClubInfo) => void
  /** Optional prefilled code — used by the public-site join-intent flow so
   *  the visitor lands back on a dialog with the club they were viewing. */
  defaultClubCode?: string
}) {
  const [tab, setTab] = useState<"code" | "explore">("code")
  const [clubCode, setClubCode] = useState(defaultClubCode ?? "")
  const [clubPassword, setClubPassword] = useState("")
  const [message, setMessage] = useState("")
  const [joining, setJoining] = useState(false)
  const [requesting, setRequesting] = useState(false)
  /** Join-request success state — shows a confirmation instead of the form. */
  const [requested, setRequested] = useState(false)
  /** Set when a password join bounces, so we can gently point at the request
   *  path ("you can also send a join request") instead of a dead end. */
  const [pwFailed, setPwFailed] = useState(false)

  // Reset the transient state whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    Promise.resolve().then(() => {
      setRequested(false)
      setTab("code")
      setClubCode(defaultClubCode ?? "")
      setClubPassword("")
      setMessage("")
      setPwFailed(false)
    })
  }, [open])

  // Live club detection: once the typed code looks like a real code (≥4
  // chars), fetch the public club profile (public-safe, unauth'd) so the
  // club's name shows under the input before anything is submitted.
  const codeKey = clubCode.trim().toUpperCase()
  const {
    data: clubInfo,
    isLoading: clubInfoLoading,
    isError: clubInfoError,
  } = useQuery<{ club: { name: string } }>({
    queryKey: ["public-club-mini", codeKey],
    queryFn: () =>
      api<{ club: { name: string } }>(
        `/api/public/club/${encodeURIComponent(codeKey)}`,
      ),
    enabled: open && tab === "code" && codeKey.length >= 4,
    staleTime: 30_000,
    retry: 0,
  })
  const clubName = clubInfo?.club?.name

  // ── Path 1 (primary): club code + password → instant join ──────────────
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoining(true)
    setPwFailed(false)
    try {
      const res = await api<{ club: JoinedClubInfo }>("/api/clubs/join", {
        method: "POST",
        json: { clubCode: codeKey, clubPassword },
      })
      toast.success("Joined!")
      setClubCode("")
      setClubPassword("")
      setMessage("")
      onJoined(res.club)
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message)
      if (String(err?.message ?? "").toLowerCase().includes("wrong club password")) {
        setPwFailed(true)
      }
    } finally {
      setJoining(false)
    }
  }

  // ── Path 2 (secondary): no code? → join request an executive approves ──
  async function handleRequest() {
    setRequesting(true)
    try {
      await api("/api/join-requests", {
        method: "POST",
        json: { clubCode: codeKey, message: message.trim() || undefined },
      })
      toast.success("Request sent.")
      setRequested(true)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRequesting(false)
    }
  }

  // Explore-tab card "Join" → pre-fill the code pane with that club's code
  // (the live lookup then confirms the club name under the hero input).
  function pickCode(code: string) {
    setClubCode(code.toUpperCase())
    setPwFailed(false)
    setTab("code")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG_CLASS, "sm:max-w-md")} showCloseButton>
        {/* Mobile-padding wrapper — DIALOG_CLASS is `p-0` full-screen on
            mobile, so the dialog needs explicit padding there (same pattern
            as the settings dialog). On sm+ the dialog has sm:p-6 already. */}
        <div className="px-5 pt-5 pb-6 sm:px-0 sm:pt-0 sm:pb-0 flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Join a club</DialogTitle>
            <DialogDescription>
              Join with a code, or explore clubs.
            </DialogDescription>
          </DialogHeader>

          {/* Segmented tabs — a full-width pill control: two flex-1
              triggers, active = floating bg-background pill. */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "code" | "explore")}>
            <TabsList className="h-10 w-full rounded-full bg-muted p-1 ring-0 shadow-none">
              <TabsTrigger
                value="code"
                className="h-8 gap-1.5 rounded-full px-3 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <Link2 className="h-4 w-4" /> Join with a code
              </TabsTrigger>
              <TabsTrigger
                value="explore"
                className="h-8 gap-1.5 rounded-full px-3 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <Compass className="h-4 w-4" /> Explore clubs
              </TabsTrigger>
            </TabsList>

            {/* ── Tab 1: both join paths, split by a hairline "or" ── */}
            <TabsContent value="code" className="mt-4">
              {requested ? (
                /* Calm confirmation card — the request is in. */
                <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-muted/40 p-5 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Request sent</p>
                    <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                      You&apos;ll get a notification when it&apos;s approved.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Primary path — the room-code moment: club code +
                      password → instant join. */}
                  <form onSubmit={handleJoin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="join-club-code" className="text-sm font-medium">Club code</Label>
                      <Input
                        id="join-club-code"
                        value={clubCode}
                        onChange={(e) => {
                          setClubCode(e.target.value.toUpperCase())
                          setPwFailed(false)
                        }}
                        placeholder="AB3K9X"
                        maxLength={10}
                        className="h-11 text-center font-mono text-[17px] uppercase tracking-[0.2em]"
                        autoFocus
                      />
                      {/* Live answer row — spinner while looking it up, the
                          club's name once found, a quiet miss when not. */}
                      <div className="min-h-5" aria-live="polite">
                        {codeKey.length >= 4 && (
                          clubInfoLoading ? (
                            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              Looking it up…
                            </p>
                          ) : clubName ? (
                            <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
                              <Check className="h-4 w-4 shrink-0" aria-hidden />
                              {clubName}
                            </p>
                          ) : clubInfoError ? (
                            <p className="text-sm text-muted-foreground">No club found</p>
                          ) : null
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="join-club-password" className="text-sm font-medium">Club password</Label>
                      <Input
                        id="join-club-password"
                        type="password"
                        value={clubPassword}
                        onChange={(e) => {
                          setClubPassword(e.target.value)
                          setPwFailed(false)
                        }}
                        placeholder="••••••••"
                        className="h-11"
                      />
                      {pwFailed && (
                        <p className="text-sm leading-relaxed text-destructive">
                          That password didn&apos;t work. You can send a join request below.
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      disabled={joining || requesting}
                      className="h-11 w-full rounded-lg font-semibold"
                    >
                      {joining ? "Joining…" : "Join club"}
                    </Button>
                  </form>

                  {/* Hairline divider — "or". */}
                  <div className="flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">or</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>

                  {/* Secondary path — a calm request card: don't have the
                      code? Send a join request an executive approves. */}
                  <div className="space-y-3.5 rounded-xl border border-border/60 bg-muted/40 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UserPlus className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Don&apos;t have the code?</p>
                        <p className="text-sm text-muted-foreground">
                          An executive reviews it and lets you in.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="join-request-note" className="text-xs font-medium text-muted-foreground">
                        Note to the executives (optional)
                      </Label>
                      <Textarea
                        id="join-request-note"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="e.g. I'd love to help at events!"
                        rows={3}
                        maxLength={280}
                        className="resize-none bg-background"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-input bg-background hover:bg-accent"
                      disabled={requesting || joining || codeKey.length < 4}
                      onClick={handleRequest}
                    >
                      {requesting ? "Sending…" : "Send join request"}
                    </Button>
                    {codeKey.length < 4 && (
                      <p className="text-sm text-muted-foreground/80">
                        Enter the club code above first.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Tab 2: explore clubs → live mini-directory ── */}
            <TabsContent value="explore" className="mt-4">
              <ExploreClubsRedirect
                onExplore={() => onOpenChange(false)}
                onPickCode={pickCode}
              />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Explore clubs" tab panel — a live mini-directory of the public clubs
 * (GET /api/public/clubs): banner-first cards with member counts, join-mode
 * chips, a club-accent "Join" button that pre-fills the code pane with that
 * club's code, and a "View club" deep link to the public profile (the same
 * /?public=<code> route the landing page directory uses). The FULL browsing
 * experience still lives on the landing page — kept one tap away as the
 * quiet "Browse the full directory" action at the bottom.
 *
 * Only fetched while the tab is mounted (TabsContent unmounts inactive tabs
 * by default in Radix, so the query is naturally gated).
 */
function ExploreClubsRedirect({
  onExplore,
  onPickCode,
}: {
  /** Closes the join dialog before navigating away. */
  onExplore: () => void
  /** Pre-fills the code pane with a club's code (the card "Join" buttons). */
  onPickCode: (code: string) => void
}) {
  const router = useRouter()
  const { data, isLoading, isError } = useQuery<{ clubs: PublicClubMini[] }>({
    queryKey: ["public-clubs"],
    queryFn: () => api<{ clubs: PublicClubMini[] }>("/api/public/clubs"),
    staleTime: 60_000,
    retry: 1,
  })

  const clubs = data?.clubs ?? []

  return (
    <div className="space-y-3">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading clubs…
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-border/70 bg-card px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load the directory right now.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Try the full directory below.
          </p>
        </div>
      )}
      {clubs.map((club) => (
        <ExploreClubCard key={club.clubCode} club={club} onPickCode={onPickCode} />
      ))}
      {!isLoading && !isError && clubs.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No public clubs yet — check back soon.
        </p>
      )}
      {/* Secondary action — the full landing-page directory (photos, search,
          join info) stays one tap away. */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        onClick={() => {
          onExplore()
          router.push("/?landing=1")
        }}
      >
        <Compass className="h-4 w-4" />
        Browse the full directory
      </Button>
    </div>
  )
}

/** One club card in the explore mini-directory — banner-first, quiet body,
 *  join-mode chip, club-accent "Join" + public-profile deep link. */
function ExploreClubCard({
  club,
  onPickCode,
}: {
  club: PublicClubMini
  onPickCode: (code: string) => void
}) {
  // Same focal-point handling the landing directory uses for banners.
  const focalPct = Math.round((club.bannerFocalY ?? 0.5) * 100)
  const needsApproval = club.joinMode === "request"

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      {/* Banner — real club banner where set (with its focal point), quiet
          accent-wash fallback when there isn't one. */}
      <div className="relative h-28 w-full overflow-hidden bg-muted">
        {club.bannerUrl ? (
          <img
            src={club.bannerUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `center ${focalPct}%` }}
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(club.accentColor, 0.32)} 0%, ${hexToRgba(club.accentColor, 0.08)} 100%)`,
            }}
          />
        )}
      </div>
      <div className="p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{club.name}</p>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        <p className="mt-1 line-clamp-2 min-h-[2.4rem] text-sm leading-snug text-muted-foreground">
          {club.description ?? "A ClubHub club."}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {needsApproval ? (
              <UserCheck className="h-3 w-3" aria-hidden />
            ) : (
              <KeyRound className="h-3 w-3" aria-hidden />
            )}
            {needsApproval ? "Approval" : "Code"}
          </span>
          <div className="flex items-center gap-3">
            <Link
              href={`/?public=${encodeURIComponent(club.clubCode)}`}
              prefetch={false}
              className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              View club
            </Link>
            <button
              type="button"
              onClick={() => onPickCode(club.clubCode)}
              className="inline-flex h-7 shrink-0 items-center rounded-md px-3 text-xs font-semibold shadow-sm transition-[filter,transform] duration-150 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]"
              style={{ backgroundColor: club.accentColor, color: readableForeground(club.accentColor) }}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* Local color helpers (the landing page and public profile keep their own
 * copies — duplicated here on purpose so this dialog doesn't pull their
 * client-provider import graphs). */
function readableForeground(hex: string): string {
  let c = hex.replace("#", "").trim()
  if (c.length === 3) c = c.split("").map((x) => x + x).join("")
  if (c.length !== 6) return "#ffffff"
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.55 ? "#1a1a1a" : "#ffffff"
}

function hexToRgba(hex: string, alpha: number): string {
  let c = hex.replace("#", "").trim()
  if (c.length === 3) c = c.split("").map((x) => x + x).join("")
  if (c.length !== 6) return `rgba(16,185,129,${alpha})`
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/* ══════════════════════════════════════════════════════════════════════════
   Settings — iOS/macOS System Settings style dialog

   Two-pane on desktop (left rail + scrolling content pane, fixed ~640px
   height) and a true iOS drill-down on mobile (root list → pushed pane with
   a back header). The pane BODY renders once, shared by both layouts, so
   in-progress edits survive pane switches.
   ══════════════════════════════════════════════════════════════════════════ */

/** The settings dialog's sections — drives the desktop rail, the mobile
 *  root list, and the pane headers. Order matters (it's the nav order). */
type SettingsPaneId = "profile" | "security" | "appearance"

const SETTINGS_PANES: {
  id: SettingsPaneId
  label: string
  sub: string
  description: string
  icon: any
}[] = [
  { id: "profile", label: "Profile", sub: "Name, avatar, bio", description: "How you appear across ClubHub.", icon: User },
  { id: "appearance", label: "Appearance", sub: "Theme, color, background", description: "Personalize the look of the app.", icon: Palette },
  { id: "security", label: "Security", sub: "Password", description: "Keep your account safe.", icon: ShieldCheck },
]

/** Micro uppercase tier label above each grouped inset list. */
const SETTINGS_TIER = "mb-2 px-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground"

/** iOS-style switch — the small toggle used in the settings rail footer,
 *  the mobile root list, and the appearance pane. Presentational only. */
function IosSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-200",
          checked && "translate-x-4"
        )}
      />
    </button>
  )
}

function SettingsDialog({
  open, onOpenChange, tab, onTabChange, isExec,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tab: "profile" | "security" | "appearance"
  onTabChange: (v: "profile" | "security" | "appearance") => void
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
  // §Outer effects in settings — Discord-style avatar decoration picker.
  // Selected tile saves instantly via PATCH /api/me { avatarDecoration }
  // (same pipeline as the onboarding tour) + session.update() so the header /
  // account-menu avatar picks up the effect without a reload.
  const [decoration, setDecoration] = useState<DecorationId>(() =>
    toDecorationId(session?.user?.avatarDecoration)
  )
  const [decoSaving, setDecoSaving] = useState(false)
  const setClubs = useAppStore((s) => s.setClubs)
  const avatarFileRef = useRef<HTMLInputElement>(null)

  // ── iOS drill-down state ──
  // "root" = the mobile settings list; a pane id = drilled into that pane.
  // Desktop never shows "root" — it falls back to the external `tab`.
  const [pane, setPane] = useState<"root" | SettingsPaneId>("root")

  // Fresh open → back to the root list (the mobile drill-down entry point).
  useEffect(() => {
    if (open) setPane("root")
  }, [open])

  // External tab moves while the dialog is open (the `open-settings` event
  // can retarget the dialog — e.g. the What's New "choose your effect" CTA)
  // → drill straight to that pane. Our own navigation pushes onTabChange
  // first, so this echo is a no-op then — both directions stay in sync.
  useEffect(() => {
    if (open) setPane(tab)
  }, [tab])

  const activePane: SettingsPaneId = pane === "root" ? tab : pane
  const activeMeta = SETTINGS_PANES.find((p) => p.id === activePane) ?? SETTINGS_PANES[0]

  function goTo(next: SettingsPaneId) {
    setPane(next)
    onTabChange(next) // keep the external tab prop in sync
  }

  // Re-sync the picker with the freshest session value every time the dialog
  // opens (the initial useState may have run before the session hydrated, and
  // the onboarding tour can change the effect while settings are closed).
  useEffect(() => {
    if (open) setDecoration(toDecorationId(session?.user?.avatarDecoration))
  }, [open, session?.user?.avatarDecoration])

  async function selectDecoration(id: DecorationId) {
    if (id === decoration || decoSaving) return
    const prev = decoration
    setDecoration(id) // optimistic — the preview flips instantly
    setDecoSaving(true)
    try {
      await api("/api/me", { method: "PATCH", json: { avatarDecoration: id } })
      // Refresh the session so the header/account-menu avatar updates live.
      await update({ avatarDecoration: id })
      toast.success(`Avatar effect: ${DECORATION_LABELS[id]}`)
    } catch (err: any) {
      setDecoration(prev) // revert the optimistic flip
      toast.error(err?.message || "Couldn't save your avatar effect")
    } finally {
      setDecoSaving(false)
    }
  }

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
      <DialogContent
        className={cn(
          DIALOG_CLASS,
          // Two-pane shell: full-height sheet on mobile (the drill-down),
          // fixed-height 720px modal on desktop with internal scrolling.
          "gap-0 overflow-hidden p-0 sm:max-w-[720px] sm:h-[640px] sm:max-h-[80dvh] sm:rounded-xl sm:p-0 sm:gap-0 sm:overflow-hidden sm:shadow-dialog sm:flex-row"
        )}
        showCloseButton={false}
      >
        {/* Screen-reader-only dialog title/description — the visible pane
            headers below are plain headings, so both the desktop two-pane
            and the mobile drill-down keep exactly one accessible name. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Account settings</DialogTitle>
          <DialogDescription>Update your profile, appearance, and password.</DialogDescription>
        </DialogHeader>

        {/* The visible shell — rail + content on desktop, root/pushed panes
            on mobile. The pane BODY renders once (shared by both layouts)
            so profile/security drafts survive pane switches. */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* ═══ Left rail (desktop only) — identity, sections, theme ═══ */}
          <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-muted/30 sm:flex">
            {/* Identity header */}
            <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
              <DecoratedAvatar
                decoration={session?.user?.avatarDecoration}
                src={session?.user?.image ?? undefined}
                name={session?.user?.name ?? ""}
                className="h-10 w-10 shrink-0"
                avatarClassName="text-xs"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{session?.user?.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{session?.user?.email}</p>
              </div>
            </div>
            {/* Section nav — the Linear-style active row the app sidebar
                uses: neutral secondary fill, 3px club-accent bar on the left
                edge, foreground label, club-ink icon. */}
            <nav className="flex-1 overflow-y-auto p-2" aria-label="Settings sections">
              {SETTINGS_PANES.map((p) => {
                const Icon = p.icon
                const active = activePane === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => goTo(p.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      active ? "bg-secondary/80" : "hover:bg-secondary/50"
                    )}
                  >
                    {active && (
                      <span aria-hidden className="absolute -left-2 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-full bg-club" />
                    )}
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-club-ink" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm leading-tight", active ? "font-medium text-foreground" : "text-foreground/90")}>{p.label}</span>
                      <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">{p.sub}</span>
                    </span>
                  </button>
                )
              })}
            </nav>
            {/* Rail footer — quick light/dark toggle (iOS switch). */}
            <div className="border-t border-border/70 p-2">
              <div className="flex h-11 items-center gap-2.5 rounded-lg px-3">
                {theme === "dark" ? (
                  <Moon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <Sun className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="flex-1 truncate text-sm">{theme === "dark" ? "Dark mode" : "Light mode"}</span>
                <IosSwitch
                  checked={theme === "dark"}
                  onChange={(v) => setTheme(v ? "dark" : "light")}
                  label="Toggle dark mode"
                />
              </div>
            </div>
          </aside>

          {/* ═══ Mobile root — the iOS settings list ═══ */}
          {pane === "root" ? (
            <div key="settings-mobile-root" className="flex min-h-0 flex-1 animate-in flex-col slide-in-from-left duration-200 sm:hidden">
              <div
                className="flex shrink-0 items-center justify-between border-b border-border/70 px-4"
                style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
              >
                <span className="text-base font-semibold">Settings</span>
                <DialogClose asChild>
                  <button
                    type="button"
                    aria-label="Close settings"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DialogClose>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {/* Identity card */}
                <div className="flex items-center gap-3.5 rounded-2xl border border-border/70 bg-card px-4 py-3.5">
                  <DecoratedAvatar
                    decoration={session?.user?.avatarDecoration}
                    src={session?.user?.image ?? undefined}
                    name={session?.user?.name ?? ""}
                    className="h-12 w-12 shrink-0"
                    avatarClassName="text-sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">{session?.user?.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{session?.user?.email}</p>
                  </div>
                </div>
                {/* Section list — iOS inset grouped rows with chevrons. */}
                <div className="mt-4 overflow-hidden rounded-2xl border border-border/70 bg-card">
                  {SETTINGS_PANES.map((p, i) => {
                    const Icon = p.icon
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goTo(p.id)}
                        className={cn(
                          "flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                          i > 0 && "border-t border-border/60"
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-tight">{p.label}</span>
                          <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">{p.sub}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                      </button>
                    )
                  })}
                </div>
                {/* Theme quick toggle — same switch as the desktop rail. */}
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/70 bg-card px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {theme === "dark" ? (
                      <Moon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <Sun className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="truncate text-sm font-medium">{theme === "dark" ? "Dark mode" : "Light mode"}</span>
                  </div>
                  <IosSwitch
                    checked={theme === "dark"}
                    onChange={(v) => setTheme(v ? "dark" : "light")}
                    label="Toggle dark mode"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* ═══ Content pane — always on desktop, pushed on mobile ═══ */}
          {/* NO key on this div — a keyed remount here previously COLLIDED
              with the mobile root's key (both were "root" when pane was
              "root"), which made React's reconciler keep the stale root
              node alive while mounting the drilled pane next to it — the
              panes stacked (½ screen, then ⅓…) on every tap. One persistent
              instance also preserves scroll position across pane switches. */}
          <div
            className={cn(
              "flex min-h-0 flex-1 animate-in flex-col slide-in-from-right duration-200 sm:animate-none",
              pane === "root" ? "hidden sm:flex" : "flex"
            )}
          >
            {/* Desktop pane header — title + one-line description + close. */}
            <div className="hidden shrink-0 items-start justify-between gap-4 px-7 pb-4 pt-6 sm:flex">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">{activeMeta.label}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{activeMeta.description}</p>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="Close settings"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogClose>
            </div>

            {/* Mobile back header — iOS drill-down chrome. */}
            <div
              className="relative flex shrink-0 items-center border-b border-border/70 px-2 sm:hidden"
              style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
            >
              <button
                type="button"
                onClick={() => setPane("root")}
                className="flex h-9 items-center gap-1 rounded-lg pl-2 pr-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Settings
              </button>
              <span className="pointer-events-none absolute inset-x-0 truncate px-16 text-center text-base font-semibold">
                {activeMeta.label}
              </span>
            </div>

            {/* Scrollable pane body — grouped inset lists. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-8 sm:px-7 sm:pb-7 sm:pt-0">
              {activePane === "profile" ? (
                <div className="space-y-6">
                  {/* Install ClubHub hint (PWA) */}
                  <InstallHint />

                  {/* ── Account ── */}
                  <section>
                    <p className={SETTINGS_TIER}>Account</p>
                    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
                      <div className="px-4 py-3">
                        <Label htmlFor="settings-name" className="text-sm font-medium">Display name</Label>
                        <Input
                          id="settings-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={80}
                          className="mt-1.5"
                        />
                      </div>
                      <div className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <Label htmlFor="settings-bio" className="text-sm font-medium">Bio</Label>
                          <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                            {bio.length}/500
                          </span>
                        </div>
                        <Textarea
                          id="settings-bio"
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={3}
                          maxLength={500}
                          className="mt-1.5 resize-none"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button onClick={saveProfile} disabled={loading} className="rounded-full px-5">
                        {loading ? "Saving…" : "Save profile"}
                      </Button>
                    </div>
                  </section>

                  {/* ── Avatar (upload + drag-drop + crop) ── */}
                  <section>
                    <p className={SETTINGS_TIER}>Avatar</p>
                    {/* §44 — the whole card is the drop zone; the dashed
                        accent ring + tint appear only while dragging. */}
                    <div
                      className={cn(
                        "rounded-2xl border border-border/70 bg-card transition-colors",
                        avatarDragging && "border-2 border-dashed border-club bg-club-muted/20"
                      )}
                      onDragOver={onAvatarDragOver}
                      onDragLeave={onAvatarDragLeave}
                      onDrop={onAvatarDrop}
                    >
                      <div className="flex items-center gap-4 px-4 py-3.5">
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
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                      <p className="px-4 pb-3.5 text-xs text-muted-foreground">PNG, JPG, or WebP.</p>
                    </div>
                  </section>

                  {/* ── Avatar effect — same decoration picker as the
                      onboarding tour, reachable anytime from settings.
                      Circular previews; the selection saves instantly (no
                      "Save profile" needed). ── */}
                  <section>
                    <div className="flex items-center justify-between">
                      <p className={SETTINGS_TIER}>Avatar effect</p>
                      {decoSaving && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…
                        </span>
                      )}
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-card px-4 py-4">
                      <div className="flex items-center gap-3.5">
                        {/* key on decoration → the soft pop replays on change */}
                        <DecoratedAvatar
                          key={decoration}
                          decoration={decoration}
                          src={avatarUrl || null}
                          name={name || session?.user?.name || "You"}
                          className="ch-tour-pop h-12 w-12 shrink-0"
                          avatarClassName="border-2 border-card shadow-card"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight text-foreground">
                            {DECORATION_LABELS[decoration]}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            Tap a frame to wear it everywhere.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        {DECORATION_IDS.map((id) => {
                          const active = decoration === id
                          return (
                            <button
                              key={id}
                              type="button"
                              aria-pressed={active}
                              aria-label={`Avatar effect: ${DECORATION_LABELS[id]}`}
                              disabled={decoSaving}
                              onClick={() => selectDecoration(id)}
                              className={cn(
                                "relative flex h-14 w-14 items-center justify-center rounded-full transition-[box-shadow,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60",
                                active
                                  ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                                  : "ring-1 ring-border/70 hover:ring-primary/40"
                              )}
                            >
                              <DecoratedAvatar
                                decoration={id}
                                src={avatarUrl || null}
                                name={name || session?.user?.name || "You"}
                                className="h-10 w-10"
                                avatarClassName="border-2 border-card"
                              />
                              {active && (
                                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </section>

                  {/* ── Danger zone (leave / delete this club) ── */}
                  <DangerZoneSection isExec={isExec} />
                </div>
              ) : activePane === "appearance" ? (
                <AppearancePane />
              ) : (
                <div className="space-y-6">
                  {/* ── Password ── */}
                  <section>
                    <p className={SETTINGS_TIER}>Password</p>
                    <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
                      <div className="px-4 py-3">
                        <Label htmlFor="settings-current-password" className="text-sm font-medium">Current password</Label>
                        <Input
                          id="settings-current-password"
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Current password"
                          autoComplete="current-password"
                          className="mt-1.5"
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Needed only if you already have a password.
                        </p>
                      </div>
                      <div className="px-4 py-3">
                        <Label htmlFor="settings-new-password" className="text-sm font-medium">New password</Label>
                        <Input
                          id="settings-new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="New password (8+ chars, letter + number)"
                          autoComplete="new-password"
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button onClick={changePassword} disabled={loading} className="rounded-full px-5">
                        {loading ? "Saving…" : "Change password"}
                      </Button>
                    </div>
                  </section>

                  {/* ── For executives (execs of this club only) ── */}
                  {isExec && (
                    <section>
                      <p className={SETTINGS_TIER}>For executives</p>
                      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
                        {/* Executive Admin Handbook — the one-time
                            acknowledgment popup is gone once confirmed, but
                            the guide itself stays available here: clicking
                            closes Settings and re-opens the handbook in
                            dismissible REVIEW mode (same content +
                            Google-Docs link). */}
                        <button
                          type="button"
                          onClick={() => {
                            // Same hand-off the "Replay introduction guide"
                            // button uses: close Settings first, then open the
                            // overlay — never stack a fixed modal on a Radix
                            // dialog.
                            window.dispatchEvent(new CustomEvent("close-settings"))
                            window.dispatchEvent(new CustomEvent("open-exec-handbook"))
                          }}
                          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            <BookOpenCheck className="h-5 w-5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-tight">Executive Admin Handbook</span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Your guide to running the club.</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                        </button>
                        {/* Executive introduction guide — the full admin
                            walkthrough (branding, invites, approvals,
                            day-to-day running, records, oversight). It
                            auto-shows once per club; this is the "do the
                            introduction again" row. Same close-settings
                            hand-off as the handbook. */}
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent("close-settings"))
                            setTimeout(
                              () => window.dispatchEvent(new CustomEvent("open-admin-tour")),
                              50
                            )
                          }}
                          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-club-muted text-club">
                            <GraduationCap className="h-5 w-5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-tight">Executive introduction guide</span>
                            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">Every admin power in eight quick stops.</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
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
 * AppearancePane — user-level visual personalization (absorbs the old
 * AppearanceTab). Color mode, theme color (with an "override club color"
 * switch), ambient background effect + intensity, plus the replay-intro and
 * reset actions. All changes apply live (the CustomizationProvider in the
 * layout reads the same store).
 */
function AppearancePane() {
  const ambient = useCustomizationStore((s) => s.ambient)
  const setAmbient = useCustomizationStore((s) => s.setAmbient)
  const themeColor = useCustomizationStore((s) => s.themeColor)
  const setThemeColor = useCustomizationStore((s) => s.setThemeColor)
  const override = useCustomizationStore((s) => s.overrideThemeColor)
  const setOverride = useCustomizationStore((s) => s.setOverrideThemeColor)
  const intensity = useCustomizationStore((s) => s.ambientIntensity)
  const setIntensity = useCustomizationStore((s) => s.setAmbientIntensity)
  const reset = useCustomizationStore((s) => s.reset)
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-6">
      {/* ── Color mode — segmented control ── */}
      <section>
        <p className={SETTINGS_TIER}>Color mode</p>
        <div className="rounded-2xl border border-border/70 bg-card p-2">
          <div className="flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Color mode">
            <button
              type="button"
              role="radio"
              aria-checked={theme !== "dark"}
              onClick={() => setTheme("light")}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-sm transition-[background-color,box-shadow,color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                theme !== "dark"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Sun className="h-4 w-4" aria-hidden /> Light
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={theme === "dark"}
              onClick={() => setTheme("dark")}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-sm transition-[background-color,box-shadow,color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                theme === "dark"
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Moon className="h-4 w-4" aria-hidden /> Dark
            </button>
          </div>
        </div>
      </section>

      {/* ── Theme color ── */}
      <section>
        <p className={SETTINGS_TIER}>Theme color</p>
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Override club color</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Use your own accent in every club.</p>
            </div>
            <IosSwitch checked={override} onChange={setOverride} label="Override club color" />
          </div>
          <div className="px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              {THEME_COLOR_PRESETS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setThemeColor(c.hex)}
                  aria-label={`Theme color ${c.label}`}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 border-card transition-[transform,box-shadow] duration-150 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    themeColor.toLowerCase() === c.hex.toLowerCase() && override &&
                      "ring-2 ring-primary ring-offset-2 ring-offset-card"
                  )}
                  style={{ background: c.hex }}
                />
              ))}
              <label
                className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border transition-colors hover:bg-accent/40"
                title="Pick a custom color"
              >
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <Palette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </label>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {override
                ? "Your color overrides the club's accent."
                : "Each club's own accent is used."}
            </p>
          </div>
        </div>
      </section>

      {/* ── Background effect — live mini previews ── */}
      <section>
        <p className={SETTINGS_TIER}>Background effect</p>
        <div className="rounded-2xl border border-border/70 bg-card p-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {AMBIENT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setAmbient(p.id)}
                aria-pressed={ambient === p.id}
                className={cn(
                  "group flex flex-col gap-1.5 rounded-xl border p-2 text-center transition-[border-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  ambient === p.id
                    ? "border-primary/60 ring-2 ring-primary"
                    : "border-border/70 hover:border-primary/30"
                )}
              >
                {/* Live mini preview — the same tile the onboarding tour
                    uses, so you SEE the effect you're picking. */}
                <AmbientPreviewMini effect={p.id} active={ambient === p.id} />
                <span className={cn("text-xs font-medium", ambient === p.id ? "text-primary" : "text-foreground")}>
                  {p.label}
                </span>
              </button>
            ))}
          </div>
          {ambient !== "none" && (
            <div className="mt-3 space-y-2 px-1">
              <p className="text-xs text-muted-foreground">
                {AMBIENT_PRESETS.find((p) => p.id === ambient)?.description}
              </p>
              {/* Intensity slider — only when an effect is active */}
              <div className="flex items-center gap-3">
                <span className="shrink-0 text-xs font-medium">Intensity</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value, 10))}
                  className="h-1.5 flex-1 accent-club"
                  aria-label="Effect intensity"
                />
                <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{intensity}%</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Quiet actions — replay the intro guide, reset ── */}
      <section>
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
          <button
            type="button"
            onClick={() => {
              // Close the settings dialog first, then open the tour, so the
              // tour isn't buried behind the modal.
              window.dispatchEvent(new CustomEvent("close-settings"))
              setTimeout(() => window.dispatchEvent(new CustomEvent("open-onboarding-tour")), 50)
            }}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          >
            <Sparkles className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-medium">Replay introduction guide</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              reset()
              toast.success("Appearance reset.")
            }}
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          >
            <RefreshCw className="h-4.5 w-4.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 text-sm font-medium">Reset to defaults</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
          </button>
        </div>
      </section>
    </div>
  )
}

/**
 * Danger Zone — the bottom group of the Profile pane. Groups the two
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
      toast.error("Enter the club password first.")
      return
    }
    setDeleting(true)
    try {
      await api(`/api/clubs/${clubId}`, {
        method: "DELETE",
        json: { confirmPassword: deletePassword },
      })
      toast.success(`Club "${clubName}" deleted.`)
      setDeleteOpen(false)
      setTimeout(() => window.location.reload(), 500)
    } catch (e: any) {
      toast.error(e.message || "Failed to delete club")
      setDeleting(false)
    }
  }

  return (
    <section>
      <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-widest text-danger-foreground/80">
        Danger zone
      </p>
      <div className="divide-y divide-danger/20 rounded-2xl border border-danger/30 bg-danger-subtle/40 dark:border-danger/40">
        {/* Leave — quiet destructive row. */}
        <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Leave this club</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You can rejoin later with the club code.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-danger/40 text-danger-foreground hover:bg-danger-subtle hover:text-danger-foreground dark:border-danger/30"
            onClick={() => setLeaveOpen(true)}
          >
            <LogOut className="h-4 w-4" /> Leave club
          </Button>
        </div>

        {/* Delete — exec-only, the quietest row (a quiet link that only
            turns destructive on hover), with the password confirmation
            dialog unchanged. */}
        {isExec && (
          <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Delete this club</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Permanently removes &quot;{clubName}&quot; and all of its data.
              </p>
            </div>
            <AlertDialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeletePassword("") }}>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground/80 underline-offset-2 transition-colors hover:text-danger-foreground hover:underline"
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
                    This permanently deletes everything. Enter the club password to confirm.
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
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground/80">These actions can&apos;t be undone.</p>

      {/* Leave confirm */}
      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this club?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll lose access immediately. If you&apos;re the only executive,
              promote another member first. You can rejoin later with the club code.
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
    </section>
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
  // Local release-notes notification (filed when the What's New modal is
  // closed). Clicking it re-opens the modal instead of navigating.
  const { notif: releaseNotif, dismiss: dismissReleaseNotif } = useWhatsNewNotif()

  // §Dwell-read sequence guard — a stale 20s poll resolving AFTER an
  // optimistic mutation (mark-all / clear / single read / dwell-read) used
  // to clobber the fresh state and resurrect the unread badge. Every
  // optimistic mutator bumps the sequence; refresh only applies its result
  // when the sequence hasn't moved since its request started.
  const seqRef = useRef(0)
  const bumpSeq = useCallback(() => { seqRef.current += 1 }, [])

  const refresh = useCallback(async () => {
    const seq = seqRef.current
    try {
      const data = await api<NotifListResponse>("/api/notifications?pageSize=10")
      if (seqRef.current !== seq) return // superseded by a local mutation
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      /* noop — silent failure for the bell preview */
    }
  }, [])

  // §Dwell-read — iOS behavior: when the bell stays open for a beat
  // (~1.2s), everything you're looking at flips to read and the badge
  // clears while you watch — no click required. Re-arms on every open.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (unread <= 0) return
      bumpSeq()
      setItems((prev) => prev.map((i) => ({ ...i, isRead: true })))
      setUnread(0)
      api("/api/notifications/read-all", { method: "POST" }).catch(() => {
        // Re-fetch on failure so we don't lie about state.
        refresh()
      })
    }, 1200)
    return () => clearTimeout(t)
  }, [open, unread, bumpSeq, refresh])

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
    bumpSeq()
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
    bumpSeq()
    // Optimistic — empty the list + reset the unread badge immediately.
    const prevItems = items
    setItems([])
    setUnread(0)
    // The local release-notes notification clears with everything else.
    dismissReleaseNotif()
    try {
      await api("/api/notifications", { method: "DELETE" })
      toast.success("Notifications cleared")
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
    bumpSeq()
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
    // The local release-notes row re-opens the What's New modal.
    if (n.type === "release_notes") {
      openWhatsNew()
      setOpen(false)
      return
    }
    const { view } = targetViewFor(n)
    if (!n.isRead) markRead(n.id)
    setView(view)
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
      releaseNotif={releaseNotif}
      onMarkAllRead={markAllRead}
      onClearAll={clearAll}
      onMarkRead={markRead}
      onNotifClick={handleNotifClick}
      onViewAll={viewAll}
    />
  )

  const isMobile = useIsMobile()

  if (isMobile) {
    // Mobile: full-width bottom Sheet that slides up from the bottom. The
    // anchored Popover is too cramped at 360–428px and its hover-only mark-read
    // affordance is unreachable on touch. PullDownSheet makes the whole sheet
    // follow the drag gesture (not just the handle).
    return (
      <PullDownSheet
        open={open}
        onOpenChange={(o) => { setOpen(o); if (o) refresh() }}
        ariaLabel="Recent notifications"
        className="p-0 gap-0 max-h-[90dvh] flex flex-col rounded-t-xl shadow-dialog"
        trigger={triggerButton}
      >
        {body}
      </PullDownSheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) refresh() }}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] max-w-[calc(100vw-1.5rem)] p-0 shadow-popover"
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
  releaseNotif,
  onMarkAllRead,
  onClearAll,
  onMarkRead,
  onNotifClick,
  onViewAll,
}: {
  items: NotifItem[]
  newItems: NotifItem[]
  earlierItems: NotifItem[]
  unread: number
  markingAll: boolean
  clearingAll: boolean
  releaseNotif: NotifItem | null
  onMarkAllRead: () => void
  onClearAll: () => void
  onMarkRead: (id: string) => void
  onNotifClick: (n: NotifItem) => void
  onViewAll: () => void
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
      {items.length === 0 && !releaseNotif ? (
        <div className="px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Bell className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-caption text-muted-foreground mt-1 max-w-[240px] mx-auto">
            Club activity shows up here.
          </p>
        </div>
      ) : (
        <div className="max-h-[264px] overflow-y-auto scrollbar-thin">
          <div aria-label="Recent notifications">
            {/* Pinned local release-notes row — re-opens the What's New
                modal on click. Always first, above any unread items. */}
            {releaseNotif && (
              <NotifSection label={`ClubHub v${APP_VERSION}`}>
                <NotifRow
                  n={releaseNotif}
                  onClick={() => onNotifClick(releaseNotif)}
                  onMarkRead={() => undefined}
                />
              </NotifSection>
            )}
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
      <div className="px-3 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
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
