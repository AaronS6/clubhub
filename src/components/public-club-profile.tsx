"use client"

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { api } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Avatar, AvatarFallback, AvatarImage,
} from "@/components/ui/avatar"
import {
  Users, Clock, CalendarDays, ArrowLeft, AlertCircle, Hash,
  UserPlus, LogIn, X, Compass, KeyRound, UserCheck, Loader2,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { initials } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"

/**
 * ============================================================================
 * PublicClubProfile — the public "expanded club view" (`/?public=<code>`)
 * ============================================================================
 *
 * Read-only, recruiting-friendly landing page for a club. Rendered by
 * app-shell INSTEAD of the app itself, so unauthenticated visitors never see
 * a login wall for this URL; signed-in visitors see it too (with a "Back to
 * app" link).
 *
 * Design: the FORCED-DARK editorial twin of the auth screen — same #16130e
 * base, #f0ebe0 ink, hairlines at 10%, muted text at /60 and /45. It never
 * flips with the app theme. The club's own accent color only colors the
 * small stuff (logo tile, stat icon tiles, join icon) via the --pub-accent
 * CSS vars; primary actions stay ClubHub teal (`bg-club`), consistent with
 * the public site.
 *
 * Banner: full-bleed edge-to-edge cinematic image with the club's focal
 * point, gradient fades into #16130e on the bottom + sides, and the identity
 * block riding the bottom fade inside the max-w-3xl content column. Clubs
 * without a banner get a quiet accent-gradient wash on the dark base.
 *
 * Join CTA behavior:
 *   - Signed out               → "Join this club" opens the join prompt modal
 *                                (Sign Up / Log In / Cancel). The club code is
 *                                stored in sessionStorage (JOIN_INTENT_KEY);
 *                                after the visitor authenticates, the app
 *                                re-checks membership and opens the REAL join
 *                                dialog (password still required).
 *   - Signed in, not a member  → "Join this club" opens the in-page
 *                                ClubJoinDialog with BOTH paths side by side:
 *                                club code + password (instant join), or a
 *                                join request an executive approves.
 *   - Signed in, already a     → "Open club workspace".
 *     member
 * ============================================================================
 */

interface PublicClub {
  name: string
  description: string | null
  accentColor: string
  logoUrl: string | null
  bannerUrl: string | null
  bannerFocalY: number | null
  isListedPublic: boolean
  clubCode: string
  createdAt: string
  memberCount: number
  totalHoursLogged: number
  upcomingMeetingCount: number
  /** How this club admitted new members in the old either/or design.
   *  VESTIGIAL: both join paths (code+password AND exec-approved requests)
   *  are always offered now, so the UI no longer branches on this. Kept in
   *  the type because the API payload still includes it. */
  joinMode?: "code" | "request" | null
}

interface PublicClubResponse {
  club: PublicClub
}

/** sessionStorage key for the join-intent flow (consumed by app-shell). */
export const JOIN_INTENT_KEY = "clubhub-join-intent"

/** sessionStorage key for landing in the just-joined club (consumed by
 *  app-shell after the full-page navigation into the app). */
const SELECT_CLUB_KEY = "clubhub-select-club"

/** Shared editorial motion curve (same as the auth screen) — quiet, short. */
const EASE = [0.22, 1, 0.36, 1] as const

export function PublicClubProfile({ code }: { code: string }) {
  const { data: session, status } = useSession()
  const { data, isLoading, error } = useQuery<PublicClubResponse>({
    queryKey: ["public-club", code],
    queryFn: () =>
      api<PublicClubResponse>(`/api/public/club/${encodeURIComponent(code)}`),
    retry: 0,
    staleTime: 60_000,
  })

  // The club's accent color is unknown until the fetch resolves; default to
  // ClubHub teal so the loading state isn't unstyled.
  const accent = data?.club?.accentColor || "#10b981"
  const accentVars = useMemo(
    () =>
      ({
        "--pub-accent": accent,
        "--pub-accent-fg": readableForeground(accent),
        "--pub-accent-muted": hexToRgba(accent, 0.14),
        "--pub-accent-subtle": hexToRgba(accent, 0.07),
      }) as CSSProperties,
    [accent],
  )

  const isAuthenticated = status === "authenticated" && !!session?.user

  return (
    <div
      style={accentVars}
      className="relative min-h-screen flex flex-col bg-[#16130e] text-[#f0ebe0]"
    >
      {/* Ambient depth — one quiet teal glow + a faint dot grid, masked to
          the top of the page. Static (never animates), purely decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px circle at 50% -12%, rgba(16,185,129,0.09), transparent 65%)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[560px]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(240,235,224,0.05) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage:
              "radial-gradient(ellipse 90% 85% at 50% 0%, black 25%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 85% at 50% 0%, black 25%, transparent 78%)",
          }}
        />
      </div>

      <TopBar isAuthenticated={isAuthenticated} />

      <main className="relative z-10 flex-1 flex flex-col">
        {isLoading ? (
          <ProfileSkeleton />
        ) : error || !data ? (
          <ProfileError
            message={error ? (error as Error).message : "Club not found"}
            code={code}
          />
        ) : (
          <ProfileBody club={data.club} isAuthenticated={isAuthenticated} />
        )}
      </main>

      <footer className="relative z-10 mt-auto border-t border-[#f0ebe0]/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-[#f0ebe0]/45 truncate">
              ClubHub · Built for students at Burnaby North Secondary.
            </p>
            <p className="mt-0.5 text-[0.65rem] text-[#f0ebe0]/25 select-none">
              made by Aaron Shan · v7
            </p>
          </div>
          <Link
            href="/#clubs"
            className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase text-[#f0ebe0]/60 hover:text-[#f0ebe0] transition-colors shrink-0"
          >
            <Compass className="h-3.5 w-3.5" />
            Discover more clubs
          </Link>
        </div>
      </footer>
    </div>
  )
}

/* ───────────────────────── Top bar ───────────────────────── */

function TopBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router = useRouter()
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-[#f0ebe0]/10 bg-[#16130e]/85 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="ClubHub home"
          className="text-lg font-extrabold tracking-tight hover:opacity-80 transition-opacity"
        >
          ClubHub
        </Link>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[#f0ebe0]/60 hover:text-[#f0ebe0] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to app
            </Link>
          ) : (
            <Link
              href="/?auth=login"
              className="hidden sm:inline-flex text-sm font-semibold text-[#f0ebe0]/60 hover:text-[#f0ebe0] transition-colors"
            >
              Sign in
            </Link>
          )}
          {/* Close — leaves the expanded club view and returns to where the
              visitor came from (the landing page for signed-out visitors,
              the app for signed-in ones). */}
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="Close club view"
            title="Close club view"
            className="grid h-10 w-10 place-items-center rounded-full border border-[#f0ebe0]/20 bg-[#f0ebe0]/[0.04] text-[#f0ebe0]/70 transition-all hover:bg-[#f0ebe0]/10 hover:text-[#f0ebe0] hover:border-[#f0ebe0]/40 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f0ebe0]/40"
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  )
}

/* ───────────────────────── Page body ───────────────────────── */

function ProfileBody({
  club,
  isAuthenticated,
}: {
  club: PublicClub
  isAuthenticated: boolean
}) {
  const router = useRouter()
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  // Signed-in join dialog (both paths) — opens in-page instead of routing
  // into the app, so the visitor can join right where they are.
  const [joinOpen, setJoinOpen] = useState(false)
  const focalPct = Math.round((club.bannerFocalY ?? 0.5) * 100)
  const hasBanner = !!club.bannerUrl

  // Signed-in visitors: check whether they already belong to this club so we
  // can show "Open workspace" instead of the join CTA. One small fetch,
  // only when authenticated.
  const { data: meData } = useQuery<{ memberships: { clubCode: string; clubName: string }[] }>({
    queryKey: ["me-membership-check", club.clubCode],
    queryFn: () => api<{ memberships: { clubCode: string; clubName: string }[] }>("/api/me"),
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
  const isMember = !!meData?.memberships?.some((m) => m.clubCode === club.clubCode)

  return (
    <article className="flex flex-col">
      {/* ── Cinematic banner header — full-bleed, melts into the page ────── */}
      <header className="relative w-full">
        <div className="relative h-56 sm:h-72">
          {hasBanner ? (
            <img
              src={club.bannerUrl!}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: `center ${focalPct}%` }}
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `linear-gradient(160deg, ${hexToRgba(
                  club.accentColor,
                  0.22,
                )} 0%, ${hexToRgba(club.accentColor, 0.05)} 55%, rgba(22,19,14,0) 100%)`,
              }}
            />
          )}
          {/* Layer 1 — contrast scrim (image only). */}
          {hasBanner && (
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/5 to-black/45"
            />
          )}
          {/* Layer 2 — fade into the page base at the bottom. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-[#16130e] via-[#16130e]/60 to-transparent"
          />
          {/* Layer 3 — cinematic side fades so the image dissolves into the
              page instead of stopping at hard edges. */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-16 sm:w-40 bg-gradient-to-r from-[#16130e]/80 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 w-16 sm:w-40 bg-gradient-to-l from-[#16130e]/80 to-transparent"
          />

          {/* Identity block — rides the bottom fade, aligned to the body
              column below. */}
          <div className="absolute inset-x-0 bottom-0">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="max-w-3xl mx-auto px-4 sm:px-6 pb-5 sm:pb-7 flex items-end gap-4"
            >
              <Avatar className="h-16 w-16 rounded-xl border border-[#f0ebe0]/15 shadow-[0_8px_24px_rgba(0,0,0,0.4)] shrink-0">
                <AvatarImage
                  src={club.logoUrl ?? undefined}
                  alt={`${club.name} logo`}
                  className="object-cover"
                />
                <AvatarFallback
                  className="rounded-xl text-lg font-bold"
                  style={{
                    backgroundColor: "var(--pub-accent)",
                    color: "var(--pub-accent-fg)",
                  }}
                >
                  {initials(club.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 pb-0.5">
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                  <h1
                    className={cn(
                      "font-black tracking-tighter text-3xl sm:text-4xl leading-[1.05] break-words min-w-0",
                      hasBanner
                        ? "text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.55)]"
                        : "text-[#f0ebe0]",
                    )}
                  >
                    {club.name}
                  </h1>
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold tracking-wide backdrop-blur-sm shrink-0"
                    style={
                      hasBanner
                        ? {
                            borderColor: "rgba(255,255,255,0.3)",
                            backgroundColor: "rgba(255,255,255,0.15)",
                            color: "#fff",
                          }
                        : {
                            borderColor: "rgba(240,235,224,0.18)",
                            backgroundColor: "rgba(240,235,224,0.05)",
                            color: "rgba(240,235,224,0.8)",
                          }
                    }
                  >
                    <Hash className="h-3 w-3" />
                    {club.clubCode}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-2 text-sm font-medium",
                    hasBanner
                      ? "text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]"
                      : "text-[#f0ebe0]/60",
                  )}
                >
                  {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
                  <span aria-hidden className="opacity-50"> · </span>
                  since {format(parseISO(club.createdAt), "MMMM yyyy")}
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </header>

      {/* ── Body — one quiet editorial column ─────────────────────────────── */}
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-14 space-y-10 sm:space-y-14">
        {/* Description */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}
          aria-label="About this club"
        >
          {club.description ? (
            <p className="text-lg leading-relaxed text-[#f0ebe0]/70 max-w-xl">
              {club.description}
            </p>
          ) : (
            <p className="text-lg leading-relaxed text-[#f0ebe0]/45 italic">
              A ClubHub community.
            </p>
          )}
        </motion.section>

        {/* Stats — editorial blocks separated by hairlines, not boxed cards */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.12 }}
          aria-label="Club statistics"
          className="grid grid-cols-3 divide-x divide-[#f0ebe0]/10"
        >
          <StatBlock
            icon={<Users className="h-4 w-4" />}
            label="Members"
            value={String(club.memberCount)}
            className="pr-4 sm:pr-6"
          />
          <StatBlock
            icon={<Clock className="h-4 w-4" />}
            label="Hours logged"
            value={fmtHours(club.totalHoursLogged)}
            className="px-4 sm:px-6"
          />
          <StatBlock
            icon={<CalendarDays className="h-4 w-4" />}
            label="Upcoming"
            value={String(club.upcomingMeetingCount)}
            className="pl-4 sm:pl-6"
          />
        </motion.section>

        {/* How to join — both routes, always shown together */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.18 }}
          aria-label="How to join"
          className="border border-[#f0ebe0]/10 bg-[#f0ebe0]/[0.03] p-5 sm:p-7"
        >
          <h2 className="text-xs font-bold tracking-[0.2em] uppercase text-[#f0ebe0]/45">
            How to join
          </h2>
          <div className="mt-4 divide-y divide-[#f0ebe0]/10">
            <div className="flex items-start gap-3.5 pb-4">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{
                  backgroundColor: "var(--pub-accent-muted)",
                  color: "var(--pub-accent)",
                }}
              >
                <KeyRound className="h-4 w-4" />
              </span>
              <p className="text-sm leading-relaxed text-[#f0ebe0]/70 pt-1.5 max-w-md">
                <span className="font-bold text-[#f0ebe0]/90">Have the club code?</span>{" "}
                You&apos;re in instantly — enter the code and the password an
                executive shared with you.
              </p>
            </div>
            <div className="flex items-start gap-3.5 pt-4">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{
                  backgroundColor: "var(--pub-accent-muted)",
                  color: "var(--pub-accent)",
                }}
              >
                <UserCheck className="h-4 w-4" />
              </span>
              <p className="text-sm leading-relaxed text-[#f0ebe0]/70 pt-1.5 max-w-md">
                <span className="font-bold text-[#f0ebe0]/90">Don&apos;t have it?</span>{" "}
                Send a join request and an executive will approve you.
              </p>
            </div>
          </div>
        </motion.section>

        {/* CTA — same three-state logic as the previous design */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.24 }}
          aria-label="Join this club"
          className="flex flex-col items-start gap-3"
        >
          {isAuthenticated ? (
            isMember ? (
              <>
                <Button
                  variant="club"
                  size="lg"
                  className="h-12 w-full sm:w-auto rounded-none font-bold tracking-wide uppercase"
                  asChild
                >
                  <Link href="/">
                    <ArrowLeft className="h-4 w-4" />
                    Open club workspace
                  </Link>
                </Button>
                <p className="text-sm text-[#f0ebe0]/50 max-w-md">
                  You&apos;re a member of {club.name} — continue to your dashboard.
                </p>
              </>
            ) : (
              <>
                <Button
                  variant="club"
                  size="lg"
                  className="h-12 w-full sm:w-auto rounded-none font-bold tracking-wide uppercase"
                  onClick={() => setJoinOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Join this club
                </Button>
                <p className="text-sm text-[#f0ebe0]/50 max-w-md">
                  Use the club code and password, or send a join request — an
                  executive will approve you.
                </p>
              </>
            )
          ) : (
            <>
              <Button
                variant="club"
                size="lg"
                className="h-12 w-full sm:w-auto rounded-none font-bold tracking-wide uppercase"
                onClick={() => setAuthPromptOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                Join this club
              </Button>
              <p className="text-sm text-[#f0ebe0]/50 max-w-md">
                Free account required — it takes under a minute.
              </p>
            </>
          )}
        </motion.section>
      </div>

      {/* Auth-required modal (signed-out visitors) — dark editorial restyle,
          same behavior: Sign Up / Log In + join-intent resume. */}
      <JoinPromptDialog
        open={authPromptOpen}
        onOpenChange={setAuthPromptOpen}
        clubName={club.name}
        clubCode={club.clubCode}
        onChoose={(mode) => {
          setAuthPromptOpen(false)
          try {
            sessionStorage.setItem(JOIN_INTENT_KEY, club.clubCode)
          } catch {
            /* ignore */
          }
          router.push(`/?auth=${mode}`)
        }}
      />

      {/* Signed-in visitor: BOTH join paths in one in-page dialog — club
          code + password (instant) or a join request an executive approves. */}
      <ClubJoinDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        club={{ name: club.name, clubCode: club.clubCode }}
      />
    </article>
  )
}

/* ───────────────────────── Stat block ─────────────────────────
   Editorial stat: accent icon tile, font-black tabular value, micro
   uppercase label. Separated from its siblings by hairlines, not boxes. */

function StatBlock({
  icon,
  label,
  value,
  className,
}: {
  icon: ReactNode
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-md"
        style={{
          backgroundColor: "var(--pub-accent-muted)",
          color: "var(--pub-accent)",
        }}
      >
        {icon}
      </span>
      <span className="text-2xl font-black tracking-tight tabular-nums leading-none">
        {value}
      </span>
      <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[#f0ebe0]/45">
        {label}
      </span>
    </div>
  )
}

/**
 * ClubJoinDialog — the dialog a SIGNED-IN visitor gets when they click
 * "Join this club" on the public profile. Both join paths side by side
 * (same pattern as the app's JoinClubDialog):
 *
 *   - primary   → club password → instant join (POST /api/clubs/join). A
 *                 successful join routes into the app with a full page load
 *                 so the shell bootstraps with the fresh membership.
 *   - secondary → "Don't have the code? Send a join request instead" (POST
 *                 /api/join-requests) with an optional 280-char note; an
 *                 executive approves it from Members → Join requests. A
 *                 wrong password gently points at this path.
 *
 * The club is already known (this is its profile page), so the code is a
 * static chip instead of an input. Pinned dark to match the forced-dark
 * editorial page — the default dialog skin is theme-aware and would flip
 * light, like JoinPromptDialog below.
 */
function ClubJoinDialog({
  open, onOpenChange, club,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  club: { name: string; clubCode: string }
}) {
  const [clubPassword, setClubPassword] = useState("")
  const [message, setMessage] = useState("")
  const [joining, setJoining] = useState(false)
  const [requesting, setRequesting] = useState(false)
  /** Join-request success state — replaces the form with a confirmation. */
  const [requested, setRequested] = useState(false)
  /** Set when a password join bounces, so we can point at the request path. */
  const [pwFailed, setPwFailed] = useState(false)

  // Reset the transient state whenever the dialog opens (deferred to a
  // microtask so we never setState synchronously inside the effect body).
  useEffect(() => {
    if (!open) return
    Promise.resolve().then(() => {
      setClubPassword("")
      setMessage("")
      setRequested(false)
      setPwFailed(false)
    })
  }, [open])

  // ── Path 1 (primary): club password → instant join ──────────────────────
  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoining(true)
    setPwFailed(false)
    try {
      const res = await api<{ club: { id: string; name: string } }>("/api/clubs/join", {
        method: "POST",
        json: { clubCode: club.clubCode, clubPassword },
      })
      toast.success(`Joined ${club.name}!`)
      // Stash the joined club so the app lands in THE club they just joined
      // (not whichever club was previously open) — a full page load would
      // otherwise restore the old selection from the persisted store.
      try {
        sessionStorage.setItem(SELECT_CLUB_KEY, res.club.id)
      } catch {
        /* ignore */
      }
      // Full page navigation (not client-side routing) so the AppShell
      // mounts fresh and bootstraps with the new membership — a client-side
      // route would keep the stale, pre-join /api/me cache.
      window.location.assign("/")
    } catch (err: any) {
      toast.error(err.message)
      if (String(err?.message ?? "").toLowerCase().includes("wrong club password")) {
        setPwFailed(true)
      }
    } finally {
      setJoining(false)
    }
  }

  // ── Path 2 (secondary): join request an executive approves ──────────────
  async function handleRequest() {
    setRequesting(true)
    try {
      await api("/api/join-requests", {
        method: "POST",
        json: { clubCode: club.clubCode, message: message.trim() || undefined },
      })
      toast.success("Request sent — an executive will review it.")
      setRequested(true)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md rounded-none border border-[#f0ebe0]/15 bg-[#16130e] text-[#f0ebe0] p-6 sm:p-8 gap-0 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
      >
        {/* Dark-styled close affordance (the built-in one inherits theme
            colors and would be near-invisible in light mode). */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center text-[#f0ebe0]/45 hover:text-[#f0ebe0] hover:bg-[#f0ebe0]/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader className="text-left mb-6">
          <DialogTitle className="text-xl font-extrabold tracking-tight">
            Join {club.name}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#f0ebe0]/60">
            Use the club code and password, or send a join request — an
            executive will approve you.
          </DialogDescription>
        </DialogHeader>

        {requested ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{
                backgroundColor: "var(--pub-accent-muted)",
                color: "var(--pub-accent)",
              }}
            >
              <UserCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Request sent</p>
              <p className="mt-1 text-sm leading-relaxed text-[#f0ebe0]/55 max-w-xs mx-auto">
                An executive of {club.name} will review your request. You&apos;ll
                get a notification the moment it&apos;s approved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase text-[#f0ebe0]/40 hover:text-[#f0ebe0]/70 transition-colors"
            >
              <X className="h-3 w-3" />
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* The club code is public on this page — show it as a chip so
                the "code + password" language matches what the visitor sees. */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#f0ebe0]/45">
                Club code
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-none border border-[#f0ebe0]/20 bg-[#f0ebe0]/[0.05] px-2.5 py-1 font-mono text-sm font-semibold">
                <Hash className="h-3 w-3 opacity-60" />
                {club.clubCode}
              </span>
            </div>

            {/* Primary path — password → instant join. */}
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pub-join-password">Club password</Label>
                <Input
                  id="pub-join-password"
                  type="password"
                  value={clubPassword}
                  onChange={(e) => {
                    setClubPassword(e.target.value)
                    setPwFailed(false)
                  }}
                  placeholder="••••••••"
                  className="h-11 rounded-none border-[#f0ebe0]/20 bg-[#f0ebe0]/[0.04] placeholder:text-[#f0ebe0]/25 focus-visible:border-[#f0ebe0]/40 focus-visible:ring-[#f0ebe0]/10"
                />
                {pwFailed && (
                  <p className="text-xs leading-relaxed text-[#f0ebe0]/60">
                    That password didn&apos;t work — you can also send a join
                    request below and an executive will let you in.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                variant="club"
                disabled={joining || requesting}
                className="w-full h-11 rounded-none font-bold tracking-wide uppercase"
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {joining ? "Joining..." : "Join club"}
              </Button>
            </form>

            {/* Secondary path — clearly separated box: no code? send a join
                request an executive approves instead. */}
            <div className="space-y-3 rounded-none border border-[#f0ebe0]/12 bg-[#f0ebe0]/[0.03] p-4">
              <div className="flex items-start gap-2.5">
                <UserCheck
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: "var(--pub-accent)" }}
                />
                <div>
                  <p className="text-sm font-semibold">Don&apos;t have the code?</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#f0ebe0]/55">
                    Send a join request instead — an executive will review it
                    and let you in.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pub-join-note" className="text-xs text-[#f0ebe0]/50">
                  Note to the executives (optional)
                </Label>
                <Textarea
                  id="pub-join-note"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. I'd love to help at events!"
                  maxLength={280}
                  className="rounded-none min-h-20 bg-[#f0ebe0]/[0.04] border-[#f0ebe0]/20 placeholder:text-[#f0ebe0]/25 focus-visible:border-[#f0ebe0]/40 focus-visible:ring-[#f0ebe0]/10 resize-none text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={requesting || joining}
                onClick={handleRequest}
                className="w-full h-11 rounded-none font-bold tracking-wide uppercase border border-[#f0ebe0]/20 bg-transparent text-[#f0ebe0] hover:bg-[#f0ebe0]/[0.05] hover:border-[#f0ebe0]/40 hover:text-[#f0ebe0] dark:hover:bg-[#f0ebe0]/[0.05]"
              >
                {requesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}
                {requesting ? "Sending..." : "Send join request"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Join the ClubHub community" modal shown when an unauthenticated visitor
 * tries to join a club. Explains WHY an account is needed and offers the two
 * auth paths + cancel — never silently redirects. Restyled to match the
 * forced-dark editorial page (the default dialog skin is theme-aware and
 * would flip light, so everything here is pinned dark).
 */
function JoinPromptDialog({
  open,
  onOpenChange,
  clubName,
  clubCode,
  onChoose,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  clubName: string
  clubCode: string
  onChoose: (mode: "login" | "signup") => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md rounded-none border border-[#f0ebe0]/15 bg-[#16130e] text-[#f0ebe0] p-6 sm:p-8 gap-0 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
      >
        {/* Dark-styled close affordance (the built-in one inherits theme
            colors and would be near-invisible in light mode). */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center text-[#f0ebe0]/45 hover:text-[#f0ebe0] hover:bg-[#f0ebe0]/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader className="text-left mb-6">
          <DialogTitle className="text-xl font-extrabold tracking-tight">
            Join the ClubHub community
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#f0ebe0]/60">
            Create an account or log in to join{" "}
            <span className="font-bold text-[#f0ebe0]/85">{clubName}</span> and
            access its activities.
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-[#f0ebe0]/45 mb-6">
          After signing in we&apos;ll take you straight back to{" "}
          <span className="font-mono font-semibold">{clubCode}</span>&apos;s join
          steps.
        </p>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <Button
            type="button"
            variant="club"
            className="flex-1 h-11 rounded-none font-bold tracking-wide uppercase"
            onClick={() => onChoose("signup")}
          >
            <UserPlus className="h-4 w-4" />
            Sign Up
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="flex-1 h-11 rounded-none font-bold tracking-wide uppercase border border-[#f0ebe0]/20 bg-transparent text-[#f0ebe0] hover:bg-[#f0ebe0]/[0.05] hover:border-[#f0ebe0]/40 hover:text-[#f0ebe0] dark:hover:bg-[#f0ebe0]/[0.05]"
            onClick={() => onChoose("login")}
          >
            <LogIn className="h-4 w-4" />
            Log In
          </Button>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mt-4 mx-auto inline-flex items-center gap-1.5 text-xs font-bold tracking-wide uppercase text-[#f0ebe0]/40 hover:text-[#f0ebe0]/70 transition-colors"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────────────────── Skeleton / error ───────────────────────── */

function ProfileSkeleton() {
  return (
    <div>
      {/* Banner-shaped placeholder with the identity block ghosted in */}
      <div className="relative h-56 sm:h-72">
        <Skeleton className="absolute inset-0 h-full w-full rounded-none bg-[#f0ebe0]/[0.05]" />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-[#16130e] to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-5 sm:pb-7 flex items-end gap-4">
            <Skeleton className="h-16 w-16 rounded-xl bg-[#f0ebe0]/10 shrink-0" />
            <div className="flex-1 space-y-3 pb-1 min-w-0">
              <Skeleton className="h-8 w-2/3 rounded-none bg-[#f0ebe0]/10" />
              <Skeleton className="h-4 w-44 rounded-none bg-[#f0ebe0]/[0.07]" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-14 space-y-10 sm:space-y-14">
        <div className="space-y-3">
          <Skeleton className="h-5 w-full max-w-xl rounded-none bg-[#f0ebe0]/10" />
          <Skeleton className="h-5 w-3/5 max-w-xl rounded-none bg-[#f0ebe0]/[0.07]" />
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#f0ebe0]/10">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "space-y-3",
                i === 0 && "pr-4 sm:pr-6",
                i === 1 && "px-4 sm:px-6",
                i === 2 && "pl-4 sm:pl-6",
              )}
            >
              <Skeleton className="h-8 w-8 rounded-md bg-[#f0ebe0]/10" />
              <Skeleton className="h-7 w-16 rounded-none bg-[#f0ebe0]/10" />
            </div>
          ))}
        </div>
        <Skeleton className="h-32 w-full rounded-none border border-[#f0ebe0]/10 bg-[#f0ebe0]/[0.03]" />
        <Skeleton className="h-12 w-full sm:w-64 rounded-none bg-[#f0ebe0]/10" />
      </div>
    </div>
  )
}

function ProfileError({ message, code }: { message: string; code: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 sm:py-28">
      <div className="mb-6 flex h-12 w-12 items-center justify-center border border-[#f0ebe0]/15 text-[#f0ebe0]/40">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h1 className="text-3xl font-black tracking-tighter">Club not found</h1>
      <p className="mt-3 text-sm leading-relaxed text-[#f0ebe0]/60 max-w-sm">
        We couldn&apos;t find a club with the code{" "}
        <span className="font-mono font-bold text-[#f0ebe0]/85">{code}</span>.
        Check the link and try again.
      </p>
      <p className="text-xs text-[#f0ebe0]/30 mt-3">{message}</p>
      <Button
        variant="ghost"
        asChild
        className="mt-8 h-11 rounded-none border border-[#f0ebe0]/20 bg-transparent font-bold tracking-wide uppercase text-[#f0ebe0] hover:bg-[#f0ebe0]/[0.05] hover:border-[#f0ebe0]/40 hover:text-[#f0ebe0] dark:hover:bg-[#f0ebe0]/[0.05]"
      >
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Back to ClubHub
        </Link>
      </Button>
    </div>
  )
}

// =========================================================================
// Local helpers — duplicated from club-accent-provider.tsx because that
// module is a client component with React imports; pulling it in here would
// add a needless import graph. The logic is identical (WCAG luminance + hex
// to rgba) — keep them in sync if either changes.
// =========================================================================

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

function fmtHours(h: number) {
  if (h === 0) return "0"
  if (Number.isInteger(h)) return String(h)
  return h.toFixed(1)
}
