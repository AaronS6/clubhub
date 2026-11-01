"use client"

import { cn } from "@/lib/utils"
import { ResilientImage } from "@/components/ui/resilient-image"
import type { HubClubBadge } from "@/lib/hub-types"

/**
 * Club identity primitives for My Hub surfaces.
 *
 * Every aggregated hub item must make its club instantly recognizable —
 * these small components carry the club's logo (or an initial-based
 * fallback in the club's accent color) everywhere hub data appears.
 */

export function ClubTile({
  club,
  size = "md",
  className,
}: {
  club: Pick<HubClubBadge, "clubName" | "logoUrl" | "accentColor">
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const dims = size === "sm" ? "h-5 w-5 text-[9px] rounded-[6px]" : size === "lg" ? "h-11 w-11 text-sm rounded-xl" : "h-7 w-7 text-[11px] rounded-lg"
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden font-bold text-white",
        dims,
        className
      )}
      style={{ backgroundColor: club.accentColor }}
    >
      <ResilientImage
        src={club.logoUrl}
        alt=""
        name={club.clubName}
        className="h-full w-full object-cover"
      />
    </span>
  )
}

/** Inline pill: club tile + club name — used on every hub feed row. */
export function ClubChip({
  club,
  className,
  showName = true,
}: {
  club: Pick<HubClubBadge, "clubId" | "clubName" | "logoUrl" | "accentColor">
  className?: string
  showName?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 py-0.5 pl-0.5 pr-2.5",
        className
      )}
      title={club.clubName}
    >
      <ClubTile club={club} size="sm" />
      {showName && (
        <span className="truncate text-caption-medium text-muted-foreground">
          {club.clubName}
        </span>
      )}
    </span>
  )
}

/** Small accent dot — the minimal club marker for dense rows. */
export function ClubDot({
  club,
  className,
}: {
  club: Pick<HubClubBadge, "clubName" | "accentColor">
  className?: string
}) {
  return (
    <span
      aria-hidden
      title={club.clubName}
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: club.accentColor }}
    />
  )
}
