"use client"

import { useAppStore } from "@/lib/store"
import { PageHeader } from "@/components/shared/page-header"
import { Settings2 } from "lucide-react"
import {
  ClubLogoSection,
  ClubNameSection,
  ClubDescriptionSection,
  ClubGoalSection,
  PublicListingSection,
  DeleteClubSection,
} from "@/components/views/members-view"

/**
 * ============================================================================
 * ClubSettingsView — the Manage-tier home for a club's identity settings
 * ============================================================================
 *
 * §45 — the Members page used to carry seven club-settings sections above
 * the actual roster, burying the people. The settings now live HERE, in the
 * executive-only "Club settings" nav row (Manage tier), leaving Members
 * entirely about people (plus the join-gates that members ask about:
 * club code & password, public directory, pending join requests).
 *
 * Everything is a flat stack of quiet cards — one concern per card, in the
 * order an exec would actually touch them: identity (logo → name →
 * description), the club-wide hours goal, the public listing, and the
 * destructive zone at the very bottom.
 *
 * Club code & password deliberately stay on the MEMBERS page — they're how
 * people JOIN, so they belong next to the roster and the join-request queue.
 */
export function ClubSettingsView() {
  const clubId = useAppStore((s) => s.currentClubId)
  const clubName = useAppStore((s) => s.currentClub?.clubName)
  const isExec = useAppStore((s) => s.currentClub?.role) === "executive"

  if (!clubId) {
    return <div className="p-8 text-sm text-muted-foreground">No club selected.</div>
  }

  // The nav row is exec-only, but guard the view itself too — a stale
  // ?view=settings URL must never leak settings to a regular member.
  if (!isExec) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Only executives can manage club settings.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="hidden sm:block sticky top-0 z-20 bg-background/45 backdrop-blur-xl -mx-4 md:-mx-6 px-4 md:px-6 py-4 border-b border-border/60">
        <PageHeader
          title="Club settings"
          description={`Identity, goal, and listing for ${clubName ?? "your club"}`}
        />
      </div>
      <div className="sm:hidden">
        <PageHeader
          title="Club settings"
          description={`Identity, goal, and listing for ${clubName ?? "your club"}`}
        />
      </div>

      {/* Section grouping label — identity */}
      <h2 className="text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/70 flex items-center gap-1.5">
        <Settings2 className="h-3.5 w-3.5" /> Identity
      </h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ClubLogoSection clubId={clubId} />
        <ClubNameSection clubId={clubId} />
      </div>
      <ClubDescriptionSection clubId={clubId} />

      {/* Goal + visibility */}
      <h2 className="pt-1 text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        Goal &amp; visibility
      </h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ClubGoalSection clubId={clubId} />
        <PublicListingSection clubId={clubId} />
      </div>

      {/* Danger zone — visually separated, deliberately last */}
      <h2 className="pt-4 text-caption-medium uppercase tracking-[0.12em] text-muted-foreground/60">
        Danger zone
      </h2>
      <DeleteClubSection clubId={clubId} clubName={clubName ?? ""} />
    </div>
  )
}
