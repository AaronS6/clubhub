"use client"

import { useMemo, type CSSProperties } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Avatar, AvatarFallback, AvatarImage,
} from "@/components/ui/avatar"
import {
  Users, Clock, CalendarDays, ArrowLeft, Sparkles, AlertCircle, Hash,
} from "lucide-react"
import { format, parseISO } from "date-fns"
import { initials } from "@/components/shared/page-header"

/**
 * ============================================================================
 * PublicClubProfile — read-only landing page for a club, shown when the URL
 * carries `?public=<clubCode>`. Renders INSTEAD of the AppShell (wired in
 * app-shell.tsx), so unauthenticated visitors never see the login screen for
 * this URL — they see the recruiting-friendly profile. Authenticated users
 * also see the profile (with a "Back to app" link).
 *
 * The component is intentionally self-contained: it injects the club's
 * accentColor directly via inline CSS vars (no ClubAccentProvider dependency,
 * since that provider keys off the user's *current* club, which is irrelevant
 * here). Visually distinct from the app — large hero header, generous spacing,
 * a clear CTA. No nav, no notifications, no realtime socket.
 * ============================================================================
 */

interface PublicClub {
  name: string
  description: string | null
  accentColor: string
  logoUrl: string | null
  clubCode: string
  createdAt: string
  memberCount: number
  totalHoursLogged: number
  upcomingMeetingCount: number
}

interface PublicClubResponse {
  club: PublicClub
}

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
  // a warm emerald so the loading state isn't unstyled.
  const accent = data?.club?.accentColor || "#10b981"
  const accentVars = useMemo<CSSProperties>(
    () =>
      ({
        ["--pub-accent" as any]: accent,
        ["--pub-accent-fg" as any]: readableForeground(accent),
        ["--pub-accent-muted" as any]: hexToRgba(accent, 0.12),
        ["--pub-accent-subtle" as any]: hexToRgba(accent, 0.06),
      }),
    [accent],
  )

  const isAuthenticated = status === "authenticated" && !!session?.user

  return (
    <div
      style={accentVars}
      className="min-h-screen flex flex-col bg-background"
    >
      {/* Slim top bar — just a logo + back link. No nav. */}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10 shrink-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
            aria-label="Back to ClubHub home"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
              style={{
                backgroundColor: "var(--pub-accent)",
                color: "var(--pub-accent-fg)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="hidden sm:inline">ClubHub</span>
          </Link>
          {isAuthenticated ? (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to app
            </Link>
          ) : (
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          {isLoading ? (
            <ProfileSkeleton />
          ) : error || !data ? (
            <ProfileError
              message={error ? (error as Error).message : "Club not found"}
              code={code}
            />
          ) : (
            <ProfileCard club={data.club} isAuthenticated={isAuthenticated} />
          )}
        </div>
      </main>

      <footer className="border-t bg-background px-4 md:px-6 py-4 text-center text-xs text-muted-foreground shrink-0">
        ClubHub · Multi-club management platform
      </footer>
    </div>
  )
}

function ProfileCard({
  club,
  isAuthenticated,
}: {
  club: PublicClub
  isAuthenticated: boolean
}) {
  return (
    <article className="animate-fade-in">
      {/* Hero header — accent-colored band with logo + name */}
      <div
        className="relative overflow-hidden rounded-2xl border"
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(
            club.accentColor,
            0.22,
          )} 0%, ${hexToRgba(club.accentColor, 0.04)} 100%)`,
        }}
      >
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full w-1.5"
          style={{ backgroundColor: club.accentColor }}
        />
        <div className="p-6 sm:p-8 pl-7 sm:pl-9">
          <div className="flex items-start gap-4">
            <Avatar
              className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-2 shadow-sm shrink-0"
              style={{ backgroundColor: club.accentColor }}
            >
              <AvatarImage
                src={club.logoUrl ?? undefined}
                alt={`${club.name} logo`}
                className="object-cover"
              />
              <AvatarFallback
                className="rounded-2xl text-lg sm:text-xl font-bold"
                style={{
                  backgroundColor: club.accentColor,
                  color: readableForeground(club.accentColor),
                }}
              >
                {initials(club.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight truncate">
                  {club.name}
                </h1>
              </div>
              <p
                className="text-xs sm:text-sm mt-1 inline-flex items-center gap-1.5 font-mono"
                style={{ color: club.accentColor }}
              >
                <Hash className="h-3 w-3" />
                {club.clubCode}
              </p>
              {club.description ? (
                <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
                  {club.description}
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground italic">
                  A ClubHub community.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid — members, hours, meetings */}
      <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="Members"
          value={String(club.memberCount)}
        />
        <StatTile
          icon={<Clock className="h-4 w-4" />}
          label="Hours logged"
          value={fmtHours(club.totalHoursLogged)}
        />
        <StatTile
          icon={<CalendarDays className="h-4 w-4" />}
          label="Upcoming"
          value={String(club.upcomingMeetingCount)}
        />
      </div>

      {/* Meta line — joined date */}
      <p className="mt-4 text-xs text-muted-foreground text-center">
        Active on ClubHub since {format(parseISO(club.createdAt), "MMMM yyyy")}
      </p>

      {/* CTA — Join this club (unauthenticated) or Back to app (authenticated) */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {isAuthenticated ? (
          <>
            <Button variant="club" size="lg" className="w-full sm:w-auto" asChild>
              <Link href="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to app
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              To join this club, open the app and use{" "}
              <span className="font-medium">Join a club</span> with code{" "}
              <span className="font-mono font-semibold">{club.clubCode}</span>.
            </p>
          </>
        ) : (
          <>
            <Button variant="club" size="lg" className="w-full sm:w-auto" asChild>
              <Link href="/">
                <Sparkles className="mr-1.5 h-4 w-4" />
                Join this club
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              Sign in or create an account, then enter the club code{" "}
              <span className="font-mono font-semibold">{club.clubCode}</span>{" "}
              and password shared by the club organizer.
            </p>
          </>
        )}
      </div>
    </article>
  )
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border bg-card px-3 sm:px-4 py-3 sm:py-4 text-center">
      <div
        className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full"
        style={{
          backgroundColor: "var(--pub-accent-muted)",
          color: "var(--pub-accent)",
        }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="text-xl sm:text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 w-full sm:w-48 mx-auto rounded-md" />
    </div>
  )
}

function ProfileError({ message, code }: { message: string; code: string }) {
  return (
    <div className="text-center py-12 px-4 animate-fade-in">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold">Club not found</h1>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
        We couldn&apos;t find a club with the code{" "}
        <span className="font-mono font-semibold">{code}</span>. Check the link
        and try again.
      </p>
      <p className="text-xs text-muted-foreground/60 mt-3">{message}</p>
      <Button variant="outline" size="sm" className="mt-5" asChild>
        <Link href="/">Go to ClubHub</Link>
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
