"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import {
  Footprints,
  ListChecks,
  Trophy,
  HeartHandshake,
  Award,
  CalendarCheck,
  Megaphone,
  Users,
  Lock,
  type LucideIcon,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

// ---------------------------------------------------------------------------
// Types — matches /api/clubs/[clubId]/members/[userId]/badges
// ---------------------------------------------------------------------------

export interface Badge {
  id: string
  label: string
  description: string
  icon: string
  earned: boolean
}

interface BadgeStats {
  tasksDone: number
  approvedHours: number
  meetingsGoing: number
  announcementsPosted: number
  teamCount: number
}

interface BadgeResponse {
  badges: Badge[]
  stats: BadgeStats
  target: { userId: string; role: "member" | "executive"; joinedAt: string }
}

// ---------------------------------------------------------------------------
// Icon mapping — kept here so the badge catalog stays serializable on the API.
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Footprints,
  ListChecks,
  Trophy,
  HeartHandshake,
  Award,
  CalendarCheck,
  Megaphone,
  Users,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BadgesDisplayProps {
  userId: string
  clubId: string
  /** When true, hides the unearned badges section (default false). */
  hideUnearned?: boolean
  /** When true, renders as a compact inline row (no descriptions). */
  compact?: boolean
  className?: string
}

export function BadgesDisplay({
  userId,
  clubId,
  hideUnearned = false,
  compact = false,
  className,
}: BadgesDisplayProps) {
  const { data, isLoading, isError } = useQuery<BadgeResponse>({
    queryKey: ["member-badges", clubId, userId],
    queryFn: () => api(`/api/clubs/${clubId}/members/${userId}/badges`),
    enabled: !!clubId && !!userId,
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        Couldn’t load badges.
      </div>
    )
  }

  const earned = data.badges.filter((b) => b.earned)
  const unearned = data.badges.filter((b) => !b.earned)

  if (compact) {
    if (earned.length === 0) {
      return <span className="text-xs text-muted-foreground/60">—</span>
    }
    return (
      <div className={cn("flex flex-wrap items-center gap-1", className)}>
        {earned.slice(0, 3).map((b) => {
          const Icon = ICON_MAP[b.icon] ?? Trophy
          return (
            <span
              key={b.id}
              title={`${b.label} — ${b.description}`}
              className="inline-flex items-center gap-1 rounded-full bg-club-muted px-1.5 py-0.5 text-[10px] font-medium text-club"
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:inline">{b.label}</span>
            </span>
          )
        })}
        {earned.length > 3 && (
          <span className="text-[10px] text-muted-foreground">+{earned.length - 3} more</span>
        )}
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Earned */}
      {earned.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
          No badges earned yet — keep participating!
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {earned.map((b) => {
            const Icon = ICON_MAP[b.icon] ?? Trophy
            return (
              <div
                key={b.id}
                className="group flex items-center gap-2 rounded-lg bg-club-muted px-2.5 py-1.5 text-club"
                title={b.description}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold leading-tight">{b.label}</div>
                  <div className="text-[10px] text-club/80 leading-tight truncate max-w-[160px]">
                    {b.description}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Unearned — faded, optionally hidden */}
      {!hideUnearned && unearned.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
            In progress
          </div>
          <div className="flex flex-wrap gap-2">
            {unearned.map((b) => {
              const Icon = ICON_MAP[b.icon] ?? Trophy
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-muted-foreground opacity-70"
                  title={b.description}
                >
                  <Lock className="h-3 w-3 shrink-0" />
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-[11px] font-medium">{b.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export type { BadgeResponse, BadgeStats }
