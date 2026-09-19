"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { relativeTime } from "@/components/shared/page-header"

// ---------------------------------------------------------------------------
// Types — matches /api/clubs/[clubId]/members/[userId]/badges (new shape)
// ---------------------------------------------------------------------------

export interface MemberBadgeItem {
  id: string
  name: string
  description: string | null
  emoji: string
  createdAt: string
  awarded: boolean
  awardedAt: string | null
  awardedById: string | null
  awardedByName: string | null
}

interface BadgeResponse {
  badges: MemberBadgeItem[]
  target: {
    userId: string
    role: "member" | "executive"
    joinedAt: string
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BadgesDisplayProps {
  userId: string
  clubId: string
  /**
   * When true, hides the "not awarded" badges section. Awarded badges always
   * render. Default false.
   */
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
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        Couldn&apos;t load badges.
      </div>
    )
  }

  const awarded = data.badges.filter((b) => b.awarded)
  const notAwarded = data.badges.filter((b) => !b.awarded)

  // Compact row — used in the members table. Only shows awarded badges,
  // max 3 visible + overflow count. Tooltip carries the description + awarder.
  if (compact) {
    if (awarded.length === 0) {
      return <span className="text-xs text-muted-foreground/60">—</span>
    }
    return (
      <TooltipProvider delayDuration={200}>
        <div className={cn("flex flex-wrap items-center gap-1", className)}>
          {awarded.slice(0, 3).map((b) => (
            <Tooltip key={b.id}>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-club-muted px-1.5 py-0.5 text-xs font-medium text-club cursor-default"
                >
                  <span aria-hidden>{b.emoji}</span>
                  <span className="hidden sm:inline">{b.name}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px]">
                <BadgeTooltipBody badge={b} />
              </TooltipContent>
            </Tooltip>
          ))}
          {awarded.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{awarded.length - 3} more
            </span>
          )}
        </div>
      </TooltipProvider>
    )
  }

  // Full layout — used in the member detail sheet. Shows awarded badges in
  // full color, then a muted "available" section for badges the user doesn't
  // have yet (optional, off in detail view).
  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("space-y-3", className)}>
        {awarded.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
            No badges awarded yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {awarded.map((b) => (
              <Tooltip key={b.id}>
                <TooltipTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    className="group flex items-center gap-2 rounded-lg bg-club-muted px-2.5 py-1.5 text-club cursor-default"
                  >
                    <span aria-hidden className="text-base leading-none">
                      {b.emoji}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-tight">
                        {b.name}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px]">
                  <BadgeTooltipBody badge={b} />
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {!hideUnearned && notAwarded.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs  font-medium text-muted-foreground">
              Available
            </div>
            <div className="flex flex-wrap gap-2">
              {notAwarded.map((b) => (
                <Tooltip key={b.id}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-muted-foreground opacity-70 cursor-default"
                    >
                      <span aria-hidden className="text-sm leading-none grayscale">
                        {b.emoji}
                      </span>
                      <span className="text-xs font-medium">{b.name}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <div className="text-xs">
                      <div className="font-semibold">
                        {b.emoji} {b.name}
                      </div>
                      {b.description && (
                        <div className="text-muted-foreground mt-0.5">
                          {b.description}
                        </div>
                      )}
                      <div className="text-muted-foreground/70 mt-0.5">
                        Not awarded yet.
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

/**
 * Tooltip body — used by both the compact + full layouts. Shows the badge
 * description (if any), the awarder's name, and when it was awarded.
 */
function BadgeTooltipBody({ badge }: { badge: MemberBadgeItem }) {
  return (
    <div className="text-xs space-y-1">
      <div className="font-semibold">
        {badge.emoji} {badge.name}
      </div>
      {badge.description && (
        <div className="text-muted-foreground">{badge.description}</div>
      )}
      {badge.awarded && (
        <div className="text-muted-foreground/80">
          Awarded by {badge.awardedByName ?? "an executive"}
          {badge.awardedAt && ` · ${relativeTime(badge.awardedAt)}`}
        </div>
      )}
    </div>
  )
}

export type { BadgeResponse }
